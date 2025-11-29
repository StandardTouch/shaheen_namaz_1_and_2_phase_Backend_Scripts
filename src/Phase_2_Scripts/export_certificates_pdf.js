// Use case export certificate to PDF for students with exactly 1,2,3,4 certificate(s)
// Use it only in emergency cases we already have this same functionality in admin panel

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

async function exportPDFByCertificateCount() {
    try {
        // Get certificate count from command line argument
        const targetCount = parseInt(process.argv[2]);

        if (!targetCount || targetCount < 1) {
            console.error("❌ Please provide a valid certificate count as argument.");
            console.log("Usage: node export_pdf_by_count.js <count>");
            console.log("Examples:");
            console.log("  node export_pdf_by_count.js 1    (exactly 1 certificate)");
            console.log("  node export_pdf_by_count.js 2    (exactly 2 certificates)");
            console.log("  node export_pdf_by_count.js 3    (exactly 3 certificates)");
            console.log("  node export_pdf_by_count.js 4    (exactly 4 certificates)");
            process.exit(1);
        }

        console.log(`\n🎯 Exporting PDFs for students with exactly ${targetCount} certificate(s)...\n`);

        // Fetch all certificates from subcollections
        console.log("Fetching ALL certificates from subcollections...");
        const snapshot = await db.collectionGroup("certificates").get();

        if (snapshot.empty) {
            console.log("No certificates found.");
            return;
        }

        console.log(`Found ${snapshot.size} total certificates. Grouping by student...`);

        // Group certificates by student
        const studentMap = {};

        snapshot.forEach((doc) => {
            const data = doc.data();
            const studentId = data.studentId;

            if (!studentId) {
                console.log("❌ Missing studentId in doc:", doc.id);
                return;
            }

            if (!studentMap[studentId]) {
                studentMap[studentId] = {
                    studentId,
                    name: data.name || "",
                    dob: data.dob ? data.dob.toDate().toISOString().split("T")[0] : "",
                    guardianNumber: data.guardianNumber || "",
                    masjidName: data.masjid_details?.masjidName || "",
                    masjidId: data.masjid_details?.masjidId || "",
                    clusterNumber: data.masjid_details?.clusterNumber || 0,
                    certificates: [],
                    count: 0,
                };
            }

            // Store certificate details
            studentMap[studentId].certificates.push({
                date: data.time ? data.time.toDate() : new Date(),
                dateFormatted: data.time
                    ? (() => {
                        const d = data.time.toDate();
                        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
                    })()
                    : "Unknown Date",
            });
            studentMap[studentId].count++;
        });

        // Filter students with exact target count
        const students = Object.values(studentMap);
        const filteredStudents = students.filter((s) => s.count === targetCount);

        console.log(`\n📊 Statistics:`);
        console.log(`   Total students: ${students.length}`);
        console.log(`   Students with exactly ${targetCount} certificate(s): ${filteredStudents.length}`);

        if (filteredStudents.length === 0) {
            console.log(`\n❌ No students found with exactly ${targetCount} certificate(s).`);
            return;
        }

        // Sort certificates by date for each student (oldest first)
        filteredStudents.forEach((student) => {
            student.certificates.sort((a, b) => a.date - b.date);
        });

        // Load font
        const fontBytes = await fsPromises.readFile(FONT_PATH).catch((e) => {
            console.error("Error reading font:", e.message);
            return null;
        });

        console.log(`\n🎨 Generating PDFs...`);

        const masjidGroups = new Map();
        let processedCount = 0;

        // Generate PDF for each certificate of each student
        for (const student of filteredStudents) {
            for (const cert of student.certificates) {
                const templateBytes = await getLocalTemplateBuffer(student.clusterNumber);
                if (!templateBytes) {
                    console.warn(`⚠️  Skipping ${student.name} - Template not found for cluster ${student.clusterNumber}`);
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

                page.drawText(toTitleCase(student.name), {
                    x: COORDS.name.x,
                    y: COORDS.name.y,
                    size: autoSize(customFont, student.name, 58, COORDS.name.maxWidth),
                    font: customFont,
                    color: rgb(0, 0, 0),
                });
                page.drawText(cert.dateFormatted, {
                    x: COORDS.date.x,
                    y: COORDS.date.y,
                    size: autoSize(customFont, cert.dateFormatted, 45, COORDS.date.maxWidth),
                    font: customFont,
                    color: rgb(0, 0, 0),
                });
                page.drawText(toTitleCase(student.masjidName), {
                    x: COORDS.masjid.x,
                    y: COORDS.masjid.y,
                    size: autoSize(customFont, student.masjidName, 52, COORDS.masjid.maxWidth),
                    font: customFont,
                    color: rgb(0, 0, 0),
                });

                const pdfBytes = await pdfDoc.save();

                if (!masjidGroups.has(student.masjidName)) {
                    masjidGroups.set(student.masjidName, {
                        clusterNum: student.clusterNumber,
                        pdfs: []
                    });
                }
                masjidGroups.get(student.masjidName).pdfs.push(pdfBytes);

                processedCount++;
                process.stdout.write(".");
            }
        }

        console.log(`\n✅ Generated ${processedCount} PDF certificates.`);
        console.log(`\n📦 Merging PDFs by Masjid...`);

        // Save merged PDFs per masjid
        const masjidFiles = {};
        for (const [masjidName, { pdfs, clusterNum }] of masjidGroups.entries()) {
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

            masjidFiles[masjidName] = { path: masjidPath, clusterNum };
            console.log(`   ✓ Merged PDF for: ${masjidName} (${pdfs.length} certificates)`);
        }

        // Zip all masjid PDFs organized by cluster
        console.log(`\n📦 Creating ZIP file...`);
        const zipPath = path.join(OUTPUT_DIR, `certificates_count_${targetCount}_${Date.now()}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => {
            console.log(`\n✅ Success! ZIP file created: ${zipPath}`);
            console.log(`   Total size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Total masjids: ${Object.keys(masjidFiles).length}`);
            console.log(`   Total certificates: ${processedCount}`);
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
        console.error("❌ Error processing certificates:", error);
        process.exit(1);
    }
}

exportPDFByCertificateCount();
