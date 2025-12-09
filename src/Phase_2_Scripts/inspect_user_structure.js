
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = "/home/maaz/Desktop/shaheen_namaz_1_and_2_phase_Backend_Scripts/Phase_2_key/service_account.json";
const serviceAccountJSON = JSON.parse(await readFile(serviceAccountPath, "utf-8"));

initializeApp({
    credential: cert(serviceAccountJSON),
});

const db = getFirestore();


async function findHafizUser() {
    console.log("Searching for a user with 'hafiz' in their data...");
    const snapshot = await db.collection("Users").limit(500).get();

    let found = false;
    snapshot.forEach(doc => {
        if (found) return;
        const data = doc.data();
        const json = JSON.stringify(data).toLowerCase();
        if (json.includes('hafiz')) {
            console.log(`\n!!! FOUND USER WITH HAFIZ !!! User ID: ${doc.id}`);
            console.log(JSON.stringify(data, null, 2));
            found = true;
        }
    });

    if (!found) console.log("No user found with 'hafiz' keyword in first 500 users.");
}

findHafizUser().catch(console.error);


async function inspectUsers() {
    console.log("Fetching a few users to inspect structure...");
    const snapshot = await db.collection("Users").limit(10).get();

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`\nUser ID: ${doc.id}`);
        console.log("Keys:", Object.keys(data));

        // Check for specific value types or keywords
        if (JSON.stringify(data).toLowerCase().includes('hafiz')) {
            console.log("!!! FOUND HAFIZ KEYWORD IN DATA !!!");
            console.log(JSON.stringify(data, null, 2));
        }

        // Also print roles to see if Hafiz is a role
        if (data.role) console.log("Role:", data.role);
    });
}

inspectUsers().catch(console.error);
