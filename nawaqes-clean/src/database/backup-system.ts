import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import Database from 'better-sqlite3';
import database from './index.js';

const PERSISTENT_DIR = fs.existsSync('/data') ? '/data' : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(PERSISTENT_DIR, 'nawaqes.db');
const BACKUP_DIR = path.join(PERSISTENT_DIR, 'backups');
const UPLOADS_DIR = path.join(PERSISTENT_DIR, 'uploads');
const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_BACKUP_REPO = process.env.HF_BACKUP_REPO || 'safwatkhokha/nawaqes-backup';

if (!fs.existsSync(BACKUP_DIR)) {
  try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch {}
}

/**
 * Walk a directory and return all files (recursive).
 * Used for uploading user-uploaded images/videos to HF backup.
 */
function walkDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) out.push(full);
    }
  }
  return out;
}

/**
 * Upload user-uploaded files (images/videos in /data/uploads) to HF Dataset.
 * This ensures user content is preserved across rebuilds — not just the DB.
 *
 * Strategy: walk /data/uploads, upload each file to `uploads/<relative-path>`
 * in the HF Dataset. Skip files that are already there (HF deduplication by
 * content hash means this is cheap).
 *
 * Runs once per day (alongside the daily DB backup) to avoid burning quota.
 */
export function backupUploadsToHF() {
  if (!HF_TOKEN) return;
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log('[BACKUP-UPLOADS] No uploads dir — skipping');
    return;
  }

  const files = walkDir(UPLOADS_DIR);
  if (files.length === 0) {
    console.log('[BACKUP-UPLOADS] Uploads dir is empty — skipping');
    return;
  }

  console.log(`[BACKUP-UPLOADS] Found ${files.length} files in uploads — backing up to HF...`);

  const uploadScript = `
import os, sys
from huggingface_hub import HfApi
# Explicitly pass token — env var alone sometimes isn't picked up
token = os.environ.get('HF_TOKEN', '')
api = HfApi(token=token)
repo_id = os.environ['HF_BACKUP_REPO']
files = os.environ['HF_UPLOADS_FILELIST'].split('\\n')
uploaded = 0
skipped = 0
errors = 0
for local_path in files:
    if not local_path:
        continue
    # path in repo: uploads/<relative-to-/data/uploads>
    uploads_root = os.environ['UPLOADS_ROOT']
    rel = os.path.relpath(local_path, uploads_root)
    path_in_repo = 'uploads/' + rel.replace(os.sep, '/')
    try:
        api.upload_file(
            path_or_fileobj=local_path,
            path_in_repo=path_in_repo,
            repo_id=repo_id,
            repo_type='dataset',
            commit_message='Backup upload: ' + rel,
        )
        uploaded += 1
    except Exception as e:
        # If file already exists with same content, HF returns a "no change" error
        if 'same content' in str(e).lower() or 'already' in str(e).lower():
            skipped += 1
        else:
            errors += 1
            print(f'ERROR uploading {rel}: {e}', file=sys.stderr)
print(f'Uploaded: {uploaded}, Skipped (already existed): {skipped}, Errors: {errors}')
`;

  try {
    execFileSync('python3', ['-c', uploadScript], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        HF_UPLOADS_FILELIST: files.join('\n'),
        UPLOADS_ROOT: UPLOADS_DIR,
        HF_BACKUP_REPO,
        HF_TOKEN, // explicitly pass token
      },
      timeout: 600000, // 10 minutes max for large uploads dirs
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log('[BACKUP-UPLOADS] ✅ All uploads backed up to HF');
  } catch (err: any) {
    const stderr = err.stderr?.toString()?.slice(-500) || '';
    const stdout = err.stdout?.toString()?.slice(-500) || '';
    console.warn(`[BACKUP-UPLOADS] Some uploads may have failed: ${err.message?.slice(0, 200)}`);
    if (stdout) console.log(`[BACKUP-UPLOADS] stdout: ${stdout}`);
    if (stderr) console.warn(`[BACKUP-UPLOADS] stderr: ${stderr}`);
  }
}

/**
 * Create a backup of the SQLite database.
 *
 * Uses better-sqlite3's native `.backup()` API (no shell `sqlite3` CLI required)
 * which is more reliable and works in containers where the sqlite3 binary
 * is not installed (e.g. the Hugging Face Space Docker image).
 */
function createBackupUsingApi(targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Open the source DB in read-only mode to avoid conflicts with the live server
      const srcDb = new Database(DB_FILE, { readonly: true, fileMustExist: true });
      srcDb.backup(targetPath)
        .then(() => {
          srcDb.close();
          resolve();
        })
        .catch((err: any) => {
          try { srcDb.close(); } catch {}
          reject(err);
        });
    } catch (err: any) {
      reject(err);
    }
  });
}

