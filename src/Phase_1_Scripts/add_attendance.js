import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Constants
const STREAK_MODULO = 40;

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔐 Load service account JSON
const serviceAccountPath = path.join(__dirname, '../Phase_2_key/serviceAccountKey.json');
const serviceAccountJSON = JSON.parse(await readFile(serviceAccountPath, 'utf-8'));

// 🔥 Initialize Firebase
initializeApp({
  credential: cert(serviceAccountJSON),
});

const db = getFirestore();

/**
 * Fetches student data from Firestore
 * @param {string} studentId - The student ID
 * @returns {Promise<Object>} Student data
 */
async function fetchStudentData(studentId) {
  const studentRef = db.collection('students').doc(studentId);
  const studentSnap = await studentRef.get();

  if (!studentSnap.exists) {
    throw new Error(`Student with ID ${studentId} not found`);
  }

  const studentData = studentSnap.data();
  
  return {
    studentId: studentId,
    class: studentData.class,
    displayName: studentData.name,
    guardianNumber: studentData.guardianNumber,
    masjid: db.doc(`Masjid/${studentData.masjid_details.masjidId}`),
    masjid_details: studentData.masjid_details,
    name: studentData.name,
    school: studentData.school_name,
    section: studentData.section,
    tracked_by: {
      name: studentData.volunteer?.volunteerName || "Unknown",
      userId: studentData.volunteer?.volunteerId || "system"
    }
  };
}

/**
 * Creates an attendance record for a specific date with a specific time
 * @param {Object} studentData - Student data
 * @param {Date} date - Date for the attendance record
 * @param {number} hour - Hour of the day (0-23)
 * @param {number} minute - Minute of the hour (0-59)
 * @returns {Object} Attendance data object
 */
function createAttendanceRecord(studentData, date, hour, minute) {
  // Create a new date object with specific time
  const attendanceDateTime = new Date(date);
  attendanceDateTime.setHours(hour, minute, 0, 0);
  
  return {
    attendance_time: Timestamp.fromDate(attendanceDateTime), // Use Firestore Timestamp
    class: studentData.class,
    displayName: studentData.displayName,
    guardianNumber: studentData.guardianNumber,
    masjid: studentData.masjid,
    masjid_details: studentData.masjid_details,
    name: studentData.name,
    school: studentData.school,
    section: studentData.section,
    studentId: studentData.studentId,
    tracked_by: studentData.tracked_by
  };
}

/**
 * Updates the streak count for a student
 * @param {string} studentId - The student ID
 * @returns {Promise<number>} The updated streak count
 */
async function updateStreak(studentId) {
  const studentRef = db.collection("students").doc(studentId);
  const studentSnap = await studentRef.get();

  if (!studentSnap.exists) {
    throw new Error(`Student with ID ${studentId} not found`);
  }

  // Count attendance documents for this student
  const attendanceSnapshot = await db.collection("Attendance")
    .where('studentId', '==', studentId)
    .get();

  const newStreak = attendanceSnapshot.size;
  const updatedStreak = newStreak % STREAK_MODULO === 0 ? STREAK_MODULO : newStreak % STREAK_MODULO;

  if (updatedStreak === STREAK_MODULO) {
    await generateCertificateForStudent(studentId);
    await studentRef.update({
      streak: 0,
      // streak_last_modified: Timestamp.now(),
    });
    console.log(`Streak reached ${STREAK_MODULO}. Certificate issued and streak reset for ${studentId}`);
  } else {
    await studentRef.update({
      streak: updatedStreak,
      streak_last_modified: Timestamp.now(),
    });
    console.log(`Updated streak to ${updatedStreak} for ${studentId}`);
  }
  
  return updatedStreak;
}

/**
 * Generates a certificate for a student
 * @param {string} studentId - The student ID
 * @returns {Promise<Object>} Result of certificate generation
 */
