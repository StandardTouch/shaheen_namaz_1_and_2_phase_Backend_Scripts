// export_student_attendance_matrix_styled_join_students.mjs
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFile } from "fs/promises";
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

// ====== CONFIG ======
const ATTENDANCE_COLLECTION = "Attendance";
const STUDENTS_COLLECTION = "students";
const START_DATE_ISO = "2025-08-01";   // inclusive (IST)
const END_DATE_ISO = '2025-09-29';             // set like "2025-09-01" (inclusive) or leave null
const NUM_DAYS = 40;                   // used only when END_DATE_ISO is null
const SHEET_NAME = "Special Program Attendance";
const FILE_PREFIX = "student_attendance_styled";
const SERVICE_ACCOUNT_PATH = "../scripts/service_account.json";

// ====== Setup ======
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceAccountJSON = JSON.parse(
  await readFile(path.join(__dirname, SERVICE_ACCOUNT_PATH), "utf-8")
);
initializeApp({ credential: cert(serviceAccountJSON) });
const db = getFirestore();

// ====== Helpers ======
const toTitleCase = (str) =>
  str ? str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";

const istDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const formatISTYYYYMMDD = (date) => istDayFormatter.format(date);

const pickString = (x) => (x == null ? "" : String(x));
const getMasjidNameFrom = (obj) => toTitleCase(obj?.masjid_details?.masjidName || "");
const getClusterFrom = (obj) => {
  const c = obj?.masjid_details?.clusterNumber;
  return c == null ? "" : String(c);
};

// --- simple range builder: if END_DATE_ISO set, use it (inclusive). else use NUM_DAYS ---
function istMidnight(dateISO) {
  return new Date(`${dateISO}T00:00:00+05:30`);
}
function buildDateRangeIST(startIso, endIsoInclusive, numDays) {
  const start = istMidnight(startIso);
  let days, endExclusive;
  if (endIsoInclusive) {
    const endInc = istMidnight(endIsoInclusive);           // inclusive
    days = Math.floor((endInc - start) / 86400000) + 1;    // inclusive count
    endExclusive = new Date(endInc.getTime() + 86400000);  // next day
  } else {
    days = numDays;
    endExclusive = new Date(start.getTime() + days * 86400000);
  }
  const dateKeys = Array.from({ length: days }, (_, i) =>
    formatISTYYYYMMDD(new Date(start.getTime() + i * 86400000))
  );
  return { dateKeys, start, endExclusive, days };
}

// ====== Styles (exceljs ARGB) ======
const COLOR_PRESENT = "FF92D050"; // #92d050
const COLOR_ABSENT  = "FFFF6B6B"; // #ff6b6b
const center = { horizontal: "center", vertical: "middle" };
const presentFill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_PRESENT } };
const absentFill  = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ABSENT } };

