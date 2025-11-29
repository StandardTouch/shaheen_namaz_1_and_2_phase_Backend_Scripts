import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔐 Load service account JSON
const serviceAccountPath = path.join(__dirname, '../scripts-1/service_account.json');
const serviceAccountJSON = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

// 🔥 Initialize Firebase with cert() instead of applicationDefault()
initializeApp({
  credential: cert(serviceAccountJSON),
});

// References to the Firebase collections
const db = getFirestore();
const winnersRef = db.collection('winners');
const certificatesRef = db.collection('certificates');

// Utility function for title case
const toTitleCase = (str) => {
  return str
    ? str.replace(/\b\w/g, (char) => char.toUpperCase()).replace(/\s+/g, ' ')
    : '';
};

// Fetch all certificates and group by studentId
const fetchAllCertificates = async () => {
  try {
    const certificatesSnapshot = await certificatesRef.get();
    const certificatesByStudent = {};
    
    certificatesSnapshot.forEach(doc => {
      const certData = doc.data();
      const studentId = certData.studentId;
      
      // Initialize array if it doesn't exist
      if (!certificatesByStudent[studentId]) {
        certificatesByStudent[studentId] = [];
      }
      
      // Add certificate data to the student's array
      certificatesByStudent[studentId].push(certData);
    });
    
    return certificatesByStudent;
  } catch (error) {
    console.error("❌ Error fetching certificates:", error);
    return {};
  }
};

// Filter certificates to exclude those with special_program = true
const filterCertificates = (certificates) => {
  return certificates.filter(cert => {
    // Check if special_program field exists
    if ('special_program' in cert) {
      // If field exists, only include if it's not true
      return cert.special_program !== true;
    } else {
      // If field doesn't exist, include the certificate
      return true;
    }
  });
};

// Fetch winner data and count filtered certificates
const fetchData = async () => {
  try {
    const winnersSnapshot = await winnersRef.get();
    if (winnersSnapshot.empty) {
      console.log('⚠️ No winners data found.');
      return [];
    }

    // Pre-fetch all certificates and group by studentId
    const certificatesByStudent = await fetchAllCertificates();
    console.log(`📊 Fetched certificates for ${Object.keys(certificatesByStudent).length} students`);

    const winnersData = [];
    for (const winnerDoc of winnersSnapshot.docs) {
      const winner = winnerDoc.data();
      const { id, name, guardianName, masjidName, prize, clusterNumber } = winner;

      // Get certificates for this student and filter out special_program = true
      const studentCertificates = certificatesByStudent[id] || [];
      const filteredCertificates = filterCertificates(studentCertificates);
      const certificatesCount = filteredCertificates.length;

      // Push to the result array with title case applied
      winnersData.push({
        Name: toTitleCase(name),
        GuardianName: toTitleCase(guardianName),
        GuardianNumber: winner.guardianNumber || 'N/A',
        StudentId: id,
        ClusterNumber: clusterNumber,
        MasjidName: toTitleCase(masjidName),
        Prize: prize,
        CertificatesCount: certificatesCount
      });
    }

    console.log(`📊 Processed ${winnersData.length} winner records.`);
    return winnersData;
  } catch (error) {
    console.error("❌ Error fetching data:", error);
    return [];
  }
};

// Write data to an Excel file
const writeToExcel = (data) => {
  if (data.length === 0) {
    console.log("⚠️ No data to write to Excel.");
    return;
  }

  // Create a new workbook and add a sheet with the data
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Winners");

  // Write the Excel file
  const filePath = './winners_data.xlsx';
  XLSX.writeFile(wb, filePath);

  console.log(`✅ Winners data saved to: ${filePath}`);
};

// Main function
const main = async () => {
  try {
    const winnersData = await fetchData();
    writeToExcel(winnersData);
  } catch (error) {
    console.error("❌ Error in main:", error);
  }
};

main();