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
        sheetName: "1st Chilla (70-100%)",
        startDate: new Date("2025-08-01T00:00:00"),
        endDate: new Date("2025-09-09T23:59:59"),
    },
    {
        name: "2nd Chilla",
        sheetName: "2nd Chilla (70-100%)",
        startDate: new Date("2025-09-10T00:00:00"),
        endDate: new Date("2025-10-19T23:59:59"),
    },
    {
        name: "3rd Chilla",
        sheetName: "3rd Chilla (70-100%)",
        startDate: new Date("2025-10-20T00:00:00"),
        endDate: new Date("2025-11-28T23:59:59"),
    }
];

// Overall period covering all 3 Chillas
const OVERALL_START = new Date("2025-08-01T00:00:00");
const OVERALL_END = new Date("2025-11-28T23:59:59");

// ---------------------------------------------------------
// SAFE IST DATE FORMATTER
// ---------------------------------------------------------
function formatISTDate(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        return null;
    }

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
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    const diffTime = Math.abs(end - start);
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
}

// ---------------------------------------------------------
// DATA EXTRACTION HELPERS
// ---------------------------------------------------------
function getMasjidDisplay(data) {
    if (data.masjidDetails && Array.isArray(data.masjidDetails) && data.masjidDetails.length > 0) {
        const masjids = data.masjidDetails
            .map(m => m?.masjidName)
            .filter(name => name && name.trim() !== "");
        
        if (masjids.length > 1) {
            return "multiple masjids";
        } else if (masjids.length === 1) {
            return masjids[0];
        }
    }
    
    if (data.masjidDetails && typeof data.masjidDetails === 'object' && !Array.isArray(data.masjidDetails)) {
        const masjidName = data.masjidDetails.masjidName;
        if (masjidName && masjidName.trim() !== "") {
            return masjidName;
        }
    }
    
    if (data.managedMasjids && Array.isArray(data.managedMasjids) && data.managedMasjids.length > 0) {
        const masjids = data.managedMasjids
            .map(m => m?.masjidName)
            .filter(name => name && name.trim() !== "");
        
        if (masjids.length > 1) {
            return "multiple masjids";
        } else if (masjids.length === 1) {
            return masjids[0];
        }
    }
    
    const fallbackMasjid = data.assignedMasjid?.masjidName || "";
    return fallbackMasjid && fallbackMasjid.trim() !== "" ? fallbackMasjid : "";
}

function getClusterDisplay(data) {
    if (data.masjidDetails && Array.isArray(data.masjidDetails) && data.masjidDetails.length > 0) {
        const clusters = [...new Set(
            data.masjidDetails
                .map(m => m?.clusterNumber)
                .filter(num => num !== null && num !== undefined && num !== "")
        )];
        
        if (clusters.length > 1) {
            return "multiple clusters";
        } else if (clusters.length === 1) {
            return String(clusters[0]);
        }
    }
    
    if (data.masjidDetails && typeof data.masjidDetails === 'object' && !Array.isArray(data.masjidDetails)) {
        const clusterNumber = data.masjidDetails.clusterNumber;
        if (clusterNumber !== null && clusterNumber !== undefined && clusterNumber !== "") {
            return String(clusterNumber);
        }
    }
    
    if (data.managedMasjids && Array.isArray(data.managedMasjids) && data.managedMasjids.length > 0) {
        const clusters = [...new Set(
            data.managedMasjids
                .map(m => m?.clusterNumber)
                .filter(num => num !== null && num !== undefined && num !== "")
        )];
        
        if (clusters.length > 1) {
            return "multiple clusters";
        } else if (clusters.length === 1) {
            return String(clusters[0]);
        }
    }
    
    const fallbackCluster = data.assignedMasjid?.clusterNumber;
    if (fallbackCluster !== null && fallbackCluster !== undefined && fallbackCluster !== "") {
        return String(fallbackCluster);
    }
    return "";
}

function isHafiz(data) {
    const name = data.name || data.displayName || "";
    if (name.toLowerCase().includes("hafiz")) return "Yes";

    if (data.isHafiz === true || data.isHafiz === "true") return "Yes";
    if (data.role === "hafiz") return "Yes";

    return "No";
}

// ---------------------------------------------------------
// FETCH ALL USERS AND IDENTIFY VOLUNTEERS
// ---------------------------------------------------------
async function fetchVolunteerUsers() {
    console.log("Fetching all users from Users collection...");

    const snapshot = await db.collection("Users").get();
    const volunteerUsers = new Map();

    snapshot.forEach((doc) => {
        const data = doc.data();
        const userId = doc.id;

        volunteerUsers.set(userId, {
            userId: userId,
            name: data.name || data.displayName || "Unknown",
            email: data.email || "",
            phone: data.phone || data.phoneNumber || "",
            role: data.role || "volunteer",
            masjid: getMasjidDisplay(data),
            cluster: getClusterDisplay(data),
            isHafiz: isHafiz(data),
        });
    });

    console.log(`✅ Found ${volunteerUsers.size} volunteers in Users collection`);
    return volunteerUsers;
}

