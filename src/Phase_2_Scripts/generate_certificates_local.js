import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import archiver from "archiver";
import { fileURLToPath } from "url";

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const SERVICE_ACCOUNT_PATH = "/home/maaz/Documents/shaheen_namaz_phase_1_and_2_Backend_and_frontend_scripts/Phase_2_key/service_account.json";
const TEMPLATES_DIR = path.join(__dirname, "../templates/certificates");
const FONT_PATH = path.join(__dirname, "../Montserrat/Montserrat-SemiBoldItalic.ttf");
const OUTPUT_DIR = path.join(__dirname, "../output_certificates");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Initialize Firebase
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

// Helpers
const toTitleCase = (str) =>
    str ? str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";

const autoSize = (font, text, baseSize, maxWidth) => {
    if (!text || !maxWidth) return baseSize;
    let size = baseSize;
    let width = font.widthOfTextAtSize(text, size);
    while (width > maxWidth && size > 7) {
        size -= 0.5;
        width = font.widthOfTextAtSize(text, size);
    }
    return size;
};

async function getLocalTemplateBuffer(clusterNum) {
    try {
        const fileName = `cluster_${String(clusterNum).padStart(2, "0")}_certificate.jpg`;
        const filePath = path.join(TEMPLATES_DIR, fileName);
        return await fsPromises.readFile(filePath);
    } catch (err) {
        console.error(`Error reading template for cluster ${clusterNum}:`, err.message);
        return null;
    }
}

async function main() {
    try {
        console.log("Starting certificate generation...");

        // Define Date Range (Modify as needed)
        // Example: Last 40 days or specific range
        const startDate = new Date("2024-01-01"); // Adjust this date
        const endDate = new Date(); // Today

        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        console.log(`Fetching certificates between ${startDate.toDateString()} and ${endDate.toDateString()}...`);

        const certificatesSnapshot = await db
            .collection("certificates")
            .where("time", ">=", startTimestamp)
            .where("time", "<=", endTimestamp)
            .get();

        if (certificatesSnapshot.empty) {
            console.log("No certificates found in the specified date range.");
            return;
        }

        console.log(`Found ${certificatesSnapshot.size} certificates. Processing...`);

        const fontBytes = await fsPromises.readFile(FONT_PATH).catch((e) => {
            console.error("Error reading font:", e.message);
            return null;
        });

        const masjidGroups = new Map();

        for (const doc of certificatesSnapshot.docs) {
            const cert = { id: doc.id, ...doc.data() };
            const clusterNum = cert.masjid_details?.clusterNumber || 0;
            const masjidName = cert.masjid_details?.masjidName || "UnknownMasjid";
            const studentName = cert.name || "Unnamed";
            const certificateDate =
                cert.time?.toDate()
                    ? (() => {
                        const d = cert.time.toDate();
                        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
                    })()
                    : "Unknown Date";

            const templateBytes = await getLocalTemplateBuffer(clusterNum);
            if (!templateBytes) {
                console.warn(`Skipping ${studentName} - Template not found for cluster ${clusterNum}`);
                continue;
            }

            const pdfDoc = await PDFDocument.create();
            if (fontBytes) pdfDoc.registerFontkit(fontkit);
            const page = pdfDoc.addPage([3508, 2481]);

            const jpgImage = await pdfDoc.embedJpg(templateBytes);
            page.drawImage(jpgImage, { x: 0, y: 0, width: 3508, height: 2481 });

            const customFont = fontBytes
                ? await pdfDoc.embedFont(fontBytes)
                : await pdfDoc.embedFont(PDFDocument.StandardFonts.Helvetica);

            const COORDS = {
                name: { x: 1700, y: 2481 - 1315, maxWidth: 1300 },
                masjid: { x: 2200, y: 2481 - 1530, maxWidth: 1300 },
                date: { x: 1200, y: 2481 - 1530, maxWidth: 650 },
            };

            page.drawText(toTitleCase(studentName), {
                x: COORDS.name.x,
                y: COORDS.name.y,
                size: autoSize(customFont, studentName, 58, COORDS.name.maxWidth),
                font: customFont,
                color: rgb(0, 0, 0),
            });
            page.drawText(certificateDate, {
                x: COORDS.date.x,
                y: COORDS.date.y,
                size: autoSize(customFont, certificateDate, 45, COORDS.date.maxWidth),
                font: customFont,
                color: rgb(0, 0, 0),
            });
            page.drawText(toTitleCase(masjidName), {
                x: COORDS.masjid.x,
                y: COORDS.masjid.y,
                size: autoSize(customFont, masjidName, 52, COORDS.masjid.maxWidth),
                font: customFont,
                color: rgb(0, 0, 0),
            });

            const pdfBytes = await pdfDoc.save();

            if (!masjidGroups.has(masjidName)) {
                masjidGroups.set(masjidName, { clusterNum, pdfs: [] });
            }
            masjidGroups.get(masjidName).pdfs.push(pdfBytes);
            process.stdout.write("."); // Progress indicator
        }
        console.log("\nPDF generation complete. Merging per Masjid...");

        // Save merged PDFs per masjid
        const masjidFiles = {};
        for (const [masjidName, { pdfs }] of masjidGroups.entries()) {
            const masjidPdf = await PDFDocument.create();
            if (fontBytes) masjidPdf.registerFontkit(fontkit);

            for (const certBytes of pdfs) {
                const tempPdf = await PDFDocument.load(certBytes);
                const copiedPages = await masjidPdf.copyPages(
                    tempPdf,
                    tempPdf.getPageIndices()
                );
                copiedPages.forEach((p) => masjidPdf.addPage(p));
            }

            const masjidBytes = await masjidPdf.save();
            const masjidPath = path.join(OUTPUT_DIR, `All_${masjidName.replace(/\//g, "-")}.pdf`);
            await fsPromises.writeFile(masjidPath, masjidBytes);

            masjidFiles[masjidName] = { path: masjidPath, clusterNum: masjidGroups.get(masjidName).clusterNum };
            console.log(`Saved merged PDF for: ${masjidName}`);
        }

        // Zip all masjid PDFs
        console.log("Zipping files...");
        const zipPath = path.join(OUTPUT_DIR, `certificates_export_${Date.now()}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => {
            console.log(`\n✅ Success! Zip file created: ${zipPath}`);
            console.log(`Total bytes: ${archive.pointer()}`);
        });

        archive.on("error", (err) => {
            throw err;
        });

        archive.pipe(output);

        for (const [masjidName, { path: pdfPath, clusterNum }] of Object.entries(masjidFiles)) {
            const clusterFolder = `clusters/cluster_${String(clusterNum).padStart(2, "0")}`;
            archive.file(pdfPath, { name: `${clusterFolder}/${masjidName.replace(/\//g, "-")}.pdf` });
        }

        await archive.finalize();

    } catch (error) {
        console.error("Error processing certificates:", error);
    }
}

main();
