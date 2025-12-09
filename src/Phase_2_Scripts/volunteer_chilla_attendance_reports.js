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
        filename: "Volunteer_1st_Chilla_Attendance_01Aug25_09Sept25.xlsx",
        minDays: 0,
        maxDays: 40  // 0-40 days total worked
    },
    {
        name: "2nd Chilla",
        startDate: new Date("2025-09-10T00:00:00"),
        endDate: new Date("2025-10-19T23:59:59"),
        filename: "Volunteer_2nd_Chilla_Attendance_10Sept25_19Oct25.xlsx",
        minDays: 41,
        maxDays: 80  // 41-80 days total worked
    },
    {
        name: "3rd Chilla",
        startDate: new Date("2025-10-20T00:00:00"),
        endDate: new Date("2025-11-28T23:59:59"),
        filename: "Volunteer_3rd_Chilla_Attendance_20Oct25_28Nov25.xlsx",
        minDays: 81,
        maxDays: 120  // 81-120 days total worked
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
    // Create date objects at midnight for accurate day counting
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    const diffTime = Math.abs(end - start);
    // Add 1 to include both start and end dates (inclusive counting)
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
}


// ---------------------------------------------------------
// DATA EXTRACTION HELPERS
// ---------------------------------------------------------
function getMasjidNames(data) {
    if (data.managedMasjids && Array.isArray(data.managedMasjids) && data.managedMasjids.length > 0) {
        return data.managedMasjids.map(m => m.masjidName).filter(Boolean).join(", ");
    }
    return data.masjidDetails?.masjidName || data.assignedMasjid?.masjidName || "";
}

function getClusterNumbers(data) {
    if (data.managedMasjids && Array.isArray(data.managedMasjids) && data.managedMasjids.length > 0) {
        // Get unique clusters
        const clusters = data.managedMasjids.map(m => m.clusterNumber).filter(Boolean);
        return [...new Set(clusters)].join(", ");
    }
    return data.masjidDetails?.clusterNumber || data.assignedMasjid?.clusterNumber || "";
}

function isHafiz(data) {
    // Check if "hafiz" is in the name (case insensitive)
    const name = data.name || data.displayName || "";
    if (name.toLowerCase().includes("hafiz")) return "Yes";

    // Check specific fields if they exist (based on guess work/inspection)
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
        // const role = data.role || "";

        // Include ALL users from Users collection as volunteers (matching dashboard logic)
        // if (role.toLowerCase() === "volunteer") {
        volunteerUsers.set(userId, {
            userId: userId,
            name: data.name || data.displayName || "Unknown",
            email: data.email || "",
            phone: data.phone || data.phoneNumber || "",

            role: data.role || "volunteer",
            masjid: getMasjidNames(data),
            cluster: getClusterNumbers(data),
            isHafiz: isHafiz(data),
        });
        // }
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

    // Structure: volunteerAttendance[userId][date] = count of attendance records taken that day
    const volunteerAttendance = {};

    snapshot.forEach((doc) => {
        const data = doc.data();
        const trackedBy = data.tracked_by;
        const attendanceTime = data.attendance_time;

        // Skip if no tracked_by information
        if (!trackedBy || !trackedBy.userId) {
            return;
        }

        const volunteerId = trackedBy.userId;

        // Only process if this user is a volunteer
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

        // Initialize volunteer attendance tracking
        if (!volunteerAttendance[volunteerId]) {
            volunteerAttendance[volunteerId] = {};
        }

        // Initialize date tracking for this volunteer
        if (!volunteerAttendance[volunteerId][dateText]) {
            volunteerAttendance[volunteerId][dateText] = 0;
        }

        // Increment count for this date
        volunteerAttendance[volunteerId][dateText]++;
    });

    console.log(`✅ Processed attendance records for ${Object.keys(volunteerAttendance).length} volunteers`);
    return volunteerAttendance;
}

// ---------------------------------------------------------
// CALCULATE TOTAL DAYS WORKED FOR EACH VOLUNTEER
// ---------------------------------------------------------
function calculateTotalDaysWorked(volunteerAttendance) {
    const totalDaysMap = {};

    Object.entries(volunteerAttendance).forEach(([userId, dateRecords]) => {
        totalDaysMap[userId] = Object.keys(dateRecords).length;
    });

    return totalDaysMap;
}

