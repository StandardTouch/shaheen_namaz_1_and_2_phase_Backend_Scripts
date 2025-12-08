# Volunteer Chilla Attendance Reports - Summary

## 🎯 Purpose

These reports track **VOLUNTEER ATTENDANCE** - the people who are **taking attendance** of students, not the students themselves. The reports show:
- How many days each volunteer worked during each Chilla period
- How many attendance records each volunteer took per day
- Attendance percentage (0% to 100%) for each volunteer

## 📊 Generated Files

Three Excel attendance reports have been successfully generated in:
`/home/maaz/Desktop/shaheen_namaz_1_and_2_phase_Backend_Scripts/src/Phase_2_Scripts/`

### 1. Volunteer_1st_Chilla_Attendance_01Aug25_09Sept25.xlsx
- **Period:** August 1, 2025 to September 9, 2025
- **Total Days:** 41 days
- **Total Volunteers:** 174 (from Users collection with role='volunteer')
- **Active Volunteers:** 76 (volunteers who took at least 1 attendance)
- **Average Attendance:** 13.36%
- **Total Records Taken:** 2,937 student attendance records
- **Volunteers with 100% Attendance:** 0
- **Volunteers with 0% Attendance:** 98

### 2. Volunteer_2nd_Chilla_Attendance_10Sept25_19Oct25.xlsx
- **Period:** September 10, 2025 to October 19, 2025
- **Total Days:** 41 days
- **Total Volunteers:** 174
- **Active Volunteers:** 84 (volunteers who took at least 1 attendance)
- **Average Attendance:** 23.13%
- **Total Records Taken:** 5,558 student attendance records
- **Volunteers with 100% Attendance:** 0
- **Volunteers with 0% Attendance:** 90

### 3. Volunteer_3rd_Chilla_Attendance_20Oct25_28Nov25.xlsx
- **Period:** October 20, 2025 to November 28, 2025
- **Total Days:** 41 days
- **Total Volunteers:** 174
- **Active Volunteers:** 63 (volunteers who took at least 1 attendance)
- **Average Attendance:** 17.98%
- **Total Records Taken:** 4,190 student attendance records
- **Volunteers with 100% Attendance:** 0
- **Volunteers with 0% Attendance:** 111

## 📋 Excel File Structure

Each Excel file contains **3 worksheets**:

### Sheet 1: [Chilla Name] - Main Volunteer Attendance Data

Contains detailed attendance information for all 174 volunteers with the following columns:

1. **Volunteer User ID** - Firebase Auth user ID from Users collection
2. **Volunteer Name** - Name of the volunteer
3. **Email** - Volunteer's email address
4. **Phone** - Volunteer's phone number
5. **Total Days** - Total days in the Chilla period (41 days)
6. **Days Worked** - Number of days the volunteer took attendance
7. **Days Absent** - Number of days the volunteer did not take attendance
8. **Total Records Taken** - Total number of student attendance records taken by this volunteer
9. **Avg Records/Day** - Average number of records taken per working day
10. **Attendance %** - Attendance percentage (0% to 100%)

**Color Coding for Attendance %:**
- 🟢 **Green** (80-100%): Excellent attendance
- 🟡 **Yellow** (50-79%): Good attendance
- 🔴 **Red** (0-49%): Poor attendance

**Sorting:** Volunteers are sorted by attendance percentage in descending order (highest to lowest).

### Sheet 2: Summary Statistics

Provides overall statistics for the Chilla period:

- Total Volunteers (all volunteers from Users collection)
- Total Days in Period
- Average Attendance %
- Total Records Taken (total student attendance records)
- Avg Records per Volunteer
- Breakdown by attendance ranges:
  - 100% Attendance
  - 80-99% Attendance
  - 50-79% Attendance
  - Below 50% Attendance
  - 0% Attendance (No Show)

### Sheet 3: Daily Activity Details

Shows day-by-day activity for each volunteer:

- Volunteer Name
- User ID
- Date (YYYY-MM-DD format)
- Records Taken (how many student attendance records taken that day)