// ---------------------------------------------------------
// FETCH VOLUNTEER ATTENDANCE FOR ENTIRE PERIOD
// ---------------------------------------------------------
async function fetchAllVolunteerAttendance(volunteerUsers) {
    console.log(`Fetching ALL volunteer attendance from ${formatISTDate(OVERALL_START)} to ${formatISTDate(OVERALL_END)}...`);

    const snapshot = await db
        .collection("Attendance")
        .where("attendance_time", ">=", OVERALL_START)
        .where("attendance_time", "<=", OVERALL_END)
        .get();

    const volunteerAttendance = {};

    snapshot.forEach((doc) => {
        const data = doc.data();
        const trackedBy = data.tracked_by;
        const attendanceTime = data.attendance_time;

        if (!trackedBy || !trackedBy.userId) {
            return;
        }

        const volunteerId = trackedBy.userId;

        if (!volunteerUsers.has(volunteerId)) {
            return;
        }

        if (!attendanceTime || typeof attendanceTime.toDate !== "function") {
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

        if (!volunteerAttendance[volunteerId]) {
            volunteerAttendance[volunteerId] = {};
        }

        if (!volunteerAttendance[volunteerId][dateText]) {
            volunteerAttendance[volunteerId][dateText] = 0;
        }

        volunteerAttendance[volunteerId][dateText]++;
    });

    console.log(`✅ Processed attendance records for ${Object.keys(volunteerAttendance).length} volunteers`);
    return volunteerAttendance;
}

// ---------------------------------------------------------
// ADD SHEET FOR CHILLA PERIOD WITH HIGH PERFORMERS
// ---------------------------------------------------------
function addChillaSheet(workbook, chilla, volunteerUsers, allVolunteerAttendance) {
    console.log(`\nProcessing ${chilla.name}...`);
    
    const totalDays = getTotalDays(chilla.startDate, chilla.endDate);
    
    // Filter attendance data for this specific Chilla period
    const chillaAttendance = {};
    Object.entries(allVolunteerAttendance).forEach(([userId, dateRecords]) => {
        if (!volunteerUsers.has(userId)) return;

        chillaAttendance[userId] = {};
        Object.entries(dateRecords).forEach(([date, count]) => {
            const dateObj = new Date(date);
            if (dateObj >= chilla.startDate && dateObj <= chilla.endDate) {
                chillaAttendance[userId][date] = count;
            }
        });
    });

    // Prepare data and filter for 70-100% attendance
    const reportData = [];

    volunteerUsers.forEach((volunteer, userId) => {
        const attendanceRecords = chillaAttendance[userId] || {};
        const daysWorked = Object.keys(attendanceRecords).length;
        const totalRecordsTaken = Object.values(attendanceRecords).reduce((sum, count) => sum + count, 0);
        const avgRecordsPerDay = daysWorked > 0 ? (totalRecordsTaken / daysWorked).toFixed(2) : "0.00";
        const attendancePercentage = totalDays > 0 ? ((daysWorked / totalDays) * 100).toFixed(2) : "0.00";

        // Only include volunteers with 70-100% attendance
        if (parseFloat(attendancePercentage) >= 70) {
            reportData.push({
                userId: userId,
                name: volunteer.name,
                email: volunteer.email,
                phone: volunteer.phone,
                masjid: volunteer.masjid,
                cluster: volunteer.cluster,
                isHafiz: volunteer.isHafiz,
                totalDaysInPeriod: totalDays,
                daysWorked: daysWorked,
                daysAbsent: totalDays - daysWorked,
                totalRecordsTaken: totalRecordsTaken,
                avgRecordsPerDay: parseFloat(avgRecordsPerDay),
                attendancePercentage: parseFloat(attendancePercentage),
            });
        }
    });

    // Sort by attendance percentage (descending), then by name
    reportData.sort((a, b) => {
        if (b.attendancePercentage !== a.attendancePercentage) {
            return b.attendancePercentage - a.attendancePercentage;
        }
        return a.name.localeCompare(b.name);
    });

    console.log(`   Found ${reportData.length} volunteers with 70-100% attendance`);

    // Create sheet
    const sheet = workbook.addWorksheet(chilla.sheetName);

    // Define columns
    sheet.columns = [
        { header: "S.No", key: "sno", width: 8 },
        { header: "Volunteer Name", key: "name", width: 25 },
        { header: "Hafiz?", key: "isHafiz", width: 10 },
        { header: "Email", key: "email", width: 30 },
        { header: "Phone", key: "phone", width: 18 },
        { header: "Masjid", key: "masjid", width: 25 },
        { header: "Cluster", key: "cluster", width: 10 },
        { header: "Attendance %", key: "attendancePercentage", width: 15 },
        { header: "Days Worked", key: "daysWorked", width: 15 },
        { header: "Days Absent", key: "daysAbsent", width: 12 },
        { header: "Total Days", key: "totalDaysInPeriod", width: 12 },
        { header: "Total Records", key: "totalRecordsTaken", width: 15 },
        { header: "Avg Records/Day", key: "avgRecordsPerDay", width: 18 },
        { header: "User ID", key: "userId", width: 35 },
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

    // Add data rows with serial number
    reportData.forEach((data, index) => {
        const rowData = {
            sno: index + 1,
            ...data
        };
        const row = sheet.addRow(rowData);

        // Color code based on attendance percentage
        const percentageCell = row.getCell("attendancePercentage");
        percentageCell.numFmt = "0.00";

        if (data.attendancePercentage === 100) {
            // Dark green for 100%
            percentageCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "00B050" },
            };
            percentageCell.font = { color: { argb: "FFFFFF" }, bold: true };
        } else if (data.attendancePercentage >= 90) {
            // Light green for 90-99%
            percentageCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "C6EFCE" },
            };
            percentageCell.font = { color: { argb: "006100" }, bold: true };
        } else if (data.attendancePercentage >= 80) {
            // Yellow-green for 80-89%
            percentageCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFEB9C" },
            };
            percentageCell.font = { color: { argb: "9C6500" }, bold: true };
        } else {
            // Light yellow for 70-79%
            percentageCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFF2CC" },
            };
            percentageCell.font = { color: { argb: "806000" }, bold: true };
        }
    });

    // Add summary at the bottom
    sheet.addRow({});
    const summaryStartRow = sheet.lastRow.number + 1;
    
    const perfect100 = reportData.filter(v => v.attendancePercentage === 100).length;
    const range90to99 = reportData.filter(v => v.attendancePercentage >= 90 && v.attendancePercentage < 100).length;
    const range80to89 = reportData.filter(v => v.attendancePercentage >= 80 && v.attendancePercentage < 90).length;
    const range70to79 = reportData.filter(v => v.attendancePercentage >= 70 && v.attendancePercentage < 80).length;
    const avgAttendance = reportData.length > 0
        ? (reportData.reduce((sum, v) => sum + v.attendancePercentage, 0) / reportData.length).toFixed(2)
        : "0.00";

    sheet.addRow({ sno: "Summary:", name: "", isHafiz: "", email: "", phone: "", masjid: "", cluster: "" });
    sheet.addRow({ sno: "Period:", name: `${formatISTDate(chilla.startDate)} to ${formatISTDate(chilla.endDate)}` });
    sheet.addRow({ sno: "Total Days:", name: totalDays });
    sheet.addRow({ sno: "Total Volunteers (70-100%):", name: reportData.length });
    sheet.addRow({ sno: "100% Attendance:", name: perfect100 });
    sheet.addRow({ sno: "90-99% Attendance:", name: range90to99 });
    sheet.addRow({ sno: "80-89% Attendance:", name: range80to89 });
    sheet.addRow({ sno: "70-79% Attendance:", name: range70to79 });
    sheet.addRow({ sno: "Average Attendance:", name: `${avgAttendance}%` });

    // Style summary section
    for (let i = summaryStartRow; i <= sheet.lastRow.number; i++) {
        const row = sheet.getRow(i);
        row.font = { bold: true };
        row.getCell(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "E7E6E6" },
        };
    }

    return reportData.length;
}