// ---------------------------------------------------------
// GENERATE EXCEL FOR A CHILLA PERIOD
// ---------------------------------------------------------
async function generateChillaReport(chilla, volunteerUsers, allVolunteerAttendance, totalDaysWorked) {
    console.log(`\n========================================`);
    console.log(`Generating report for: ${chilla.name}`);
    console.log(`Period: ${formatISTDate(chilla.startDate)} to ${formatISTDate(chilla.endDate)}`);
    console.log(`Required Days Range: All volunteers included`);
    console.log(`========================================\n`);

    // Use ALL volunteers for each report (requested change)
    // We are no longer filtering by total days worked range

    // const filteredVolunteers = new Map();
    // volunteerUsers.forEach((volunteer, userId) => {
    //     const totalDays = totalDaysWorked[userId] || 0;
    //     if (totalDays >= chilla.minDays && totalDays <= chilla.maxDays) {
    //         filteredVolunteers.set(userId, volunteer);
    //     }
    // });

    // console.log(`✅ Found ${filteredVolunteers.size} volunteers with ${chilla.minDays}-${chilla.maxDays} days worked`);

    const reportVolunteers = volunteerUsers;
    console.log(`✅ Included all ${reportVolunteers.size} volunteers in this report`);

    if (reportVolunteers.size === 0) {
        console.log(`⚠️ No volunteers found for ${chilla.name}. Skipping report generation.\n`);
        return;
    }

    // Calculate total days in THIS specific period
    const totalDays = getTotalDays(chilla.startDate, chilla.endDate);

    // Filter attendance data for THIS specific Chilla period only
    const chillaAttendance = {};
    Object.entries(allVolunteerAttendance).forEach(([userId, dateRecords]) => {
        if (!reportVolunteers.has(userId)) return;

        chillaAttendance[userId] = {};
        Object.entries(dateRecords).forEach(([date, count]) => {
            const dateObj = new Date(date);
            if (dateObj >= chilla.startDate && dateObj <= chilla.endDate) {
                chillaAttendance[userId][date] = count;
            }
        });
    });

    // Prepare data for Excel - using THIS period's attendance only
    const reportData = [];

    reportVolunteers.forEach((volunteer, userId) => {
        const attendanceRecords = chillaAttendance[userId] || {};
        const daysWorked = Object.keys(attendanceRecords).length;
        const totalRecordsTaken = Object.values(attendanceRecords).reduce((sum, count) => sum + count, 0);
        const avgRecordsPerDay = daysWorked > 0 ? (totalRecordsTaken / daysWorked).toFixed(2) : "0.00";
        const attendancePercentage = totalDays > 0 ? ((daysWorked / totalDays) * 100).toFixed(2) : "0.00";

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
            totalDaysAllChillas: totalDaysWorked[userId] || 0,
        });
    });

    // Sort by attendance percentage (descending)
    reportData.sort((a, b) => b.attendancePercentage - a.attendancePercentage);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(chilla.name);

    // Define columns
    sheet.columns = [
        { header: "Volunteer User ID", key: "userId", width: 35 },

        { header: "Volunteer Name", key: "name", width: 25 },
        { header: "Hafiz?", key: "isHafiz", width: 10 },
        { header: "Email", key: "email", width: 30 },
        { header: "Phone", key: "phone", width: 18 },
        { header: "Masjid", key: "masjid", width: 25 },
        { header: "Cluster", key: "cluster", width: 10 },
        { header: "Total Days (This Period)", key: "totalDaysInPeriod", width: 20 },
        { header: "Days Worked", key: "daysWorked", width: 15 },
        { header: "Days Absent", key: "daysAbsent", width: 12 },
        { header: "Total Records Taken", key: "totalRecordsTaken", width: 20 },
        { header: "Avg Records/Day", key: "avgRecordsPerDay", width: 18 },
        { header: "Attendance % (This Period)", key: "attendancePercentage", width: 22 },
        { header: "Total Days (All Chillas)", key: "totalDaysAllChillas", width: 22 },
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
        const percentageCell = row.getCell("attendancePercentage");
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
    const totalRecordsTaken = reportData.reduce((sum, v) => sum + v.totalRecordsTaken, 0);
    const avgRecordsPerVolunteer = totalVolunteers > 0
        ? (totalRecordsTaken / totalVolunteers).toFixed(2)
        : "0.00";

    summarySheet.columns = [
        { header: "Metric", key: "metric", width: 40 },
        { header: "Value", key: "value", width: 15 },
    ];

    const summaryHeaderRow = summarySheet.getRow(1);
    summaryHeaderRow.font = { bold: true, color: { argb: "FFFFFF" } };
    summaryHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "4472C4" },
    };

    summarySheet.addRow({ metric: `Volunteers in ${chilla.name} Category`, value: totalVolunteers });
    summarySheet.addRow({ metric: "Total Days in This Period", value: totalDays });
    summarySheet.addRow({ metric: "Period Covered", value: `${formatISTDate(chilla.startDate)} to ${formatISTDate(chilla.endDate)}` });
    summarySheet.addRow({ metric: "Required Total Days Range (All Chillas)", value: "All volunteers included" });
    summarySheet.addRow({ metric: "Average Attendance % (This Period)", value: parseFloat(avgAttendance) });
    summarySheet.addRow({ metric: "Total Records Taken (This Period)", value: totalRecordsTaken });
    summarySheet.addRow({ metric: "Avg Records per Volunteer", value: parseFloat(avgRecordsPerVolunteer) });
    summarySheet.addRow({ metric: "", value: "" }); // Empty row
    summarySheet.addRow({ metric: "100% Attendance (This Period)", value: perfect100 });
    summarySheet.addRow({ metric: "80-99% Attendance", value: above80 });
    summarySheet.addRow({ metric: "50-79% Attendance", value: between50and80 });
    summarySheet.addRow({ metric: "Below 50% Attendance", value: below50 });
    summarySheet.addRow({ metric: "0% Attendance (This Period)", value: zeroAttendance });

    // Add daily activity sheet - Calendar style view
    const dailySheet = workbook.addWorksheet("Daily Activity Details");

    // Generate all dates in THIS specific period only
    const allDates = [];
    let currentDate = new Date(chilla.startDate); // Start from THIS Chilla's start
    const endDate = new Date(chilla.endDate);     // End at THIS Chilla's end

    while (currentDate <= endDate) {
        allDates.push(formatISTDate(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Create columns: Volunteer Name, User ID, then one column per date
    const columns = [
        { header: "Volunteer Name", key: "volunteerName", width: 25 },
        { header: "Hafiz?", key: "isHafiz", width: 10 },
        { header: "User ID", key: "userId", width: 35 },
        { header: "Masjid", key: "masjid", width: 25 },
        { header: "Cluster", key: "cluster", width: 10 },
    ];

    // Add date columns
    allDates.forEach((date) => {
        columns.push({
            header: date,
            key: `date_${date}`,
            width: 12,
        });
    });

    dailySheet.columns = columns;

    // Style header row
    const dailyHeaderRow = dailySheet.getRow(1);
    dailyHeaderRow.font = { bold: true, color: { argb: "FFFFFF" } };
    dailyHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "4472C4" },
    };
    dailyHeaderRow.alignment = { vertical: "middle", horizontal: "center" };

    // Add data rows for each filtered volunteer
    reportVolunteers.forEach((volunteer, userId) => {
        const rowData = {
            volunteerName: volunteer.name,
            isHafiz: volunteer.isHafiz,
            userId: userId,
            masjid: volunteer.masjid,
            cluster: volunteer.cluster,
        };

        const attendanceRecords = chillaAttendance[userId] || {};

        // For each date, mark as Present or Absent
        allDates.forEach((date) => {
            const recordCount = attendanceRecords[date] || 0;
            rowData[`date_${date}`] = recordCount > 0 ? `P (${recordCount})` : "A";
        });

        const row = dailySheet.addRow(rowData);

        // Color code each date cell

        allDates.forEach((date, index) => {
            const cellIndex = index + 6; // +6 because first 5 columns are name, hafiz, userId, masjid, cluster
            const cell = row.getCell(cellIndex);
            const recordCount = attendanceRecords[date] || 0;

            cell.alignment = { vertical: "middle", horizontal: "center" };

            if (recordCount > 0) {
                // Green for Present
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "C6EFCE" },
                };
                cell.font = { color: { argb: "006100" }, bold: true };
            } else {
                // Red for Absent
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FFC7CE" },
                };
                cell.font = { color: { argb: "9C0006" }, bold: true };
            }
        });
    });

    // Save the workbook
    const outputPath = path.join(__dirname, chilla.filename);
    await workbook.xlsx.writeFile(outputPath);

    console.log(`✅ ${chilla.name} report created: ${outputPath}`);
    console.log(`   Volunteers in this report: ${totalVolunteers}`);
    console.log(`   Average Attendance (This Period): ${avgAttendance}%`);
    console.log(`   Total Records Taken (This Period): ${totalRecordsTaken}\n`);
}