// ====== Main ======
async function exportAttendanceMatrixStyled() {
  // pick range based on END_DATE_ISO or NUM_DAYS
  const { dateKeys, start, endExclusive, days } = buildDateRangeIST(
    START_DATE_ISO,
    END_DATE_ISO,
    NUM_DAYS
  );
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(endExclusive);

  // 1) Load attendance in window
  const snap = await db
    .collection(ATTENDANCE_COLLECTION)
    .where("attendance_time", ">=", startTs)
    .where("attendance_time", "<", endTs)
    .get();

  if (snap.empty) {
    console.log("⚠️ No attendance found in the given window.");
    return;
  }

  // 2) Collect unique studentIds
  const attendanceRecords = [];
  const studentIdSet = new Set();
  for (const doc of snap.docs) {
    const a = doc.data();
    const studentId = pickString(a?.studentId);
    if (!studentId) continue;
    attendanceRecords.push(a);
    studentIdSet.add(studentId);
  }
  const studentIds = [...studentIdSet];

  // 3) Join students/{studentId}
  const studentRefs = studentIds.map((sid) => db.collection(STUDENTS_COLLECTION).doc(sid));
  const studentDocs = await db.getAll(...studentRefs);
  const studentMap = new Map();
  studentDocs.forEach((sd, idx) => {
    const sid = studentIds[idx];
    studentMap.set(sid, sd.exists ? sd.data() : null);
  });

  // 4) Build per-student rows
  const perStudent = new Map();
  for (const a of attendanceRecords) {
    const studentId = pickString(a.studentId);
    const attDate = a?.attendance_time?.toDate?.()
      ? a.attendance_time.toDate()
      : new Date(a?.attendance_time);
    if (!(attDate instanceof Date) || isNaN(attDate.getTime())) continue;
    const dayKey = formatISTYYYYMMDD(attDate);

    const stu = studentMap.get(studentId);

    if (!perStudent.has(studentId)) {
      const name = toTitleCase(a?.name || stu?.name || "");
      const guardianName = toTitleCase(stu?.guardianName || ""); // from students
      const guardianNumber = pickString(a?.guardianNumber || stu?.guardianNumber || "");
      const klass = pickString(a?.class || stu?.class || "");
      const masjidName = getMasjidNameFrom(a) || getMasjidNameFrom(stu) || "Unknown Masjid";
      const cluster = getClusterFrom(a) || getClusterFrom(stu) || "";

      perStudent.set(studentId, {
        studentId,
        name,
        guardianName,
        guardianNumber,
        class: klass,
        masjidName,
        cluster,
        days: Object.fromEntries(dateKeys.map((k) => [k, false])),
        total: 0,
      });
    }

    const row = perStudent.get(studentId);
    if (row.days.hasOwnProperty(dayKey) && row.days[dayKey] === false) {
      row.days[dayKey] = true;
      row.total += 1;
    }
  }

  const students = [...perStudent.values()].sort((a, b) => {
    const byCluster = (a.cluster || "").localeCompare(b.cluster || "");
    if (byCluster !== 0) return byCluster;
    const byMasjid = (a.masjidName || "").localeCompare(b.masjidName || "");
    if (byMasjid !== 0) return byMasjid;
    return (a.name || "").localeCompare(b.name || "");
  });

  // 5) Excel
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", xSplit: 7, ySplit: 1 }] });

  const headers = [
    "Student ID", "Name", "Guardian Name", "Guardian Number",
    "Class", "Masjid", "Cluster",
    ...dateKeys, "Total Present",
  ];
  ws.addRow(headers);

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = center;
  headerRow.height = 24;

  const widths = [20,22,22,18,10,38,10, ...dateKeys.map(() => 12), 14];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  for (const s of students) {
    const base = [
      s.studentId, s.name, s.guardianName, s.guardianNumber,
      s.class, s.masjidName, s.cluster,
    ];
    const row = ws.addRow([
      ...base,
      ...dateKeys.map((k) => (s.days[k] ? "P" : "A")),
      String(s.total),
    ]);
    row.getCell(7).alignment = center;

    const firstDateCol = 8;
    for (let i = 0; i < dateKeys.length; i++) {
      const c = row.getCell(firstDateCol + i);
      const isPresent = s.days[dateKeys[i]] === true;
      c.alignment = center;
      c.font = { bold: true };
      c.fill = isPresent ? presentFill : absentFill;
    }
    const totalCell = row.getCell(firstDateCol + dateKeys.length);
    totalCell.alignment = center;
    totalCell.font = { bold: true };
  }

  const outPath = path.join(
    __dirname,
    END_DATE_ISO
      ? `${FILE_PREFIX}_${START_DATE_ISO}_to_${END_DATE_ISO}.xlsx`
      : `${FILE_PREFIX}_${START_DATE_ISO}_+${NUM_DAYS}d.xlsx`
  );
  await wb.xlsx.writeFile(outPath);

  console.log(`✅ Attendance matrix exported: ${outPath}`);
  console.log(`ℹ️ Students: ${students.length}, Date columns: ${dateKeys.length}`);
}

exportAttendanceMatrixStyled().catch((err) => {
  console.error("❌ Error exporting attendance:", err);
});
