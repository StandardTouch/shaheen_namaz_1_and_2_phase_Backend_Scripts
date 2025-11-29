//Use case: Export all certificates from subcollections to Excel files for each certificate count
//Use it only in emergency cases we already have this same functionality in admin panel

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import XLSX from "xlsx";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load service account JSON
const serviceAccountPath = "/home/maaz/Documents/shaheen_namaz_phase_1_and_2_Backend_and_frontend_scripts/Phase_2_key/service_account.json";
const serviceAccountJSON = JSON.parse(await readFile(serviceAccountPath, "utf-8"));

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccountJSON),
});

const db = getFirestore();

async function exportCertificates() {
  console.log("Fetching ALL certificates from subcollections...");

  // Read nested certificate documents
  const snapshot = await db.collectionGroup("certificates").get();

  if (snapshot.empty) {
    console.log("No certificates found.");
    return;
  }

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
        clusterNumber: data.masjid_details?.clusterNumber || "",

        // internal only — WILL NOT be exported
        dates: [],

        count: 0,
      };
    }

    // Convert timestamp to YYYY-MM-DD
    const dateOnly = data.time
      ? data.time.toDate().toISOString().split("T")[0]
      : "";

    // Store certificate date internally
    studentMap[studentId].dates.push(dateOnly);
    studentMap[studentId].count++;
  });

  const students = Object.values(studentMap);

  // Group students by exact certificate count
  const studentsByCount = {};
  students.forEach((student) => {
    const count = student.count;
    if (!studentsByCount[count]) {
      studentsByCount[count] = [];
    }
    studentsByCount[count].push(student);
  });

  // Log statistics
  const counts = Object.keys(studentsByCount).sort((a, b) => parseInt(a) - parseInt(b));
  counts.forEach(count => {
    console.log(`${count} certificate(s):`, studentsByCount[count].length);
  });

  // Generate Excel file for each count
  counts.forEach(count => {
    const studentsWithCount = studentsByCount[count];
    const countNum = parseInt(count);

    // Format student data
    const formattedStudents = studentsWithCount.map((s) => {
      const row = {
        studentId: s.studentId,
        name: s.name,
        dob: s.dob,
        guardianNumber: s.guardianNumber,
        masjidName: s.masjidName,
        masjidId: s.masjidId,
        clusterNumber: s.clusterNumber,
      };

      // Add certificate dates
      s.dates.sort(); // Sort dates (oldest -> newest)
      s.dates.forEach((d, i) => {
        row[`chillaCompletedOn_${i + 1}`] = d;
      });

      return row;
    });

    // Generate summary sheets
    const clusterCount = getCountByCluster(studentsWithCount);
    const masjidCount = getCountByMasjid(studentsWithCount);

    const additionalSheets = [
      { name: "Count by Cluster", data: clusterCount },
      { name: "Count by Masjid", data: masjidCount },
    ];

    createExcel(`students_${count}_certificate${countNum > 1 ? 's' : ''}.xlsx`, formattedStudents, additionalSheets);
  });

  console.log("✅ All Excel files generated successfully.");
}

function createExcel(filename, data, additionalSheets = []) {
  const workbook = XLSX.utils.book_new();

  // Add main sheet with student data
  const mainWorksheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, mainWorksheet, "Students");

  // Add any additional sheets
  additionalSheets.forEach(({ name, data: sheetData }) => {
    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  });

  const outputPath = path.join(__dirname, filename);
  XLSX.writeFile(workbook, outputPath);

  console.log(`📄 Saved: ${outputPath}`);
}

function getCountByCluster(students) {
  const clusterMap = {};

  students.forEach((student) => {
    const cluster = student.clusterNumber || "Unknown";
    if (!clusterMap[cluster]) {
      clusterMap[cluster] = 0;
    }
    clusterMap[cluster]++;
  });

  const clusterData = Object.entries(clusterMap).map(([cluster, count]) => ({
    Cluster: cluster,
    Students: count,
  }));

  // Sort by cluster number
  clusterData.sort((a, b) => {
    if (a.Cluster === "Unknown") return 1;
    if (b.Cluster === "Unknown") return -1;
    return a.Cluster.localeCompare(b.Cluster, undefined, { numeric: true });
  });

  // Add total row
  const totalStudents = students.length;
  clusterData.push({
    Cluster: "TOTAL",
    Students: totalStudents,
  });

  return clusterData;
}

function getCountByMasjid(students) {
  const masjidMap = {};

  students.forEach((student) => {
    const masjidId = student.masjidId || "Unknown";
    const masjidName = student.masjidName || "Unknown";
    const clusterNumber = student.clusterNumber || "Unknown";

    if (!masjidMap[masjidId]) {
      masjidMap[masjidId] = {
        masjidName,
        clusterNumber,
        count: 0,
      };
    }
    masjidMap[masjidId].count++;
  });

  const masjidData = Object.entries(masjidMap).map(([masjidId, info]) => ({
    "Masjid Name": info.masjidName,
    "Masjid Cluster": info.clusterNumber,
    "Masjid ID": masjidId,
    Students: info.count,
  }));

  // Sort by masjid name
  masjidData.sort((a, b) => {
    if (a["Masjid Name"] === "Unknown") return 1;
    if (b["Masjid Name"] === "Unknown") return -1;
    return a["Masjid Name"].localeCompare(b["Masjid Name"]);
  });

  // Add total row
  const totalStudents = students.length;
  const totalMasjids = Object.keys(masjidMap).length;
  masjidData.push({
    "Masjid Name": "TOTAL",
    "Masjid Cluster": "",
    "Masjid ID": `${totalMasjids} Masjids`,
    Students: totalStudents,
  });

  return masjidData;
}

exportCertificates().catch(console.error);