This sheet helps identify:
- Which volunteers are most active
- Daily patterns of volunteer activity
- Days with high/low volunteer participation

## 🔍 How the Data is Collected

### Data Source: Attendance Collection

Each attendance record in Firestore has a `tracked_by` field that contains:
```javascript
tracked_by: {
  name: "abdul khadir",
  userId: "ypRY9Rnqk6cR5F8ORRDa13IWzB43"
}
```

### Filtering Logic

1. **Fetch all volunteers** from `Users` collection where `role = "volunteer"` (case-insensitive)
2. **Scan Attendance records** within each Chilla period
3. **Extract `tracked_by.userId`** from each attendance record
4. **Filter** to only include records where `tracked_by.userId` matches a volunteer user ID
5. **Count** how many times each volunteer took attendance per day
6. **Calculate** attendance percentage based on days worked vs total days

### Key Metrics

- **Days Worked:** Number of unique dates when the volunteer took at least 1 attendance
- **Total Records Taken:** Sum of all student attendance records taken by this volunteer
- **Avg Records/Day:** Total records ÷ Days worked
- **Attendance %:** (Days worked ÷ Total days in period) × 100

## 🚀 How to Use the Script

To regenerate the reports or modify them, run:

```bash
cd /home/maaz/Desktop/shaheen_namaz_1_and_2_phase_Backend_Scripts/src/Phase_2_Scripts
node volunteer_chilla_attendance_reports.js
```

## 📁 Script Location

The script is located at:
`/home/maaz/Desktop/shaheen_namaz_1_and_2_phase_Backend_Scripts/src/Phase_2_Scripts/volunteer_chilla_attendance_reports.js`

## ✨ Key Features

1. ✅ **Volunteer-Focused:** Tracks volunteers who take attendance, not students
2. ✅ **Role-Based Filtering:** Only includes users with role='volunteer' from Users collection
3. ✅ **Daily Activity Tracking:** Shows how many records each volunteer took per day
4. ✅ **Comprehensive Coverage:** All 174 volunteers included (0% to 100% attendance)
5. ✅ **Color-Coded Visualization:** Easy identification of attendance levels
6. ✅ **Multiple Analytics:** Main data + summary statistics + daily activity details
7. ✅ **Accurate Calculations:** Proper IST timezone handling and date formatting
8. ✅ **Professional Formatting:** Styled headers, proper column widths, and number formatting

## 📊 Sample Insights

From the generated reports, you can answer questions like:

- **Who are the most dedicated volunteers?** (Sort by attendance % or total records taken)
- **Which volunteers never showed up?** (Filter for 0% attendance)
- **What's the average workload per volunteer?** (See avg records per volunteer in summary)
- **Which days had the most volunteer activity?** (Check Daily Activity Details sheet)
- **How many volunteers worked consistently?** (Filter for 80%+ attendance)

## 🔄 Comparison with Previous Reports

**Previous Reports (Student Attendance):**
- Tracked: Students attending classes
- Data: 649 unique students
- Purpose: Monitor student participation

**New Reports (Volunteer Attendance):**
- Tracked: Volunteers taking attendance
- Data: 174 volunteers from Users collection
- Purpose: Monitor volunteer participation and workload
- Additional Metrics: Records taken per day, daily activity details

## 📝 Notes

- The script automatically handles timezone conversion to IST (Indian Standard Time)
- Volunteers with no attendance in a specific Chilla period will show 0% attendance
- Only users with `role = "volunteer"` (case-insensitive) are included
- Trustees and other user roles are excluded from these reports
- All three Chilla periods are exactly 41 days each
- Multiple attendance records taken by the same volunteer on the same day are counted separately

## 🎓 Understanding the Metrics

### Example Volunteer Data:
```
Volunteer: Abdul Khadir
Days Worked: 15 out of 41 days
Total Records Taken: 120 student attendance records
Avg Records/Day: 8.00 records per day
Attendance %: 36.59%
```

This means:
- Abdul worked 15 days during the 41-day Chilla period
- He took attendance for 120 students total
- On average, he recorded 8 students per working day
- His attendance rate is 36.59% (15/41 days)
