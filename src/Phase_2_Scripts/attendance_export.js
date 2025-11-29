import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import ExcelJS from "exceljs";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load service account
const serviceAccountPath = "/home/maaz/Documents/shaheen_namaz_phase_1_and_2_Backend_and_frontend_scripts/Phase_2_key/service_account.json";
const serviceAccountJSON = JSON.parse(await readFile(serviceAccountPath, "utf-8"));

initializeApp({
  credential: cert(serviceAccountJSON),
});

const db = getFirestore();

// Student ID
const TARGET_STUDENT_ID = "f11ee527-3d63-4dc6-9561-644a4fb4c806";

// Date range
const START_DATE = new Date("2025-08-01T00:00:00");
const END_DATE = new Date();
END_DATE.setHours(23, 59, 59, 999);

// ---------------------------------------------------------
// SAFE IST DATE + TIME FORMATTERS
// ---------------------------------------------------------

// Safe IST date → YYYY-MM-DD (never throws error)
function formatISTDate(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return null;
  }

  // Convert UTC → IST manually (+5:30 hours)
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(dateObj.getTime() + IST_OFFSET);

  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Safe IST time → HH:MM AM/PM
function formatISTTime(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return "";
  }

  return dateObj.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

// ---------------------------------------------------------
// MAIN FUNCTION
// ---------------------------------------------------------

async function generateAttendanceCalendar() {
  console.log("Fetching attendance for:", TARGET_STUDENT_ID);

  const snapshot = await db
    .collection("Attendance")
    .where("studentId", "==", TARGET_STUDENT_ID)
    .get();

  const presentMap = {};

  snapshot.forEach((doc) => {
    const d = doc.data();
    const raw = d.attendance_time;

    // Skip missing or invalid Firestore timestamp
    if (!raw || typeof raw.toDate !== "function") {
      console.log("⚠️ Skipped invalid timestamp in doc:", doc.id);
      return;
    }

    const time = raw.toDate();

    if (!(time instanceof Date) || isNaN(time.getTime())) {
      console.log("⚠️ Invalid time value in doc:", doc.id);
      return;
    }

    const dateText = formatISTDate(time);
    if (!dateText) {
      console.log("⚠️ Skipped invalid formatted date in doc:", doc.id);
      return;
    }

    const timeText = formatISTTime(time);

    // Store Present record
    presentMap[dateText] = timeText;
  });

  // Create Excel workbook
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Attendance");

  // Header
  sheet.columns = [
    { header: "Date", key: "date", width: 15 },
    { header: "Time", key: "time", width: 15 },
    { header: "Status", key: "status", width: 10 },
  ];

  // Loop every day from START_DATE → today
  let current = new Date(START_DATE);

  while (current <= END_DATE) {
    const date = current.toISOString().split("T")[0]; // YYYY-MM-DD

    const isPresent = presentMap[date] !== undefined;

    const row = sheet.addRow({
      date: `'${date}`, // force text
      time: isPresent ? `'${presentMap[date]}` : "",
      status: isPresent ? "P" : "A",
    });

    const statusCell = row.getCell(3);

    if (isPresent) {
      // GREEN
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "00FF00" },
      };
      statusCell.font = { bold: true };
    } else {
      // RED
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0000" },
      };
      statusCell.font = { bold: true, color: { argb: "FFFFFF" } };
    }

    current.setDate(current.getDate() + 1);
  }

  const outputPath = path.join(
    __dirname,
    `md eqan maroof${TARGET_STUDENT_ID}.xlsx`
  );

  await workbook.xlsx.writeFile(outputPath);

  console.log(`✅ Attendance calendar created: ${outputPath}`);
}

generateAttendanceCalendar().catch(console.error);
