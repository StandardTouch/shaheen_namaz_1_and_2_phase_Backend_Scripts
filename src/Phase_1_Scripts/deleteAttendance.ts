// src/scripts/deleteAttendance.ts
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

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

/**
 * Delete all attendance records for specific student IDs
 * and reset their streak = 0
 */
export async function deleteAttendanceForStudents(studentIds: string[]) {
  console.log(`🗑️ Deleting attendance and resetting streak for ${studentIds.length} students...`);

  for (const studentId of studentIds) {
    try {
      // Delete attendance records
      const snapshot = await db.collection("Attendance")
        .where("studentId", "==", studentId)
        .get();

      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`✅ Deleted ${snapshot.size} attendance records for ${studentId}`);
      } else {
        console.log(`⚠️ No attendance found for ${studentId}`);
      }

      // Reset streak = 0
      const studentRef = db.collection("students").doc(studentId);
      await studentRef.update({
        streak: 0,
        streak_last_modified: Timestamp.now(),
      });

      console.log(`🔄 Streak reset to 0 for ${studentId}`);
    } catch (error) {
      console.error(`❌ Error cleaning student ${studentId}:`, error);
    }
  }

  console.log("🎉 Attendance cleanup + streak reset completed!");
}

/** ------------------- USAGE EXAMPLE ------------------- **/

const studentIds = [
  "32c1d423-caf2-4d6f-b8b0-433cde325165",
]; // replace with your test student IDs

deleteAttendanceForStudents(studentIds)
  .then(() => console.log("✅ Done deleting test attendance & resetting streak"))
  .catch((err) => console.error("❌ Delete failed:", err));
