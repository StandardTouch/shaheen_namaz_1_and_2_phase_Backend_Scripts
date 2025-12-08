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
const serviceAccountPath = "/home/maaz/Desktop/shaheen_namaz_1_and_2_phase_Backend_Scripts/Phase_2_key/service_account.json";
const serviceAccountJSON = JSON.parse(await readFile(serviceAccountPath, "utf-8"));

initializeApp({
    credential: cert(serviceAccountJSON),
});

const db = getFirestore();

// Define the three Chilla periods
const CHILLA_PERIODS = [
    {
        name: "1st Chilla",
        startDate: new Date("2025-08-01T00:00:00"),
        endDate: new Date("2025-09-09T23:59:59"),
        filename: "1st_Chilla_Attendance_01Aug25_09Sept25.xlsx"
    },
    {
        name: "2nd Chilla",
        startDate: new Date("2025-09-10T00:00:00"),
        endDate: new Date("2025-10-19T23:59:59"),
        filename: "2nd_Chilla_Attendance_10Sept25_19Oct25.xlsx"
    },
    {
        name: "3rd Chilla",
        startDate: new Date("2025-10-20T00:00:00"),
        endDate: new Date("2025-11-28T23:59:59"),
        filename: "3rd_Chilla_Attendance_20Oct25_28Nov25.xlsx"
    }
];

// ---------------------------------------------------------
// SAFE IST DATE FORMATTER
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// CALCULATE TOTAL DAYS IN PERIOD
// ---------------------------------------------------------
function getTotalDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates
    return diffDays;
}

// ---------------------------------------------------------
// FETCH ALL VOLUNTEERS (STUDENTS)
// ---------------------------------------------------------
async function fetchAllVolunteers() {
    console.log("Fetching all volunteers from Attendance records...");

    // First try Students collection
    let snapshot = await db.collection("Students").get();

    if (!snapshot.empty) {
        const volunteers = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            volunteers.push({
                studentId: doc.id,
                name: data.name || "Unknown",
                guardianNumber: data.guardianNumber || "",
                masjidName: data.masjid_details?.masjidName || "",
                masjidId: data.masjid_details?.masjidId || "",
                clusterNumber: data.masjid_details?.clusterNumber || "",
            });
        });
        console.log(`✅ Found ${volunteers.length} volunteers from Students collection`);
        return volunteers;
    }

    // If Students collection is empty, get unique volunteers from Attendance
    console.log("Students collection is empty, extracting from Attendance records...");
    snapshot = await db.collection("Attendance").get();

    const volunteerMap = new Map();

    snapshot.forEach((doc) => {
        const data = doc.data();
        const studentId = data.studentId;

        if (studentId && !volunteerMap.has(studentId)) {
            volunteerMap.set(studentId, {
                studentId: studentId,
                name: data.name || "Unknown",
                guardianNumber: data.guardianNumber || "",
                masjidName: data.masjid_details?.masjidName || "",
                masjidId: data.masjid_details?.masjidId || "",
                clusterNumber: data.masjid_details?.clusterNumber || "",
            });
        }
    });

    const volunteers = Array.from(volunteerMap.values());
    console.log(`✅ Found ${volunteers.length} unique volunteers from Attendance records`);
    return volunteers;
}

// ---------------------------------------------------------
// FETCH ATTENDANCE FOR A PERIOD
// ---------------------------------------------------------
async function fetchAttendanceForPeriod(startDate, endDate) {
    console.log(`Fetching attendance from ${formatISTDate(startDate)} to ${formatISTDate(endDate)}...`);

    const snapshot = await db
        .collection("Attendance")
        .where("attendance_time", ">=", startDate)
        .where("attendance_time", "<=", endDate)
        .get();

    const attendanceMap = {};

    snapshot.forEach((doc) => {
        const data = doc.data();
        const studentId = data.studentId;
        const attendanceTime = data.attendance_time;

        if (!studentId || !attendanceTime || typeof attendanceTime.toDate !== "function") {
            return;
        }

        const time = attendanceTime.toDate();
        if (!(time instanceof Date) || isNaN(time.getTime())) {
            return;
        }

        const dateText = formatISTDate(time);
        if (!dateText) {
            return;
        }

        if (!attendanceMap[studentId]) {
            attendanceMap[studentId] = new Set();
        }

        attendanceMap[studentId].add(dateText);
    });

    console.log(`✅ Processed attendance for ${Object.keys(attendanceMap).length} volunteers`);
    return attendanceMap;
}

