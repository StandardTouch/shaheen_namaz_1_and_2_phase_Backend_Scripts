import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "fs/promises";

// Load service account
const serviceAccountPath = "/home/maaz/Desktop/shaheen_namaz_1_and_2_phase_Backend_Scripts/Phase_2_key/service_account.json";
const serviceAccountJSON = JSON.parse(await readFile(serviceAccountPath, "utf-8"));

initializeApp({
    credential: cert(serviceAccountJSON),
});

const db = getFirestore();

async function debugUserData() {
    console.log("🔍 Fetching sample users to debug data structure...\n");

    const snapshot = await db.collection("Users").limit(10).get();

    snapshot.forEach((doc) => {
        const data = doc.data();
        const userId = doc.id;

        console.log("=".repeat(80));
        console.log(`User ID: ${userId}`);
        console.log(`Name: ${data.name || data.displayName || "Unknown"}`);
        console.log(`Role: ${data.role || "N/A"}`);
        console.log("\n--- Masjid Data ---");
        
        // Check managedMasjids
        if (data.managedMasjids) {
            console.log("managedMasjids exists:");
            console.log(`  Type: ${Array.isArray(data.managedMasjids) ? 'Array' : typeof data.managedMasjids}`);
            console.log(`  Length: ${data.managedMasjids.length}`);
            if (Array.isArray(data.managedMasjids) && data.managedMasjids.length > 0) {
                console.log("  Contents:");
                data.managedMasjids.forEach((m, idx) => {
                    console.log(`    [${idx}] masjidName: "${m?.masjidName || 'EMPTY'}", clusterNumber: "${m?.clusterNumber || 'EMPTY'}"`);
                });
            } else {
                console.log("  Array is empty");
            }
        } else {
            console.log("managedMasjids: DOES NOT EXIST");
        }

        // Check masjidDetails
        if (data.masjidDetails) {
            console.log("\nmasjidDetails exists:");
            console.log(`  masjidName: "${data.masjidDetails.masjidName || 'EMPTY'}"`);
            console.log(`  clusterNumber: "${data.masjidDetails.clusterNumber || 'EMPTY'}"`);
        } else {
            console.log("\nmasjidDetails: DOES NOT EXIST");
        }

        // Check assignedMasjid
        if (data.assignedMasjid) {
            console.log("\nassignedMasjid exists:");
            console.log(`  masjidName: "${data.assignedMasjid.masjidName || 'EMPTY'}"`);
            console.log(`  clusterNumber: "${data.assignedMasjid.clusterNumber || 'EMPTY'}"`);
        } else {
            console.log("\nassignedMasjid: DOES NOT EXIST");
        }

        console.log("\n");
    });

    console.log("=".repeat(80));
    console.log("\n✅ Debug complete. Check the output above to see the actual data structure.");
}

debugUserData().catch(console.error);