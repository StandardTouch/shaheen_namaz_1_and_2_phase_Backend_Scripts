# Chilla Attendance Reports - Summary

## Generated Files

Three Excel attendance reports have been successfully generated in:
`/home/maaz/Desktop/shaheen_namaz_1_and_2_phase_Backend_Scripts/src/Phase_2_Scripts/`

### 1. 1st_Chilla_Attendance_01Aug25_09Sept25.xlsx
- **Period:** August 1, 2025 to September 9, 2025
- **Total Days:** 41 days
- **Total Volunteers:** 649
- **Average Attendance:** 13.08%
- **Volunteers with 100% Attendance:** 0
- **Volunteers with 0% Attendance:** 210

### 2. 2nd_Chilla_Attendance_10Sept25_19Oct25.xlsx
- **Period:** September 10, 2025 to October 19, 2025
- **Total Days:** 41 days
- **Total Volunteers:** 649
- **Average Attendance:** 25.59%
- **Volunteers with 100% Attendance:** 0
- **Volunteers with 0% Attendance:** 177

### 3. 3rd_Chilla_Attendance_20Oct25_28Nov25.xlsx
- **Period:** October 20, 2025 to November 28, 2025
- **Total Days:** 41 days
- **Total Volunteers:** 649
- **Average Attendance:** 18.59%
- **Volunteers with 100% Attendance:** 0
- **Volunteers with 0% Attendance:** 302

## Excel File Structure

Each Excel file contains **3 worksheets**:

### Sheet 1: [Chilla Name] - Main Attendance Data
Contains detailed attendance information for all 649 volunteers with the following columns:

1. **Student ID** - Unique identifier for each volunteer
2. **Name** - Volunteer's name
3. **Guardian Number** - Contact number
4. **Masjid Name** - Name of the mosque
5. **Masjid ID** - Unique mosque identifier
6. **Cluster Number** - Cluster assignment
7. **Total Days** - Total days in the Chilla period (41 days)
8. **Days Attended** - Number of days the volunteer attended
9. **Days Absent** - Number of days the volunteer was absent
10. **Attendance %** - Attendance percentage (0% to 100%)

**Color Coding for Attendance %:**
- 🟢 **Green** (80-100%): Excellent attendance
- 🟡 **Yellow** (50-79%): Good attendance
- 🔴 **Red** (0-49%): Poor attendance

**Sorting:** Volunteers are sorted by attendance percentage in descending order (highest to lowest).

### Sheet 2: Summary Statistics
Provides overall statistics for the Chilla period:

- Total Volunteers
- Total Days in Period
- Average Attendance %
- Breakdown by attendance ranges:
  - 100% Attendance
  - 80-99% Attendance
  - 50-79% Attendance
  - Below 50% Attendance
  - 0% Attendance (No Show)

### Sheet 3: Cluster Summary
Shows cluster-wise attendance analysis:

- Cluster Number
- Total Volunteers per cluster
- Average Attendance % per cluster

## How to Use the Script

To regenerate the reports or modify them, run:

```bash
cd /home/maaz/Desktop/shaheen_namaz_1_and_2_phase_Backend_Scripts/src/Phase_2_Scripts
node chilla_attendance_reports.js
```

## Script Location

The script is located at:
`/home/maaz/Desktop/shaheen_namaz_1_and_2_phase_Backend_Scripts/src/Phase_2_Scripts/chilla_attendance_reports.js`

## Data Source

- **Volunteers:** Extracted from all unique student IDs in the Attendance collection
- **Attendance Records:** Fetched from Firestore `Attendance` collection
- **Date Range:** Each Chilla period has specific start and end dates as defined in the script

## Key Features

1. ✅ **Comprehensive Coverage:** All 649 volunteers included (0% to 100% attendance)
2. ✅ **Color-Coded Visualization:** Easy identification of attendance levels
3. ✅ **Multiple Analytics:** Main data, summary statistics, and cluster analysis
4. ✅ **Accurate Calculations:** Proper IST timezone handling and date formatting
5. ✅ **Professional Formatting:** Styled headers, proper column widths, and number formatting

## Notes

- The script automatically handles timezone conversion to IST (Indian Standard Time)
- Volunteers with no attendance in a specific Chilla period will show 0% attendance
- The script extracts volunteer information from the Attendance collection since the Students collection is currently empty
- All three Chilla periods are exactly 41 days each
