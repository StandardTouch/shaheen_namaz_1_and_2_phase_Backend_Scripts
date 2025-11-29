// src/scripts/bulkAttendance.ts
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const STREAK_MODULO = 40;

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔐 Load service account JSON
const serviceAccountPath = path.join(__dirname, "../scripts/service_account.json");
const serviceAccountJSON = JSON.parse(await readFile(serviceAccountPath, "utf-8"));

// 🔥 Initialize Firebase
initializeApp({
  credential: cert(serviceAccountJSON),
});

const db = getFirestore();

function getRandomTimeBetween5to6(date: Date): Date {
  const newDate = new Date(date);
  const randomMinute = Math.floor(Math.random() * 60);   // 0–59
  const randomSecond = Math.floor(Math.random() * 60);   // 0–59
  newDate.setHours(5, randomMinute, randomSecond, 0);
  return newDate;
}


/** ------------------- HELPERS ------------------- **/

async function fetchStudentData(studentId: string) {
  const studentRef = db.collection("students").doc(studentId);
  const studentSnap = await studentRef.get();

  if (!studentSnap.exists) {
    throw new Error(`Student with ID ${studentId} not found`);
  }

  const studentData = studentSnap.data()!;
  return {
    studentId,
    class: studentData.class,
    displayName: studentData.name,
    guardianNumber: studentData.guardianNumber,
    masjid: db.doc(`Masjid/${studentData.masjid_details.masjidId}`),
    masjid_details: studentData.masjid_details,
    name: studentData.name,
    school: studentData.school_name || null,
    section: studentData.section,
    tracked_by: {
      name: studentData.volunteer?.volunteerName || "Unknown",
      userId: studentData.volunteer?.volunteerId || "system",
    },
  };
}

function createAttendanceRecord(studentData: any, date: Date): any {
  return {
    attendance_time: Timestamp.fromDate(date),
    class: studentData.class,
    displayName: studentData.displayName,
    guardianNumber: studentData.guardianNumber,
    masjid: studentData.masjid,
    masjid_details: studentData.masjid_details,
    name: studentData.name,
    school: studentData.school,
    section: studentData.section,
    studentId: studentData.studentId,
    tracked_by: studentData.tracked_by,
  };
}

/** ------------------- CORE LOGIC ------------------- **/

async function updateStreak(studentId: string) {
  const studentRef = db.collection("students").doc(studentId);
  const studentSnap = await studentRef.get();

  if (!studentSnap.exists) {
    throw new Error(`Student with ID ${studentId} not found`);
  }

  const attendanceSnapshot = await db
    .collection("Attendance")
    .where("studentId", "==", studentId)
    .get();

  const newStreak = attendanceSnapshot.size;
  const updatedStreak =
    newStreak % STREAK_MODULO === 0 ? STREAK_MODULO : newStreak % STREAK_MODULO;

  if (updatedStreak === STREAK_MODULO) {
    await generateCertificateForStudent(studentId);
    await studentRef.update({
      streak: 0,
      streak_last_modified: Timestamp.now(),
    });
    console.log(`🎓 Streak reached ${STREAK_MODULO}. Certificate issued for ${studentId}`);
  } else {
    await studentRef.update({
      streak: updatedStreak,
      streak_last_modified: Timestamp.now(),
    });
    console.log(`📈 Updated streak to ${updatedStreak} for ${studentId}`);
  }
}

async function generateCertificateForStudent(studentId: string) {
  const studentRef = db.collection("students").doc(studentId);
  const studentSnap = await studentRef.get();

  if (!studentSnap.exists) {
    throw new Error(`Student with ID ${studentId} not found`);
  }

  const studentData = studentSnap.data()!;
  const attendanceQuery = await db
    .collection("Attendance")
    .where("studentId", "==", studentId)
    .orderBy("attendance_time", "desc")
    .limit(1)
    .get();

  if (attendanceQuery.empty) {
    throw new Error(`No attendance records found for student ${studentId}`);
  }

  const latestAttendance = attendanceQuery.docs[0].data();
  const certificateDate = latestAttendance.attendance_time;

  await db.collection("certificates").add({
    studentId,
    name: studentData.name,
    guardianNumber: studentData.guardianNumber,
    masjid_details: studentData.masjid_details,
    dob: studentData.dob,
    time: certificateDate,
    special_program: studentData.special_program_eligible || false,
  });

  console.log(`✅ Certificate generated for ${studentId}`);
}

/**
 * Bulk add attendance for multiple students on a given date
 */
export async function bulkAddAttendance(studentIds: string[], startDate: Date, endDate: Date) {
  console.log(`🚀 Starting bulk attendance for ${studentIds.length} students from ${startDate.toDateString()} to ${endDate.toDateString()}`);

  // Loop through each date in the range
  for (
    let d = new Date(startDate);
    d <= endDate;
    d.setDate(d.getDate() + 1) // increment by 1 day
  ) {
    const baseDate = new Date(d); // clone so we don’t mutate
    const attendanceDate = getRandomTimeBetween5to6(baseDate);

    for (const studentId of studentIds) {
      try {
        const studentData = await fetchStudentData(studentId);
        const formattedDate = baseDate.toISOString().split("T")[0];
        const docId = `${studentId}_${formattedDate}`;
        const attendanceDocRef = db.collection("Attendance").doc(docId);

        const existingDoc = await attendanceDocRef.get();
        if (existingDoc.exists) {
          console.log(`⏩ Skipping ${studentId}, attendance already exists for ${formattedDate}`);
          continue;
        }

        const attendanceData = createAttendanceRecord(studentData, attendanceDate);
        await attendanceDocRef.set(attendanceData);
        console.log(`➕ Attendance added for ${studentId} on ${formattedDate} at ${attendanceDate.toLocaleTimeString()}`);

        await updateStreak(studentId);
      } catch (error) {
        console.error(`❌ Error for student ${studentId} on ${baseDate.toDateString()}:`, error);
      }
    }
  }

  console.log("🎉 Bulk attendance for range completed!");
}


/** ------------------- USAGE EXAMPLE ------------------- **/

const studentIds = [
 '32c1d423-caf2-4d6f-b8b0-433cde325165', // 32c1d423-caf2-4d6f-b8b0-433cde325165
]; // replace with your student IDs

const startDate = new Date("2025-08-01"); // 1st August
const endDate   = new Date("2025-08-10");

bulkAddAttendance(studentIds, startDate, endDate)
  .then(() => console.log("✅ Done"))
  .catch((err) => console.error("❌ Bulk failed:", err));
