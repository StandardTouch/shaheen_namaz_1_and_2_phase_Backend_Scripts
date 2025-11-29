// singlepdf_lean.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, rgb } from "pdf-lib";
import XLSX from "xlsx";
import fontkit from "@pdf-lib/fontkit";

// ---------- CONFIG ----------
const COORDS = {
  name: { x: 332, y: 363, maxWidth: 200 },
  masjid: { x: 555, y: 363, maxWidth: 190 },
  cluster: { x: 282, y: 337, maxWidth: 70 },
  stars: { centerX: 415, y: 150, size: 54, gap: 8 },
};
const BASE_FONT_SIZE = 12;
// ----------------------------

// Resolve __dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths (adjust if needed)
const excelFile = path.join(__dirname, "global_unique_students_chilla_report(3).xlsx");
const pdfTemplatePath = path.join(__dirname, "Aao Namaz Padhen Certificates.pdf");
const fontPath = path.join(__dirname, "Philosopher", "Philosopher-BoldItalic.ttf");
const starPath = path.join(__dirname, "images", "wmremove-transformed-removebg-preview.png");
const outputRoot = path.join(__dirname, "certificates");
const outAllPdfPath = path.join(outputRoot, "All_Certificates.pdf");

if (!fs.existsSync(outputRoot)) fs.mkdirSync(outputRoot, { recursive: true });

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

const getCell = (row, ...keys) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
      return row[k];
    }
  }
  return "";
};

const main = async () => {
  // Load resources
  const fontBytes = fs.readFileSync(fontPath);
  const templateBytes = fs.readFileSync(pdfTemplatePath);
  const starBytes = fs.readFileSync(starPath);

  const isPng = /\.png$/i.test(starPath);
  const isJpg = /\.jpe?g$/i.test(starPath);
  if (!isPng && !isJpg) throw new Error("Star file must be PNG or JPG");

  // Load the template and embed its first page ONCE (reusable form XObject)
  const templatePdf = await PDFDocument.load(templateBytes);
  const templatePage0 = templatePdf.getPage(0);

  // Build the output PDF
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const customFont = await pdfDoc.embedFont(fontBytes);
  const starImage = isPng ? await pdfDoc.embedPng(starBytes) : await pdfDoc.embedJpg(starBytes);

  // Reusable embedded page
  const [embeddedTpl] = await pdfDoc.embedPages([templatePage0]);
  const tplWidth = embeddedTpl.width;
  const tplHeight = embeddedTpl.height;

  // Read Excel rows
  const workbook = XLSX.readFile(excelFile);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }); // keep as-is

  let count = 0;

  for (const row of rows) {
    const nameRaw = getCell(row, "Student Name", "Name");
    const masjidRaw = getCell(row, "Masjid Name", "Masjid");
    const clusterRaw = getCell(row, "Cluster Number", "Cluster", "clusterNumber");
    const starCountRaw = getCell(row, "Number of Certificates", "Certificates", "Stars");

    const nameText = toTitleCase(String(nameRaw || ""));
    const masjidText = toTitleCase(String(masjidRaw || ""));
    const clusterText = String(clusterRaw ?? "").trim() || "Unknown";
    const starCount = Math.max(0, parseInt(starCountRaw || 0, 10) || 0);

    // Create a new page with same size as template and draw the embedded template ONCE
    const page = pdfDoc.addPage([tplWidth, tplHeight]);
    page.drawPage(embeddedTpl, { x: 0, y: 0, width: tplWidth, height: tplHeight });

    // Draw texts (auto-sized)
    const nameSize = autoSize(customFont, nameText, BASE_FONT_SIZE, COORDS.name.maxWidth);
    const masjidSize = autoSize(customFont, masjidText, BASE_FONT_SIZE, COORDS.masjid.maxWidth);
    const clusterSize = autoSize(customFont, clusterText, BASE_FONT_SIZE, COORDS.cluster.maxWidth);

    page.drawText(nameText, { x: COORDS.name.x, y: COORDS.name.y, size: nameSize, font: customFont, color: rgb(0, 0, 0) });
    page.drawText(masjidText, { x: COORDS.masjid.x, y: COORDS.masjid.y, size: masjidSize, font: customFont, color: rgb(0, 0, 0) });
    page.drawText(clusterText, { x: COORDS.cluster.x, y: COORDS.cluster.y, size: clusterSize, font: customFont, color: rgb(0, 0, 0) });

    // Draw centered stars
    const { centerX, y: sy, size: sSize, gap } = COORDS.stars;
    const totalWidth = starCount > 0 ? starCount * sSize + (starCount - 1) * gap : 0;
    const startX = centerX - totalWidth / 2;

    for (let i = 0; i < starCount; i++) {
      page.drawImage(starImage, {
        x: startX + i * (sSize + gap),
        y: sy,
        width: sSize,
        height: sSize,
      });
    }

    count++;
  }

  // Save (object streams usually smaller; defaults are fine)
  const outBytes = await pdfDoc.save({ useObjectStreams: true });
  fs.writeFileSync(outAllPdfPath, outBytes);
  console.log(`✅ Created ${outAllPdfPath} (pages: ${count}, size: ${(outBytes.length/1e6).toFixed(1)} MB)`);
};

main().catch((e) => {
  console.error("❌ Error:", e);
});
