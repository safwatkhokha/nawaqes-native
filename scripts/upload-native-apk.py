#!/usr/bin/env python3
import os, subprocess
from huggingface_hub import HfApi

result = subprocess.run(['git', 'config', '--get', 'remote.origin.url'],
    cwd='/home/z/my-project/nawaqes-space-clone', capture_output=True, text=True, check=True)
token = result.stdout.strip().split(':', 2)[2].split('@')[0]

api = HfApi(token=token)
repo_id = 'safwatkhokha/nawaqes-backup'
APK_VERSION = 'v3.0.1'
apk_path = f'/home/z/my-project/download/nawaqes-native-{APK_VERSION}.apk'
path_in_repo = f'nawaqes-native-{APK_VERSION}.apk'

print(f'[UPLOAD] {apk_path} ({os.path.getsize(apk_path)/1024/1024:.1f} MB)')
api.upload_file(path_or_fileobj=apk_path, path_in_repo=path_in_repo,
    repo_id=repo_id, repo_type='dataset',
    commit_message=f'Upload Nawaqes Native {APK_VERSION} APK (fix splash logo stuck)')
print(f'[UPLOAD] Done! URL: https://huggingface.co/datasets/{repo_id}/resolve/main/{path_in_repo}')
