// Usage: node importMasjidFromExcel.js masjid.xlsx
import path from "path";
import xlsx from "xlsx";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const serviceAccount = require("./service_account.json");

// Initialize Firebase Admin with explicit credentials
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}
const db = getFirestore();

const [,, excelFile] = process.argv;
if (!excelFile) {
  console.error("Usage: node importMasjidFromExcel.js <excel-file>");
  process.exit(1);
}

const workbook = xlsx.readFile(path.resolve(excelFile));
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = xlsx.utils.sheet_to_json(sheet);

async function importMasjids() {
  for (const row of rows) {
    const documentId = row["Document ID"] || row["documentid"] || row["documentId"];
    const name = row["Name"] || row["name"];
    const clusterNumber = row["Cluster Number"] || row["clusternumber"] || row["clusterNumber"];
    if (!documentId || !name || !clusterNumber) {
      console.warn(`Skipping row due to missing fields: ${JSON.stringify(row)}`);
      continue;
    }
    await db.collection("Masjid").doc(String(documentId)).set({
      name,
      clusterNumber
    });
    console.log(`Imported Masjid: ${documentId} (${name}, Cluster: ${clusterNumber})`);
  }
  console.log("Import complete.");
}

importMasjids().catch(e => {
  console.error("Error importing masjids:", e);
  process.exit(1);
}); 