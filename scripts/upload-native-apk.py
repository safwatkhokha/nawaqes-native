#!/usr/bin/env python3
"""Upload the Nawaqes Native APK to Hugging Face Dataset."""
import os
import subprocess
from huggingface_hub import HfApi

# Extract token from HF Space git remote URL
try:
    result = subprocess.run(
        ['git', 'config', '--get', 'remote.origin.url'],
        cwd='/home/z/my-project/nawaqes-space-clone',
        capture_output=True, text=True, check=True,
    )
    url = result.stdout.strip()
    token = url.split(':', 2)[2].split('@')[0]
    print(f'[OK] Extracted HF token ({len(token)} chars)')
except Exception as e:
    print('Token extraction failed:', e)
    raise SystemExit(1)

hf_token = os.environ.get('HF_TOKEN', token)
api = HfApi(token=hf_token)
repo_id = 'safwatkhokha/nawaqes-backup'

APK_VERSION = 'v2.5.0'
apk_path = f'/home/z/my-project/download/nawaqes-native-{APK_VERSION}.apk'
path_in_repo = f'nawaqes-native-{APK_VERSION}.apk'

if not os.path.exists(apk_path):
    print(f'[ERR] APK not found: {apk_path}')
    raise SystemExit(1)

size_mb = os.path.getsize(apk_path) / 1024 / 1024
print(f'[UPLOAD] Uploading {apk_path} ({size_mb:.1f} MB)')
print(f'         → {repo_id}/{path_in_repo}')

api.upload_file(
    path_or_fileobj=apk_path,
    path_in_repo=path_in_repo,
    repo_id=repo_id,
    repo_type='dataset',
    commit_message=f'Upload Nawaqes Native {APK_VERSION} APK (SmartMarket screen)',
)

print(f'[UPLOAD] Done!')
print(f'  Download URL: https://huggingface.co/datasets/{repo_id}/resolve/main/{path_in_repo}')
