import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFile } from 'fs/promises';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔐 Load service account JSON
const serviceAccountPath = path.join(__dirname, '/home/maaz/Documents/shaheen_namaz_phase_1_and_2_Backend_and_frontend_scripts/Phase_2_key/service_account.json');
const serviceAccountJSON = JSON.parse(await readFile(serviceAccountPath, 'utf-8'));

// 🔥 Initialize Firebase
initializeApp({
  credential: cert(serviceAccountJSON),
});

const db = getFirestore();

async function exportTodayAttendance() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // Query for today's attendance
  const snapshot = await db.collection('Attendance')
    .where('attendance_time', '>=', Timestamp.fromDate(today))
    .where('attendance_time', '<', Timestamp.fromDate(tomorrow))
    .get();

  if (snapshot.empty) {
    console.log('No attendance records found for today.');
    return;
  }

  const data = snapshot.docs.map(doc => {
    const d = doc.data();
    return {
      Name: d.name || '',
      Masjid: d.masjid_details?.masjidName || '',
      Cluster: d.masjid_details?.clusterNumber || ''
    };
  });

  // Create a new workbook and sheet
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Today Attendance');

  // Save Excel file
  const outputPath = path.join(__dirname, `attendance_${today.toISOString().split('T')[0]}.xlsx`);
  XLSX.writeFile(workbook, outputPath);

  console.log(`✅ Attendance exported to: ${outputPath}`);
}

exportTodayAttendance().catch(console.error);