// ---------------------------------------------------------
// MAIN FUNCTION
// ---------------------------------------------------------
async function generateHighAttendanceReport() {
    console.log("🚀 Starting High Attendance Volunteers Report Generation...\n");
    console.log("📋 Filtering: Volunteers with 70-100% attendance in each Chilla\n");

    // Fetch all volunteer users
    const volunteerUsers = await fetchVolunteerUsers();

    if (volunteerUsers.size === 0) {
        console.log("⚠️ No volunteers found in Users collection.");
        return;
    }

    // Fetch ALL attendance data across all 3 Chillas
    const allVolunteerAttendance = await fetchAllVolunteerAttendance(volunteerUsers);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // Add sheets for each Chilla with high performers
    let totalHighPerformers = 0;
    for (const chilla of CHILLA_PERIODS) {
        const count = addChillaSheet(workbook, chilla, volunteerUsers, allVolunteerAttendance);
        totalHighPerformers += count;
    }

    // Save the workbook
    const outputPath = path.join(__dirname, "High_Attendance_Volunteers_70_to_100_Percent.xlsx");
    await workbook.xlsx.writeFile(outputPath);

    console.log("\n========================================");
    console.log("✅ High Attendance Report Generated Successfully!");
    console.log(`📁 File: ${outputPath}`);
    console.log(`👥 Total High Performers (70-100%): ${totalHighPerformers}`);
    console.log("========================================");
}

generateHighAttendanceReport().catch(console.error);