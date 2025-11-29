// export_winner_volunteers_to_excel.mjs
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "fs/promises";
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

// ---------- Helpers ----------
const toTitleCase = (str) =>
  str ? str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔐 Load service account JSON
const serviceAccountPath = path.join(__dirname, "../scripts-1/service_account.json");
const serviceAccountJSON = JSON.parse(await readFile(serviceAccountPath, "utf-8"));

// 🔥 Initialize Firebase
initializeApp({ credential: cert(serviceAccountJSON) });
const db = getFirestore();

function firstMasjid(userDoc) {
  const md = userDoc?.masjid_details;
  if (!md) return null;
  return Array.isArray(md) ? (md[0] || null) : (typeof md === "object" ? md : null);
}

function deriveNameFromUser(userDoc) {
  const top = userDoc?.name;
  const m0 = firstMasjid(userDoc)?.name;
  return toTitleCase(top || m0 || "Unnamed");
}

function derivePhoneFromUser(userDoc) {
  // Only top-level users.phone_number
  return userDoc?.phone_number ? String(userDoc.phone_number) : "";
}

function deriveMasjidFromUser(userDoc) {
  const m0 = firstMasjid(userDoc)?.masjidName;
  return toTitleCase(m0 || "Unknown Masjid");
}

function deriveClusterFromUser(userDoc) {
  const c = firstMasjid(userDoc)?.clusterNumber;
  return (c ?? "").toString();
}

async function exportVolunteerWinnersToExcel() {
  try {
    // 1) Read winners and take the *field* `id` (user UID) from each doc
    const winnersSnap = await db
      .collection("winners_volunteers")
      .where("type", "==", "volunteer")
      .get();

    if (winnersSnap.empty) {
      console.log("⚠️ No volunteer winners found.");
      return;
    }

    const missingIdDocs = [];
    const userIdsRaw = winnersSnap.docs.map((d) => {
      const data = d.data() || {};
      const uid = data.id; // <-- THIS is the field you want
      
      if (!uid) missingIdDocs.push(d.id);
      return uid ? String(uid) : null;
    }).filter(Boolean);

    // Deduplicate in case multiple winners reference the same user
    const userIds = [...new Set(userIdsRaw)];

    console.log(userIds)

    console.log(`👉 Using ${userIds.length} user IDs from winners_volunteers.id`);
    if (missingIdDocs.length) {
      console.log("⚠️ winners_volunteers docs missing field 'id':",
        missingIdDocs.slice(0, 10),
        missingIdDocs.length > 10 ? `(+${missingIdDocs.length - 10} more)` : ""
      );
    }

    // 2) Batch fetch users/{id}
    const refs = userIds.map((uid) => db.collection("Users").doc(uid));
    const userDocs = await db.getAll(...refs);

    // For stable row order, iterate userDocs in same order as userIds
    const rows = userDocs.map((ud, idx) => {
      if (!ud.exists) {
        // user missing for that winners_volunteers.id
        return {
          "Name": "Unknown",
          "Phone Number": "",
          "Masjid Name": "Unknown Masjid",
          "Cluster Number": "",
        };
      }
      const user = ud.data();
      return {
        "Name": deriveNameFromUser(user),
        "Phone Number": derivePhoneFromUser(user),
        "Masjid Name": deriveMasjidFromUser(user),
        "Cluster Number": deriveClusterFromUser(user),
      };
    });

    // 3) Build Excel
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, { skipHeader: false });

    // Force "Phone Number" to text so leading + is preserved
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: 1 }); // column 1: Phone Number
      const cell = worksheet[cellRef];
      if (cell && cell.v !== undefined) cell.t = "s";
    }

    worksheet["!cols"] = [
      { wch: 28 }, // Name
      { wch: 20 }, // Phone Number
      { wch: 28 }, // Masjid Name
      { wch: 16 }, // Cluster Number
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Volunteer Winners");

    const outputPath = path.join(
      __dirname,
      `volunteer_winners_${new Date().toISOString().split("T")[0]}.xlsx`
    );
    XLSX.writeFile(workbook, outputPath);

    console.log(`✅ Volunteer winners exported to: ${outputPath}`);
    console.log(`ℹ️ Rows: ${rows.length}`);
  } catch (err) {
    console.error("❌ Error exporting volunteer winners:", err);
  }
}

exportVolunteerWinnersToExcel();
