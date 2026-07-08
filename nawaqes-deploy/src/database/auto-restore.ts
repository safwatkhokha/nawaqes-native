import fs from 'fs';
import path from 'path';

const PERSISTENT_DIR = fs.existsSync('/data') ? '/data' : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(PERSISTENT_DIR, 'nawaqes.db');
const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_BACKUP_REPO = process.env.HF_BACKUP_REPO || 'safwatkhokha/nawaqes-backups';

/**
 * Auto-restore the database from HF Datasets backup.
 *
 * 🔧 DISABLED: This feature was causing deleted posts to reappear!
 * The backup runs every 1 minute, and when the container restarts,
 * it restores the LATEST backup — which may contain posts that were
 * deleted AFTER the backup was created.
 *
 * On HF Spaces, /data is persistent storage, so the DB survives
 * container rebuilds WITHOUT needing restore. The restore is only
 * needed for the very first deploy (when /data is empty).
 *
 * We now ONLY restore if the DB file doesn't exist at all.
 */
export async function autoRestoreDB() {
  console.log('[RESTORE] Checking database...');

  const dbExists = fs.existsSync(DB_FILE) && fs.statSync(DB_FILE).size > 0;

  // Only restore if DB doesn't exist at all (first deploy)
  if (dbExists) {
    const stat = fs.statSync(DB_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    console.log(`[RESTORE] DB exists (${Math.round(ageMs / 1000 / 60)} min old, ${stat.size} bytes) — keeping existing DB`);
    return;
  }

  // DB doesn't exist — try to restore from backup
  if (!HF_TOKEN) {
    console.log('[RESTORE] No HF_TOKEN — starting with fresh database');
    return;
  }

  try {
    console.log(`[RESTORE] DB not found — restoring from ${HF_BACKUP_REPO}...`);
    const { execFileSync } = await import('child_process');

    // List all backup files in the HF Datasets repo
    const listScript = `
import json, os
from huggingface_hub import HfApi
api = HfApi()
try:
    files = api.list_repo_files(os.environ['HF_BACKUP_REPO'], repo_type='dataset')
    backups = sorted([f for f in files if f.endswith('.db.gz')], reverse=True)
    print(json.dumps(backups[:5]))
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
      console.log('[RESTORE] No backups found — starting fresh');
      return;
    }

    console.log(`[RESTORE] Found ${backups.length} backups. Latest: ${backups[0]}`);

    // Download the latest backup
    const tempPath = path.join(PERSISTENT_DIR, 'restore_temp.db.gz');
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
    const { execSync } = await import('child_process');
    execSync(`gunzip -f ${JSON.stringify(tempPath)}`, { stdio: 'ignore' });
    const decompressed = tempPath.replace('.gz', '');

    if (fs.existsSync(decompressed)) {
      fs.copyFileSync(decompressed, DB_FILE);
      fs.unlinkSync(decompressed);
      console.log(`[RESTORE] ✅ Database restored from ${backups[0]}!`);
      console.log(`[RESTORE] DB size: ${fs.statSync(DB_FILE).size} bytes`);
    } else {
      console.error('[RESTORE] ❌ Decompressed file not found!');
    }
  } catch (err: any) {
    console.warn('[RESTORE] Failed:', err.message);
    console.warn('[RESTORE] Starting with fresh database.');
  }
}
