import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load service account (Adjust path if needed, assumed same relative location as reference)
const serviceAccountPath = path.join(__dirname, "../../Phase_2_key/service_account.json");
const serviceAccountJSON = JSON.parse(await readFile(serviceAccountPath, "utf-8"));

if (!process.listeners('uncaughtException').length) {
    // Basic error handling to prevent hard crashing on some errors if needed
}

initializeApp({
    credential: cert(serviceAccountJSON),
});

const db = getFirestore();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

// Helpers
function formatISTDate(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return "Invalid Date";
    return dateObj.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

// Main logic
async function main() {
    try {
        console.log("Initializing...");

        // 1. Fetch all users to resolve names
        console.log("Fetching User Directory...");
        const usersSnapshot = await db.collection("Users").get();
        const userMap = new Map(); // ID -> Name
        const volunteerMap = new Map(); // Name (lowercase) -> { id, originalName }

        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const name = data.name || data.displayName;
            if (name) {
                userMap.set(doc.id, name);

                // For searching (simplistic approach: just exact lowercase match or partial)
                // In a real app with many users, might need better search index, but for this script it's fine.
                const lowerName = name.toLowerCase();
                if (!volunteerMap.has(lowerName)) {
                    volunteerMap.set(lowerName, []);
                }
                volunteerMap.get(lowerName).push({ id: doc.id, originalName: name });
            }
        });
        console.log(`Loaded ${userMap.size} users.`);

        // 2. Ask for volunteer name
        while (true) {
            const inputName = await askQuestion("\nEnter Volunteer Name to search (or 'exit' to quit): ");
            if (inputName.trim().toLowerCase() === 'exit') break;

            const searchKey = inputName.trim().toLowerCase();

            // Find matches
            let matches = [];

            // Exact/Startswith match
            for (const [key, val] of volunteerMap.entries()) {
                if (key.includes(searchKey)) {
                    matches = matches.concat(val);
                }
            }

            if (matches.length === 0) {
                console.log("No volunteer found with that name. Try again.");
                continue;
            }

            let selectedVolunteer = null;

            if (matches.length === 1) {
                selectedVolunteer = matches[0];
            } else {
                console.log("\nMultiple matches found:");
                matches.forEach((m, idx) => console.log(`${idx + 1}. ${m.originalName} (ID: ${m.id})`));
                const choice = await askQuestion("Select number (or 0 to cancel): ");
                const choiceIdx = parseInt(choice) - 1;
                if (choiceIdx >= 0 && choiceIdx < matches.length) {
                    selectedVolunteer = matches[choiceIdx];
                } else {
                    console.log("Selection cancelled.");
                    continue;
                }
            }

            if (!selectedVolunteer) continue;

            console.log(`\nSelected Volunteer: ${selectedVolunteer.originalName}`);
            console.log("Fetching attendance records...");

            // 3. Query Attendance
            // User requested range from 01-Aug to present.
            const START_DATE = new Date("2025-08-01T00:00:00");

            const attendanceSnapshot = await db.collection("Attendance")
                .where("tracked_by.userId", "==", selectedVolunteer.id)
                .where("attendance_time", ">=", START_DATE)
                .orderBy("attendance_time", "desc")
                .get();

            if (attendanceSnapshot.empty) {
                console.log("No attendance records found for this volunteer.");
            } else {
                console.log(`Found ${attendanceSnapshot.size} records (showing last 100):`);
                console.log("---------------------------------------------------");
                console.log(String("Timestamp (IST)").padEnd(30) + " | " + "Student Name");
                console.log("---------------------------------------------------");

                attendanceSnapshot.forEach(doc => {
                    const data = doc.data();
                    const time = data.attendance_time ? data.attendance_time.toDate() : null;
                    const studentId = data.studentId;
                    const studentName = userMap.get(studentId) || `Unknown ID (${studentId})`;

                    console.log(String(formatISTDate(time)).padEnd(30) + " | " + studentName);
                });
                console.log("---------------------------------------------------");
            }
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        rl.close();
        process.exit(0);
    }
}

main();
