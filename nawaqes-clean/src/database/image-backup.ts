// ─── Synchronous image backup to HF Dataset ───────────────────────────
// RADICAL FIX for "images disappearing after rebuild" issue.
//
// Problem: User uploads image → file saved to /data/uploads/<hash>.jpg →
// path saved to DB. But /data/uploads is wiped on container rebuild
// (only /data is persistent, but the symlink /app/uploads → /data/uploads
// means new uploads go to /data/uploads which IS persistent... BUT the
// periodic backup to HF Dataset was failing silently, so on rebuild the
// restore couldn't find the files).
//
// Solution: Upload EVERY image to HF Dataset SYNCHRONOUSLY at upload time.
// This guarantees the file is in HF before the HTTP response returns,
// so even if the container is wiped immediately after, the file is safe
// in HF and will be restored on next startup via restore-standalone.ts.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const HF_BACKUP_REPO = process.env.HF_BACKUP_REPO || 'safwatkhokha/nawaqes-backup';

/**
 * Synchronously upload a single file to HF Dataset at uploads/<filename>.
 * Blocks until upload completes (or fails). Logs success/failure.
 * Safe to call even if HF_TOKEN is not set (no-op).
 */
export function backupFileToHF(localFilePath: string): void {
  // Read HF_TOKEN at call time (not module load time) to ensure it's available
  const HF_TOKEN = process.env.HF_TOKEN || '';
  if (!HF_TOKEN) {
    console.warn('[IMG-BACKUP] ⚠️ HF_TOKEN not set — skipping backup');
    return;
  }
  if (!fs.existsSync(localFilePath)) {
    console.warn(`[IMG-BACKUP] ⚠️ File not found: ${localFilePath}`);
    return;
  }

  const filename = path.basename(localFilePath);
  // Calculate path in repo. Handle both /data/uploads and /app/uploads (symlink)
  // by using just the filename and any subdirectory under uploads/.
  let rel: string;
  const uploadsDirs = ['/data/uploads', '/app/uploads', path.resolve('uploads')];
  for (const dir of uploadsDirs) {
    if (localFilePath.startsWith(dir + '/')) {
      rel = localFilePath.slice(dir.length + 1).replace(/\\/g, '/');
      break;
    }
  }
  if (!rel!) rel = filename; // fallback: just the filename
  const pathInRepo = `uploads/${rel}`;

  // Synchronous — block until upload completes (or fails).
  // This ensures the file is in HF before the upload response returns,
  // so even if the container is wiped immediately, the file is safe.
  try {
    const uploadScript = `
import os, sys
from huggingface_hub import HfApi, upload_file
token = os.environ.get('HF_TOKEN', '')
try:
    upload_file(
        path_or_fileobj=os.environ['LOCAL_FILE'],
        path_in_repo=os.environ['PATH_IN_REPO'],
        repo_id=os.environ['HF_BACKUP_REPO'],
        repo_type='dataset',
        token=token,
        commit_message='Image upload: ' + os.environ['PATH_IN_REPO'],
    )
    print('OK')
except Exception as e:
    msg = str(e).lower()
    if 'same content' in msg or 'already' in msg:
        print('SKIPPED (already exists)')
    else:
        print('ERROR:', repr(e), file=sys.stderr)
        sys.exit(1)
`;
    const stdout = execFileSync('python3', ['-c', uploadScript], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        LOCAL_FILE: localFilePath,
        PATH_IN_REPO: pathInRepo,
        HF_BACKUP_REPO,
        HF_TOKEN,
      },
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(`[IMG-BACKUP] ✅ Backed up ${filename} → ${pathInRepo} (${stdout.trim()})`);
  } catch (err: any) {
    const stderr = err.stderr?.toString()?.slice(0, 500) || '';
    const stdout = err.stdout?.toString()?.slice(0, 500) || '';
    console.warn(`[IMG-BACKUP] ⚠️ Failed to back up ${filename}: ${(err.message || '').slice(0, 150)}`);
    if (stdout) console.log(`[IMG-BACKUP] stdout: ${stdout}`);
    if (stderr) console.warn(`[IMG-BACKUP] stderr: ${stderr}`);
  }
}
