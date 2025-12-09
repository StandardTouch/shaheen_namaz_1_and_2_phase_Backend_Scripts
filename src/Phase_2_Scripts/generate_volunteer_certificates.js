import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { fileURLToPath } from "url";

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load service account (Adjust path if needed, assumed same relative location as reference)
const serviceAccountPath = path.join(__dirname, "../../Phase_2_key/service_account.json");
const serviceAccountJSON = JSON.parse(await fsPromises.readFile(serviceAccountPath, "utf-8"));

if (!admin.apps.length) {
    initializeApp({
        credential: cert(serviceAccountJSON),
    });
}
import admin from "firebase-admin"; // Need this to check apps length if initialized elsewhere or just init once

const db = getFirestore();

// ---------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------
const TEMPLATE_PATH = path.join(__dirname, "../../images/volunteer_template/Certificate X.jpg");
// Font path - assuming same location as in generate_certificates_local.js
const FONT_PATH = path.join(__dirname, "../../Montserrat/Montserrat-SemiBoldItalic.ttf");
const OUTPUT_BASE_DIR = path.join(__dirname, "../../volunteer_certificates_output");

// X, Y Coordinates and Widths (Configurable)
// Based on image inspection and user request
// "Mr. [Name]" -> Name needs to be placed after "Mr."
// "organized at [Masjid]" -> Masjid needs to be placed after "organized at"
// Coordinates need to be passed in PDF points.
// Note: pdf-lib (0,0) is bottom-left.
// Reference script had: 3508 x 2481 resolution for A4 landscape @ 300dpi approx?
// Let's assume the template is similar resolution.

const PDF_WIDTH = 3508;
const PDF_HEIGHT = 2481;

// Initial guess for coordinates based on standard layouts and reference script
// User said: "after Mr there should be volunteer name"
// "then organized at majid name"
const COORDS = {
    name: {
        x: 1500, // Adjust horizontally to fit after "Mr."
        y: 1300, // Adjust vertically (from bottom)
        maxWidth: 1500,
        fontSize: 60
    },
    masjid: {
        x: 1150, // Adjust horizontally to fit after "organized at"
        y: 1100,  // Adjust vertically (lines below name usually)
        maxWidth: 1000,
        fontSize: 50
    }
};


// ---------------------------------------------------------
// CHILLA DEFINITIONS (Same as reference)
// ---------------------------------------------------------
const CHILLA_PERIODS = [
    {
        name: "1st Chilla",
        folderName: "1st_Chilla",
        startDate: new Date("2025-08-01T00:00:00"),
        endDate: new Date("2025-09-09T23:59:59"),
    },
    {
        name: "2nd Chilla",
        folderName: "2nd_Chilla",
        startDate: new Date("2025-09-10T00:00:00"),
        endDate: new Date("2025-10-19T23:59:59"),
    },
    {
        name: "3rd Chilla",
        folderName: "3rd_Chilla",
        startDate: new Date("2025-10-20T00:00:00"),
        endDate: new Date("2025-11-28T23:59:59"),
    }
];

const OVERALL_START = new Date("2025-08-01T00:00:00");
const OVERALL_END = new Date("2025-11-28T23:59:59");


// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------
function formatISTDate(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return null;
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(dateObj.getTime() + IST_OFFSET);
    return istDate.toISOString().split('T')[0];
}