// ---------------------------------------------------------
// GENERATE EXCEL FOR A CHILLA PERIOD
// ---------------------------------------------------------
async function generateChillaReport(chilla) {
    console.log(`\n========================================`);
    console.log(`Generating report for: ${chilla.name}`);
    console.log(`Period: ${formatISTDate(chilla.startDate)} to ${formatISTDate(chilla.endDate)}`);
    console.log(`========================================\n`);

    // Fetch all volunteers
    const volunteers = await fetchAllVolunteers();

    // Fetch attendance for this period
    const attendanceMap = await fetchAttendanceForPeriod(chilla.startDate, chilla.endDate);

    // Calculate total days in this period
    const totalDays = getTotalDays(chilla.startDate, chilla.endDate);
    console.log(`Total days in ${chilla.name}: ${totalDays}`);

    // Prepare data for Excel
    const reportData = volunteers.map((volunteer) => {
        const attendedDays = attendanceMap[volunteer.studentId]?.size || 0;
        const attendancePercentage = totalDays > 0 ? ((attendedDays / totalDays) * 100).toFixed(2) : "0.00";

        return {
            studentId: volunteer.studentId,
            name: volunteer.name,
            guardianNumber: volunteer.guardianNumber,
            masjidName: volunteer.masjidName,
            masjidId: volunteer.masjidId,
            clusterNumber: volunteer.clusterNumber,
            totalDays: totalDays,
            attendedDays: attendedDays,
            absentDays: totalDays - attendedDays,
            attendancePercentage: parseFloat(attendancePercentage),
        };
    });

    // Sort by attendance percentage (descending)
    reportData.sort((a, b) => b.attendancePercentage - a.attendancePercentage);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(chilla.name);

    // Define columns
    sheet.columns = [
        { header: "Student ID", key: "studentId", width: 40 },
        { header: "Name", key: "name", width: 25 },
        { header: "Guardian Number", key: "guardianNumber", width: 18 },
        { header: "Masjid Name", key: "masjidName", width: 30 },
        { header: "Masjid ID", key: "masjidId", width: 30 },
        { header: "Cluster Number", key: "clusterNumber", width: 15 },
        { header: "Total Days", key: "totalDays", width: 12 },
        { header: "Days Attended", key: "attendedDays", width: 15 },
        { header: "Days Absent", key: "absentDays", width: 12 },
        { header: "Attendance %", key: "attendancePercentage", width: 15 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
    headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "4472C4" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Add data rows
    reportData.forEach((data) => {
        const row = sheet.addRow(data);

        // Color code based on attendance percentage
        const percentageCell = row.getCell(10);
        percentageCell.numFmt = "0.00";

        if (data.attendancePercentage >= 80) {
            // Green for 80% and above
            percentageCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "C6EFCE" },
            };
            percentageCell.font = { color: { argb: "006100" }, bold: true };
        } else if (data.attendancePercentage >= 50) {
            // Yellow for 50-79%
            percentageCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFEB9C" },
            };
            percentageCell.font = { color: { argb: "9C6500" }, bold: true };
        } else {
            // Red for below 50%
            percentageCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFC7CE" },
            };
            percentageCell.font = { color: { argb: "9C0006" }, bold: true };
        }
    });

    // Add summary statistics sheet
    const summarySheet = workbook.addWorksheet("Summary Statistics");

    // Calculate statistics
    const totalVolunteers = reportData.length;
    const perfect100 = reportData.filter(v => v.attendancePercentage === 100).length;
    const above80 = reportData.filter(v => v.attendancePercentage >= 80 && v.attendancePercentage < 100).length;
    const between50and80 = reportData.filter(v => v.attendancePercentage >= 50 && v.attendancePercentage < 80).length;
    const below50 = reportData.filter(v => v.attendancePercentage < 50).length;
    const zeroAttendance = reportData.filter(v => v.attendancePercentage === 0).length;
    const avgAttendance = totalVolunteers > 0
        ? (reportData.reduce((sum, v) => sum + v.attendancePercentage, 0) / totalVolunteers).toFixed(2)
        : "0.00";

    summarySheet.columns = [
        { header: "Metric", key: "metric", width: 35 },
        { header: "Value", key: "value", width: 15 },
    ];

    const summaryHeaderRow = summarySheet.getRow(1);
    summaryHeaderRow.font = { bold: true, color: { argb: "FFFFFF" } };
    summaryHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "4472C4" },
    };

    summarySheet.addRow({ metric: "Total Volunteers", value: totalVolunteers });
    summarySheet.addRow({ metric: "Total Days in Period", value: totalDays });
    summarySheet.addRow({ metric: "Average Attendance %", value: parseFloat(avgAttendance) });
    summarySheet.addRow({ metric: "", value: "" }); // Empty row
    summarySheet.addRow({ metric: "100% Attendance", value: perfect100 });
    summarySheet.addRow({ metric: "80-99% Attendance", value: above80 });
    summarySheet.addRow({ metric: "50-79% Attendance", value: between50and80 });
    summarySheet.addRow({ metric: "Below 50% Attendance", value: below50 });
    summarySheet.addRow({ metric: "0% Attendance (No Show)", value: zeroAttendance });

    // Add cluster-wise summary
    const clusterSummarySheet = workbook.addWorksheet("Cluster Summary");
    const clusterMap = {};

    reportData.forEach((volunteer) => {
        const cluster = volunteer.clusterNumber || "Unknown";
        if (!clusterMap[cluster]) {
            clusterMap[cluster] = {
                totalVolunteers: 0,
                totalAttendance: 0,
            };
        }
        clusterMap[cluster].totalVolunteers++;
        clusterMap[cluster].totalAttendance += volunteer.attendancePercentage;
    });

    clusterSummarySheet.columns = [
        { header: "Cluster Number", key: "cluster", width: 20 },
        { header: "Total Volunteers", key: "totalVolunteers", width: 18 },
        { header: "Average Attendance %", key: "avgAttendance", width: 20 },
    ];

    const clusterHeaderRow = clusterSummarySheet.getRow(1);
    clusterHeaderRow.font = { bold: true, color: { argb: "FFFFFF" } };
    clusterHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "4472C4" },
    };

    Object.entries(clusterMap).forEach(([cluster, data]) => {
        const avgAttendance = data.totalVolunteers > 0
            ? (data.totalAttendance / data.totalVolunteers).toFixed(2)
            : "0.00";

        clusterSummarySheet.addRow({
            cluster: cluster,
            totalVolunteers: data.totalVolunteers,
            avgAttendance: parseFloat(avgAttendance),
        });
    });

    // Save the workbook
    const outputPath = path.join(__dirname, chilla.filename);
    await workbook.xlsx.writeFile(outputPath);

    console.log(`✅ ${chilla.name} report created: ${outputPath}`);
    console.log(`   Total Volunteers: ${totalVolunteers}`);
    console.log(`   Average Attendance: ${avgAttendance}%`);
    console.log(`   100% Attendance: ${perfect100} volunteers`);
    console.log(`   0% Attendance: ${zeroAttendance} volunteers\n`);
}

// ---------------------------------------------------------
// MAIN FUNCTION
// ---------------------------------------------------------
async function generateAllChillaReports() {
    console.log("🚀 Starting Chilla Attendance Reports Generation...\n");

    for (const chilla of CHILLA_PERIODS) {
        await generateChillaReport(chilla);
    }

    console.log("========================================");
    console.log("✅ All 3 Chilla attendance reports generated successfully!");
    console.log("========================================");
}

generateAllChillaReports().catch(console.error);
