// Standalone pre-startup restore script.
// This is bundled separately as dist/restore.mjs and runs BEFORE
// the main server starts, so the `db` module (which creates/seeds
// a fresh database on import) does NOT wipe out the restored data.
//
// Usage:  node dist/restore.mjs && node dist/server.mjs

import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';

const PERSISTENT_DIR = fs.existsSync('/data') ? '/data' : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(PERSISTENT_DIR, 'nawaqes.db');
const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_BACKUP_REPO = process.env.HF_BACKUP_REPO || 'safwatkhokha/nawaqes-backup';

async function autoRestoreDB() {
  console.log('[RESTORE] Checking for database backup...');

  // If DB exists AND was modified recently (within 5 minutes), skip restore.
  // 🔧 FIX: previously this was 6 HOURS which meant after a rebuild that
  // wiped /data, the restore would skip even though the local DB was
  // freshly-seeded (empty). Now we use 5 MINUTES — only skip if the DB
  // was actually written to in the last 5 min (i.e., the server is
  // restarting from a brief crash, not a full rebuild).
  if (fs.existsSync(DB_FILE) && fs.statSync(DB_FILE).size > 0) {
    const stat = fs.statSync(DB_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    const FIVE_MINUTES = 5 * 60 * 1000;
    if (ageMs < FIVE_MINUTES) {
      console.log(`[RESTORE] DB exists and is fresh (${Math.round(ageMs / 1000 / 60)} min old), skipping restore`);
      return;
    }
    console.log(`[RESTORE] DB exists but is ${Math.round(ageMs / 1000 / 60)} min old — will try to restore newer backup`);
  } else {
    console.log('[RESTORE] DB file does not exist or is empty — must restore from backup');
  }

  if (!HF_TOKEN) {
    console.log('[RESTORE] ⚠️  No HF_TOKEN set — cannot restore from backup!');
    console.log('[RESTORE] ⚠️  Set HF_TOKEN as a Space secret to enable auto-restore.');
    console.log('[RESTORE] ⚠️  Server will start with FRESH database — ALL USERS WILL BE LOST.');
    return;
  }

  try {
    // List all backup files in the HF Datasets repo
    console.log(`[RESTORE] Listing backups from ${HF_BACKUP_REPO}...`);
    // 🔒 SECURITY FIX: previously used execSync(`python3 -c "...${HF_BACKUP_REPO}..."`)
    // which is shell injection if the env var or backup filename contains a
    // single quote. Now we use execFileSync (no shell) and pass arguments
    // as a separate argv array — no interpolation into Python source.
    const listScript = `
import json, os, re
from huggingface_hub import HfApi
api = HfApi()
try:
    files = api.list_repo_files(os.environ['HF_BACKUP_REPO'], repo_type='dataset')
    backups_all = [f for f in files if f.endswith('.db.gz')]
    # 🔧 FIX: sort by extracted timestamp, NOT alphabetically.
    # Previously sorted alphabetically which put 'startup_15-27' before
    # 'periodic_15-36' even though the periodic one is newer.
    def extract_time(p):
        m = re.search(r'(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2})', p)
        return m.group(1) if m else '0'
    backups = sorted(backups_all, key=extract_time, reverse=True)
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
      console.log('[RESTORE] No backups found in HF repo — server will start with fresh DB');
      return;
    }

    console.log(`[RESTORE] Found ${backups.length} backups. Latest: ${backups[0]}`);

    // If we already have a local DB, only restore if the backup is NEWER
    const dbExists = fs.existsSync(DB_FILE) && fs.statSync(DB_FILE).size > 0;
    if (dbExists) {
      const localMtime = fs.statSync(DB_FILE).mtimeMs;
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
    // 🔒 SECURITY FIX: use execFileSync (no shell) and read values from env,
    // avoiding any interpolation of HF_TOKEN / filename into Python source.
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

    // Decompress (tempPath is a fully-controlled local path, but quote it anyway)
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
      // Ensure /data exists
      const dataDir = path.dirname(DB_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
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

/**
 * Restore user-uploaded files (images/videos) from HF Dataset to /data/uploads.
 * Runs AFTER the DB restore so all user content is back before server starts.
 *
 * Strategy: list files under `uploads/` in the HF Dataset, download each one
 * to the matching local path under /data/uploads. Skip files that already
 * exist locally (idempotent — safe to run multiple times).
 */
async function restoreUploads() {
  const UPLOADS_DIR = path.join(PERSISTENT_DIR, 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) {
    try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}
  }

  const HF_TOKEN = process.env.HF_TOKEN || '';
  const HF_BACKUP_REPO = process.env.HF_BACKUP_REPO || 'safwatkhokha/nawaqes-backup';
  if (!HF_TOKEN) {
    console.log('[RESTORE-UPLOADS] ⚠️  No HF_TOKEN — skipping uploads restore');
    return;
  }

  console.log(`[RESTORE-UPLOADS] Checking for user uploads in ${HF_BACKUP_REPO}...`);

  const restoreScript = `
import os, sys, json
from huggingface_hub import HfApi, hf_hub_download
api = HfApi(token=os.environ.get('HF_TOKEN', ''))
repo_id = os.environ['HF_BACKUP_REPO']
try:
    files = api.list_repo_files(repo_id, repo_type='dataset')
    uploads = [f for f in files if f.startswith('uploads/') and not f.endswith('/')]
    # CRITICAL: return ALL files, not just first 50
    print(json.dumps({'count': len(uploads), 'files': uploads}))
except Exception as e:
    print(json.dumps({'count': 0, 'error': str(e)}))
`;

  try {
    const output = execFileSync('python3', ['-c', restoreScript], {
      encoding: 'utf-8',
      env: { ...process.env, HF_BACKUP_REPO },
      timeout: 60000,
    }).trim();
    const info = JSON.parse(output);
    if (info.count === 0) {
      console.log('[RESTORE-UPLOADS] No uploads found in HF — skipping (fresh install)');
      return;
    }
    console.log(`[RESTORE-UPLOADS] Found ${info.count} uploaded files — restoring...`);

    // Download each file
    const downloadScript = `
import os, sys, shutil
from huggingface_hub import hf_hub_download
repo_id = os.environ['HF_BACKUP_REPO']
token = os.environ.get('HF_TOKEN', '')
uploads_root = os.environ['UPLOADS_ROOT']
files = os.environ['UPLOADS_FILELIST'].split('\\n')
downloaded = 0
skipped = 0
errors = 0
for f in files:
    if not f:
        continue
    rel = f[len('uploads/'):]
    local_path = os.path.join(uploads_root, rel)
    # Skip if already exists locally (idempotent)
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        skipped += 1
        continue
    try:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        downloaded_path = hf_hub_download(
            repo_id=repo_id,
            filename=f,
            repo_type='dataset',
            token=token,
        )
        shutil.copy2(downloaded_path, local_path)
        downloaded += 1
    except Exception as e:
        errors += 1
        print(f'ERROR downloading {f}: {e}', file=sys.stderr)
print(f'Downloaded: {downloaded}, Skipped (already existed): {skipped}, Errors: {errors}')
`;
    execFileSync('python3', ['-c', downloadScript], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        UPLOADS_FILELIST: info.files.join('\n'),
        UPLOADS_ROOT: UPLOADS_DIR,
        HF_BACKUP_REPO,
        HF_TOKEN,
      },
      timeout: 1800000, // 30 min max (for large video files)
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log('[RESTORE-UPLOADS] ✅ Uploads restored');
  } catch (err: any) {
    console.warn(`[RESTORE-UPLOADS] Failed (non-fatal): ${err.message?.slice(0, 200)}`);
    // Don't fail the whole restore just because uploads failed — DB is more important
  }
}

autoRestoreDB().then(async () => {
  // After DB restore, also restore user uploads (images/videos)
  await restoreUploads();
  console.log('[RESTORE] Done.');
  process.exit(0);
}).catch(err => {
  console.error('[RESTORE] Fatal error:', err.message);
  // 🔧 FIX: ALWAYS exit 0 (success) even on error. Previously, STRICT_RESTORE=true
  // would exit(1) on restore failure, which prevented the server from starting —
  // but the CMD uses `;` so the server started anyway with a FRESH empty DB,
  // losing all users. Now we ALWAYS let the server start. If restore failed,
  // the server will use whatever DB exists (possibly empty), but at least
  // the periodic backup will kick in and save new data going forward.
  // The operator can check logs for restore failures.
  console.warn('[RESTORE] ⚠️  Restore failed — server will start with existing/fresh DB. Check logs above.');
  process.exit(0);
});