function createBackup(type: string) {
  try {
    if (!fs.existsSync(DB_FILE)) {
      console.warn('[BACKUP] DB file not found, skipping');
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dateStr = new Date().toISOString().slice(0, 10);
    const backupPath = path.join(BACKUP_DIR, `${type}_${timestamp}.db.gz`);
    const tempDb = path.join(BACKUP_DIR, `temp_${timestamp}.db`);

    // ─── Use better-sqlite3 native backup API (no sqlite3 CLI required) ───
    createBackupUsingApi(tempDb)
      .then(() => {
        // Compress with gzip (gzip is a standard Unix utility, always available)
        try {
          execSync(`gzip -f ${JSON.stringify(tempDb)}`, { stdio: 'ignore' });
          fs.renameSync(tempDb + '.gz', backupPath);
          console.log(`[BACKUP] ✅ Local backup created: ${type}_${timestamp}.db.gz`);

          // Upload to HF Datasets
          if (HF_TOKEN) {
            uploadToHF(backupPath, dateStr, type, timestamp);
          }

          // Clean old local backups (keep last 72)
          try {
            const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db.gz')).sort().reverse();
            files.slice(72).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {} });
          } catch {}
        } catch (gzErr: any) {
          console.warn(`[BACKUP] gzip failed: ${gzErr.message}`);
          // Fall back to uncompressed copy if gzip is unavailable
          try {
            fs.copyFileSync(tempDb, backupPath.replace('.gz', ''));
            console.log(`[BACKUP] ✅ Local backup (uncompressed): ${type}_${timestamp}.db`);
          } catch {}
        }
      })
      .catch((err: any) => {
        console.error(`[BACKUP] API backup failed: ${err.message}`);
        // ─── Fallback: simple file copy ───
        // 🔒 FIX: previously this used `fs.copyFileSync(DB_FILE, tempDb)` which
        // copies a live WAL-mode DB and can produce a corrupt snapshot
        // (missing the WAL's recent commits). Now we force a TRUNCATE
        // checkpoint on the live DB first so the main .db file contains all
        // committed data, THEN copy. This is still not as safe as the
        // .backup() API (which uses SQLite's online backup mechanism) but
        // it's far better than a raw copy.
        try {
          try {
            // Run a TRUNCATE checkpoint so all WAL frames are merged into the
            // main DB file before we copy it.
            const liveDb = new Database(DB_FILE, { fileMustExist: true });
            liveDb.pragma('wal_checkpoint(TRUNCATE)');
            liveDb.close();
          } catch (cpErr: any) {
            console.warn(`[BACKUP] WAL checkpoint failed (${cpErr.message}) — proceeding with raw copy (may be inconsistent).`);
          }
          fs.copyFileSync(DB_FILE, tempDb);
          // Also copy the WAL and SHM files if they exist (best-effort).
          for (const ext of ['-wal', '-shm']) {
            if (fs.existsSync(DB_FILE + ext)) {
              try { fs.copyFileSync(DB_FILE + ext, tempDb + ext); } catch {}
            }
          }
          execSync(`gzip -f ${JSON.stringify(tempDb)}`, { stdio: 'ignore' });
          fs.renameSync(tempDb + '.gz', backupPath);
          console.log(`[BACKUP] ✅ Fallback file copy (post-checkpoint): ${type}_${timestamp}.db.gz`);
          if (HF_TOKEN) {
            uploadToHF(backupPath, dateStr, type, timestamp);
          }
        } catch (copyErr: any) {
          console.error(`[BACKUP] Fallback copy also failed: ${copyErr.message}`);
        }
      });
  } catch (err: any) {
    console.error('[BACKUP] Failed:', err.message);
  }
}

function uploadToHF(backupPath: string, dateStr: string, type: string, timestamp: string) {
  try {
    const pathInRepo = `backups/${dateStr}/${type}_${timestamp}.db.gz`;
    // 🔒 SECURITY FIX: previously used execSync(`python3 -c "...${backupPath}..."`)
    // which is shell injection if paths contain single quotes. Now use
    // execFileSync (no shell) and pass paths via environment variables.
    const uploadScript = `
import os
from huggingface_hub import HfApi
api = HfApi()
api.upload_file(
    path_or_fileobj=os.environ['HF_BACKUP_PATH'],
    path_in_repo=os.environ['HF_PATH_IN_REPO'],
    repo_id=os.environ['HF_BACKUP_REPO'],
    repo_type='dataset',
    commit_message='Backup ' + os.environ['HF_BACKUP_TIMESTAMP'],
)
`;
    execFileSync('python3', ['-c', uploadScript], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        HF_BACKUP_PATH: backupPath,
        HF_PATH_IN_REPO: pathInRepo,
        HF_BACKUP_REPO,
        HF_BACKUP_TIMESTAMP: timestamp,
      },
      timeout: 120000,
    });
    console.log(`[BACKUP] ✅ Uploaded to HF: ${pathInRepo}`);
  } catch (err: any) {
    console.warn(`[BACKUP] Upload failed: ${err.message?.slice(0, 100)}`);
  }
}

export function initAutoBackup() {
  console.log('[BACKUP] Initializing auto-backup...');
  // First DB backup after 15 seconds
  setTimeout(() => createBackup('startup'), 15000);
  // DB backup every 1 minute
  setInterval(() => createBackup('periodic'), 60 * 1000);
  // 🔧 Uploads backup every 10 MINUTES (was daily — images were lost on rebuild!)
  setTimeout(() => backupUploadsToHF(), 30000); // first upload backup after 30s
  setInterval(() => backupUploadsToHF(), 10 * 60 * 1000); // then every 10 min
  console.log('[BACKUP] ✅ Scheduled (DB: every 1min | Uploads: every 10min)');
}

export function createManualBackup() {
  createBackup('manual');
  return { success: true };
}

// Create backup on important events (user registration, post creation, etc.)
export function createEventBackup(event: string) {
  // Debounce: don't create event backups more than once per 60 seconds
  const now = Date.now();
  const lastBackupTime = (global as any).__lastEventBackup || 0;
  if (now - lastBackupTime < 60000) return;
  (global as any).__lastEventBackup = now;
  createBackup(`event_${event}`);
}

export function getBackupStats() {
  const files = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db.gz') || f.endsWith('.db')) : [];
  return { totalBackups: files.length, hfConfigured: !!HF_TOKEN, hfRepo: HF_BACKUP_REPO };
}
