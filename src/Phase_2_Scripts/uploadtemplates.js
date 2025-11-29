import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔐 Load NEW project's service account JSON
const serviceAccountPath = path.join(__dirname, '/home/maaz/Documents/shaheen_namaz_phase_1_and_2_Backend_and_frontend_scripts/Phase_2_key/service_account.json');
const serviceAccountJSON = JSON.parse(await readFile(serviceAccountPath, 'utf-8'));

// 🔥 Initialize Firebase Admin for the new project
initializeApp({
  credential: cert(serviceAccountJSON),
  storageBucket: 'shaheen-namaz-phase-2.firebasestorage.app', // 👈 replace with target bucket
});

const bucket = getStorage().bucket();

async function uploadFolder(localFolder, remotePrefix = '') {
  const entries = fs.readdirSync(localFolder, { withFileTypes: true });

  for (const entry of entries) {
    const localPath = path.join(localFolder, entry.name);
    const remotePath = path.posix.join(remotePrefix, entry.name);

    if (entry.isDirectory()) {
      // recurse into subfolder
      await uploadFolder(localPath, remotePath);
    } else {
      await bucket.upload(localPath, { destination: remotePath });
      console.log(`✅ Uploaded: ${localPath} → ${remotePath}`);
    }
  }
}

async function uploadTemplatesFolder() {
  const localFolder = path.join(__dirname, 'templates'); // 👈 your local folder

  if (!fs.existsSync(localFolder)) {
    console.error('❌ Local templates folder not found:', localFolder);
    return;
  }

  await uploadFolder(localFolder, 'templates'); // keep `templates/` prefix in bucket
  console.log('🎉 All templates (with subfolders) uploaded successfully.');
}

uploadTemplatesFolder().catch(console.error);