function getTotalDays(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    return Math.round(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
}

function getMasjidDisplay(data) {
    if (data.masjidDetails && Array.isArray(data.masjidDetails) && data.masjidDetails.length > 0) {
        const masjids = data.masjidDetails.map(m => m?.masjidName).filter(n => n?.trim());
        return masjids.length > 1 ? "multiple masjids" : masjids[0] || "";
    }
    if (data.masjidDetails?.masjidName?.trim()) return data.masjidDetails.masjidName;
    if (data.managedMasjids && Array.isArray(data.managedMasjids)) {
        const masjids = data.managedMasjids.map(m => m?.masjidName).filter(n => n?.trim());
        return masjids.length > 1 ? "multiple masjids" : masjids[0] || "";
    }
    return data.assignedMasjid?.masjidName || "";
}

const toTitleCase = (str) =>
    str ? str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";


// ---------------------------------------------------------
// FETCH DATA
// ---------------------------------------------------------
async function fetchVolunteerUsers() {
    console.log("Fetching volunteers...");
    const snapshot = await db.collection("Users").get();
    const volunteers = new Map();
    snapshot.forEach(doc => {
        const data = doc.data();
        volunteers.set(doc.id, {
            id: doc.id,
            name: data.name || data.displayName || "Unknown",
            masjid: getMasjidDisplay(data)
        });
    });
    console.log(`Found ${volunteers.size} users.`);
    return volunteers;
}

async function fetchAttendance(volunteers) {
    console.log("Fetching attendance...");
    const snapshot = await db.collection("Attendance")
        .where("attendance_time", ">=", OVERALL_START)
        .where("attendance_time", "<=", OVERALL_END)
        .get();

    const attendance = {}; // { userId: { dateString: count } }

    snapshot.forEach(doc => {
        const data = doc.data();
        const userId = data.tracked_by?.userId;
        if (!userId || !volunteers.has(userId)) return;

        const date = data.attendance_time?.toDate();
        if (!date) return;

        const dateStr = formatISTDate(date);
        if (!dateStr) return;

        if (!attendance[userId]) attendance[userId] = {};
        if (!attendance[userId][dateStr]) attendance[userId][dateStr] = 0;
        attendance[userId][dateStr]++;
    });
    return attendance;
}

// ---------------------------------------------------------
// PDF GENERATION
// ---------------------------------------------------------
async function generateCertificate(volunteer, chillaName, templateBuffer, fontBytes) {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const image = await pdfDoc.embedJpg(templateBuffer);
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

    const font = fontBytes ? await pdfDoc.embedFont(fontBytes) : await pdfDoc.embedFont(PDFDocument.StandardFonts.Helvetica);

    // Draw Name
    const nameText = toTitleCase(volunteer.name);
    // Simple centering logic or fixed position? 
    // User said "after Mr". Assuming left-aligned at a specific X is safer than centering if "Mr" is pre-printed.
    // If "Mr................" is a line, we might want to center on that line.

    // Let's use the layout check mode first (logging coord)

    page.drawText(nameText, {
        x: COORDS.name.x,
        y: COORDS.name.y,
        size: COORDS.name.fontSize,
        font: font,
        color: rgb(0, 0, 0), // Black
    });

    // Draw Masjid
    const masjidText = toTitleCase(volunteer.masjid);
    page.drawText(masjidText, {
        x: COORDS.masjid.x,
        y: COORDS.masjid.y,
        size: COORDS.masjid.fontSize,
        font: font,
        color: rgb(0, 0, 0),
    });

    return await pdfDoc.save();
}

// ---------------------------------------------------------
// MAIN
// ---------------------------------------------------------
async function main() {
    const args = process.argv.slice(2);
    const limit = args.find(a => a.startsWith("--limit=")) ? parseInt(args.find(a => a.startsWith("--limit=")).split('=')[1]) : Infinity;

    console.log("Starting Certificate Generation...");

    // Ensure output dir
    if (!fs.existsSync(OUTPUT_BASE_DIR)) fs.mkdirSync(OUTPUT_BASE_DIR, { recursive: true });

    // Load resources
    const templateBuffer = await fsPromises.readFile(TEMPLATE_PATH);
    let fontBytes = null;
    try {
        fontBytes = await fsPromises.readFile(FONT_PATH);
    } catch (e) {
        console.warn("Custom font not found, using standard font.");
    }

    const volunteers = await fetchVolunteerUsers();
    const attendance = await fetchAttendance(volunteers);

    let processedCount = 0;

    for (const chilla of CHILLA_PERIODS) {
        console.log(`Processing ${chilla.name}...`);
        const chillaDir = path.join(OUTPUT_BASE_DIR, chilla.folderName);
        if (!fs.existsSync(chillaDir)) fs.mkdirSync(chillaDir);

        const totalDays = getTotalDays(chilla.startDate, chilla.endDate);

        for (const [userId, volunteer] of volunteers.entries()) {
            if (processedCount >= limit) break;

            const userAttendance = attendance[userId] || {};
            // Filter attendance for current chilla date range
            const daysWorked = Object.keys(userAttendance).filter(d => {
                const date = new Date(d);
                return date >= chilla.startDate && date <= chilla.endDate;
            }).length;

            const percentage = (daysWorked / totalDays) * 100;

            if (percentage >= 70) {
                console.log(`Generating for ${volunteer.name} (${percentage.toFixed(1)}%)`);
                try {
                    const pdfBytes = await generateCertificate(volunteer, chilla.name, templateBuffer, fontBytes);
                    const safeName = volunteer.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const filename = `${safeName}_${volunteer.id}.pdf`;
                    await fsPromises.writeFile(path.join(chillaDir, filename), pdfBytes);
                    processedCount++;
                } catch (err) {
                    console.error(`Failed to generate for ${volunteer.name}:`, err);
                }
            }
        }
    }

    console.log(`\nDone. Generated ${processedCount} certificates.`);
}

main().catch(console.error);