async function generateCertificateForStudent(studentId) {
  try {
    const studentRef = db.collection('students').doc(studentId);
    const studentSnap = await studentRef.get();

    if (!studentSnap.exists) {
      throw new Error(`Student with ID ${studentId} not found`);
    }

    const studentData = studentSnap.data();

    const attendanceQuery = await db.collection('Attendance')
      .where('studentId', '==', studentId)
      .orderBy('attendance_time', 'desc')
      .limit(1)
      .get();

    if (attendanceQuery.empty) {
      throw new Error(`No attendance records found for student ID ${studentId}`);
    }

    const latestAttendance = attendanceQuery.docs[0].data();
    const certificateDate = latestAttendance.attendance_time;

    const specialProgramEligible = studentData.special_program_eligible || false;

    await db.collection('certificates').add({
      studentId,
      name: studentData.name,
      guardianNumber: studentData.guardianNumber,
      masjid_details: studentData.masjid_details,
      dob: studentData.dob,
      time: certificateDate,
      special_program: specialProgramEligible
    });

    console.log(`Certificate generated for ${studentId} at streak ${STREAK_MODULO}`);
    return { success: true };

  } catch (error) {
    console.error('Error generating certificate:', error);
    throw error;
  }
}

/**
 * Helper function to format timestamp for display
 * @param {Timestamp} timestamp - Firestore Timestamp
 * @returns {string} Formatted date string
 */
function formatTimestampForDisplay(timestamp) {
  if (!timestamp || !timestamp.toDate) {
    return 'Invalid timestamp';
  }
  
  const date = timestamp.toDate();
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata' // IST timezone
  };
  
  return date.toLocaleString('en-US', options) + ' UTC+5:30';
}

/**
 * Function to generate attendance records with different times for each day
 * @param {string} studentId - The student ID
 * @param {Date} startDate - Start date for attendance records
 * @param {number} daysToAdd - Number of days to add attendance for
 * @returns {Promise<void>}
 */
async function generateAttendanceRecords(studentId, startDate, daysToAdd) {
  console.log(`📅 Generating ${daysToAdd} attendance records for student ${studentId} starting from ${startDate.toDateString()}...`);
  
  // Fetch student data
  const studentData = await fetchStudentData(studentId);
  console.log(`✅ Fetched data for student: ${studentData.name}`);
  
  const batch = db.batch();
  const attendanceRef = db.collection('Attendance');
  
  // Different times for different days (morning, afternoon, evening)
  const times = [
    { hour: 9, minute: 30 },  // Morning
    { hour: 14, minute: 15 }, // Afternoon
    { hour: 18, minute: 45 }  // Evening
  ];
  
  for (let i = 0; i < daysToAdd; i++) {
    // Create a new date by adding days
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    
    // Format date for document ID (YYYY-MM-DD)
    const formattedDate = currentDate.toISOString().split('T')[0];
    
    // Create document ID: studentId_YYYY-MM-DD
    const docId = `${studentId}_${formattedDate}`;
    
    // Select a time pattern based on day index
    const timeIndex = i % times.length;
    const { hour, minute } = times[timeIndex];
    
    // Create attendance record with specific time
    const attendanceData = createAttendanceRecord(studentData, currentDate, hour, minute);
    
    // Add to batch with specific document ID
    const docRef = attendanceRef.doc(docId);
    batch.set(docRef, attendanceData);
    
    // Format the timestamp for display
    const displayTime = formatTimestampForDisplay(attendanceData.attendance_time);
    console.log(`➕ Added attendance for ${displayTime} (ID: ${docId})`);
  }
  
  // Commit the batch
  await batch.commit();
  console.log(`✅ Successfully added ${daysToAdd} attendance records for student ${studentId}`);
  
  // Update streak after adding the attendance
  await updateStreak(studentId);
}

// Example usage:
// Set your student ID, start date and number of days to add
const studentId = '32c1d423-caf2-4d6f-b8b0-433cde325165'; // Replace with actual student ID
const startDate = new Date('2025-08-01'); // YYYY-MM-DD format
const daysToAdd = 38; // Number of days to add attendance for

// Generate the attendance records
generateAttendanceRecords(studentId, startDate, daysToAdd)
  .then(() => console.log('🎉 Attendance generation completed!'))
  .catch((error) => console.error('❌ Error:', error));