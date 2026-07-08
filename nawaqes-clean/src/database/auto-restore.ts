import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';

const PERSISTENT_DIR = fs.existsSync('/data') ? '/data' : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(PERSISTENT_DIR, 'nawaqes.db');
const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_BACKUP_REPO = process.env.HF_BACKUP_REPO || 'safwatkhokha/nawaqes-backups';

/**
 * Auto-restore the database from HF Datasets backup if the local DB file
 * is missing OR is older than 1 hour (e.g. after a container rebuild).
 *
 * This is the CRITICAL mechanism that prevents user data loss on every
 * Hugging Face Space rebuild. The HF free tier does NOT have persistent
 * storage, so /data is wiped on each rebuild. We must restore from the
 * HF Datasets backup before the server starts.
 */
export async function autoRestoreDB() {
  console.log('[RESTORE] Checking for database backup...');

  const dbExists = fs.existsSync(DB_FILE) && fs.statSync(DB_FILE).size > 0;

  // If DB exists AND was modified in the last hour, skip restore (already fresh)
  if (dbExists) {
    const stat = fs.statSync(DB_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < 60 * 60 * 1000) {
      console.log(`[RESTORE] DB exists and is fresh (${Math.round(ageMs / 1000 / 60)} min old), skipping restore`);
      return;
    }
    console.log(`[RESTORE] DB exists but is ${Math.round(ageMs / 1000 / 60)} min old — will try to restore newer backup`);
  }

  if (!HF_TOKEN) {
    console.log('[RESTORE] ⚠️  No HF_TOKEN set — cannot restore from backup!');
    console.log('[RESTORE] ⚠️  Set HF_TOKEN as a Space secret to enable auto-restore.');
    return;
  }

  try {
    // List all backup files in the HF Datasets repo
    console.log(`[RESTORE] Listing backups from ${HF_BACKUP_REPO}...`);
    const listScript = `
import json, os
from huggingface_hub import HfApi
api = HfApi()
try:
    files = api.list_repo_files(os.environ['HF_BACKUP_REPO'], repo_type='dataset')
    # Look for both new (backups/DATE/...) and old (root .db.gz) backup layouts
    backups = sorted([f for f in files if f.endswith('.db.gz')], reverse=True)
    print(json.dumps(backups[:10]))
except Exception as e:
    print('[]')
`;
    const output = execFileSync('python3', ['-c', listScript], {
      encoding: 'utf-8',
      env: { ...process.env, HF_BACKUP_REPO },
      timeout: 60000,
    }).trim();

    const backups = JSON.parse(output);
    if (backups.length === 0) {
      console.log('[RESTORE] No backups found in HF repo');
      return;
    }

    console.log(`[RESTORE] Found ${backups.length} backups. Latest: ${backups[0]}`);

    // If we already have a local DB, only restore if the backup is NEWER
    if (dbExists) {
      const localMtime = fs.statSync(DB_FILE).mtimeMs;
      // Extract timestamp from backup filename if possible
      const backupFilename = backups[0].split('/').pop() || backups[0];
      const dateMatch = backupFilename.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        const [, y, mo, d, h, mi, s] = dateMatch;
        const backupTime = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`).getTime();
        if (backupTime <= localMtime) {
          console.log('[RESTORE] Local DB is newer than latest backup, skipping restore');
          return;
        }
        console.log(`[RESTORE] Backup is newer than local DB — will restore`);
      }
    }

    // Download the latest backup
    const tempPath = path.join(PERSISTENT_DIR, 'restore_temp.db.gz');
    console.log(`[RESTORE] Downloading ${backups[0]}...`);
    const downloadScript = `
import os, shutil
from huggingface_hub import hf_hub_download
path = hf_hub_download(
    repo_id=os.environ['HF_BACKUP_REPO'],
    filename=os.environ['HF_BACKUP_FILENAME'],
    repo_type='dataset',
    token=os.environ['HF_TOKEN'],
)
shutil.copy2(path, os.environ['HF_TEMP_PATH'])
`;
    execFileSync('python3', ['-c', downloadScript], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        HF_BACKUP_REPO,
        HF_BACKUP_FILENAME: backups[0],
        HF_TEMP_PATH: tempPath,
      },
      timeout: 180000,
    });

    // Decompress
    execSync(`gunzip -f ${JSON.stringify(tempPath)}`, { stdio: 'ignore' });
    const decompressed = tempPath.replace('.gz', '');

    if (fs.existsSync(decompressed)) {
      // Backup current DB if it exists (just in case)
      if (dbExists) {
        const oldBackup = DB_FILE + '.old';
        try {
          fs.copyFileSync(DB_FILE, oldBackup);
          console.log(`[RESTORE] Old DB backed up to ${oldBackup}`);
        } catch {}
      }
      fs.copyFileSync(decompressed, DB_FILE);
      fs.unlinkSync(decompressed);
      console.log(`[RESTORE] ✅ Database restored from ${backups[0]}!`);
      console.log(`[RESTORE] DB size: ${fs.statSync(DB_FILE).size} bytes`);
    } else {
      console.error('[RESTORE] ❌ Decompressed file not found!');
    }
  } catch (err: any) {
    console.warn('[RESTORE] Failed:', err.message);
    console.warn('[RESTORE] ⚠️  Server will start with empty/fresh database.');
    console.warn('[RESTORE] ⚠️  All previous user data will be LOST unless backup exists!');
  }
}
