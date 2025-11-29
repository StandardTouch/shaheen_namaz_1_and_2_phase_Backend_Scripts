// generatecertificate.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, rgb } from "pdf-lib";
import XLSX from "xlsx";
import fontkit from "@pdf-lib/fontkit";

// ---------- CONFIG (tweak as needed) ----------
const COORDS = {
  name: { x: 332, y: 363, maxWidth: 200 }, // student name
  masjid: { x: 555, y: 363, maxWidth: 190 }, // masjid name
  cluster: { x: 282, y: 337, maxWidth: 70 }, // cluster number
  stars: { centerX: 415, y: 150, size: 54, gap: 8 }, // centered stars row
};
const BASE_FONT_SIZE = 12;
// ---------------------------------------------

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File paths (adjust if your filenames differ)
const excelFile = path.join(
  __dirname,
  "global_unique_students_chilla_report(3) (2).xlsx"
);
const pdfTemplatePath = path.join(
  __dirname,
  "Aao Namaz Padhen Certificates.pdf"
);
const fontPath = path.join(
  __dirname,
  "Philosopher",
  "Philosopher-BoldItalic.ttf"
);
// Place a PNG/JPG star at this path:
const starPath = path.join(
  __dirname,
  "images",
  "wmremove-transformed-removebg-preview.png"
);
const outputDir = path.join(__dirname, "certificates");

// Ensure output directory exists
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// Helpers
const toTitleCase = (str) =>
  str ? str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";

const sanitizeFilename = (s) =>
  (s || "certificate").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 120);

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
  // tries multiple header names; returns first non-empty value
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "")
      return row[k];
  }
  return "";
};

const main = async () => {
  // Load resources
  const fontBytes = fs.readFileSync(fontPath);
  const templateBytes = fs.readFileSync(pdfTemplatePath);
  const starBytes = fs.readFileSync(starPath);

  // Embed-friendly star image type
  const isPng = /\.png$/i.test(starPath);
  const isJpg = /\.jpe?g$/i.test(starPath);
  if (!isPng && !isJpg) throw new Error("Star file must be PNG or JPG");

  // Read Excel
  const workbook = XLSX.readFile(excelFile);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  for (const row of rows) {
    // Map Excel headers -> our fields (supports both your new and old headers)
    const nameRaw = getCell(row, "Student Name", "Name");
    const masjidRaw = getCell(row, "Masjid Name", "Masjid");
    const clusterRaw = getCell(
      row,
      "Cluster Number",
      "Cluster",
      "clusterNumber"
    );
    const starCountRaw = getCell(
      row,
      "Number of Certificates",
      "Certificates",
      "Stars"
    );

    const nameText = toTitleCase(String(nameRaw || ""));
    const masjidText = toTitleCase(String(masjidRaw || ""));
    const clusterText = String(clusterRaw ?? "").trim();
    const starCount = Math.max(0, parseInt(starCountRaw || 0, 10) || 0);

    // Build PDF
    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);

    const customFont = await pdfDoc.embedFont(fontBytes);
    const page = pdfDoc.getPages()[0];

    // Auto-shrink text to fit
    const nameSize = autoSize(
      customFont,
      nameText,
      BASE_FONT_SIZE,
      COORDS.name.maxWidth
    );
    const masjidSize = autoSize(
      customFont,
      masjidText,
      BASE_FONT_SIZE,
      COORDS.masjid.maxWidth
    );
    const clusterSize = autoSize(
      customFont,
      clusterText,
      BASE_FONT_SIZE,
      COORDS.cluster.maxWidth
    );

    // Draw text
    page.drawText(nameText, {
      x: COORDS.name.x,
      y: COORDS.name.y,
      size: nameSize,
      font: customFont,
      color: rgb(0, 0, 0),
    });
    page.drawText(masjidText, {
      x: COORDS.masjid.x,
      y: COORDS.masjid.y,
      size: masjidSize,
      font: customFont,
      color: rgb(0, 0, 0),
    });
    page.drawText(clusterText, {
      x: COORDS.cluster.x,
      y: COORDS.cluster.y,
      size: clusterSize,
      font: customFont,
      color: rgb(0, 0, 0),
    });

    // Embed star image
    const starImage = isPng
      ? await pdfDoc.embedPng(starBytes)
      : await pdfDoc.embedJpg(starBytes);

    // Center the stars horizontally at centerX
    const { centerX, y: sy, size: sSize, gap } = COORDS.stars;
    const totalWidth =
      starCount > 0 ? starCount * sSize + (starCount - 1) * gap : 0;
    const startX = centerX - totalWidth / 2;

    for (let i = 0; i < starCount; i++) {
      page.drawImage(starImage, {
        x: startX + i * (sSize + gap),
        y: sy,
        width: sSize,
        height: sSize,
      });
    }

    // Save PDF
    const outName = sanitizeFilename(nameText);
    const outPath = path.join(outputDir, `${outName}.pdf`);
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outPath, pdfBytes);
    console.log(`✅ Created: ${outPath}  (stars: ${starCount})`);
  }
};

main().catch(console.error);