// ---------------------------------------------------------
// MAIN FUNCTION
// ---------------------------------------------------------
async function generateAllChillaReports() {
    console.log("🚀 Starting Volunteer Chilla Attendance Reports Generation...\n");

    // Fetch all volunteer users
    const volunteerUsers = await fetchVolunteerUsers();

    if (volunteerUsers.size === 0) {
        console.log("⚠️ No volunteers found in Users collection.");
        return;
    }

    // Fetch ALL attendance data across all 3 Chillas
    const allVolunteerAttendance = await fetchAllVolunteerAttendance(volunteerUsers);

    // Calculate total days worked for each volunteer across ALL Chillas
    const totalDaysWorked = calculateTotalDaysWorked(allVolunteerAttendance);

    console.log("\n📊 Total Days Worked Distribution:");
    const distribution = {};
    Object.values(totalDaysWorked).forEach(days => {
        distribution[days] = (distribution[days] || 0) + 1;
    });

    console.log(`   40 days (1st Chilla only): ${distribution[40] || 0} volunteers`);
    console.log(`   80 days (1st + 2nd Chilla): ${distribution[80] || 0} volunteers`);
    console.log(`   120 days (All 3 Chillas): ${distribution[120] || 0} volunteers`);
    console.log(`   Other: ${Object.entries(distribution).filter(([days]) => ![40, 80, 120].includes(parseInt(days))).reduce((sum, [_, count]) => sum + count, 0)} volunteers\n`);

    // Generate reports for each Chilla
    for (const chilla of CHILLA_PERIODS) {
        await generateChillaReport(chilla, volunteerUsers, allVolunteerAttendance, totalDaysWorked);
    }

    console.log("========================================");
    console.log("✅ All 3 Volunteer Chilla attendance reports generated successfully!");
    console.log("========================================");
}

generateAllChillaReports().catch(console.error);
