# 📱 Nawaqes Android App v3.0.0 — دليل البناء

## 🚀 طريقة البناء السريعة

### الطريقة 1: GitHub Actions (موصى بها)

**المشكلة:** ملف workflow موجود في `nawaqes-apk/webview-apk/.github/workflows/` لكن GitHub Actions يتطلب أن يكون في **جذر المستودع** على `.github/workflows/`.

**الحل:**

1. اذهب إلى: https://github.com/safwatkhokha/nawaqes
2. اضغط **Add file → Create new file**
3. اسم الملف: `.github/workflows/build-apk.yml`
4. انسخ محتوى الملف من: `nawaqes-apk/webview-apk/.github/workflows/build-apk.yml`
5. اضغط **Commit changes**
6. اذهب إلى **Actions** tab — سيبدأ البناء تلقائياً
7. بعد ~5 دقائق، اضغط على الـ run → **Artifacts** → حمّل `nawaqes-release-v3.0.0`

### الطريقة 2: بناء محلي

```bash
# تثبيت المتطلبات
# 1. JDK 17
# 2. Android SDK (API 34)
# 3. Gradle 8.7+

cd nawaqes-apk/webview-apk
chmod +x gradlew
./gradlew assembleRelease

# APK سيكون في:
# app/build/outputs/apk/release/app-release.apk
```

### الطريقة 3: Android Studio

1. افتح Android Studio
2. **File → Open** → اختر `nawaqes-apk/webview-apk/`
3. انتظر تحميل Gradle
4. **Build → Generate Signed Bundle / APK → APK**
5. استخدم debug keystore (موجود في `debug.keystore`)
6. **Release → Finish**

## ✅ المميزات

| الميزة | الحالة |
|--------|------|
| 📷 كاميرا مباشرة | ✅ |
| 📁 رفع ملفات متعددة | ✅ |
| 💾 تخزين دائم (localStorage) | ✅ |
| 🎤 ميكروفون (WebRTC) | ✅ |
| 📍 موقع جغرافي | ✅ |
| 🔔 إشعارات FCM | ✅ (يتطلب google-services.json) |
| ⬅️ زر رجوع ذكي | ✅ |
| 🌐 Deep linking | ✅ |
| 📡 صفحة offline | ✅ |
| 🎨 Splash screen | ✅ |

## 🔧 الإعدادات

```yaml
Package ID: com.nawaqes.app
Version: 3.0.0 (code: 3)
Min SDK: 24 (Android 5.0)
Target SDK: 34 (Android 14)
URL: https://safwatkhokha-nawaqes.hf.space
```

## 🔔 تفعيل FCM (اختياري)

لتفعيل إشعارات push:

1. ضع `google-services.json` في:
   ```
   nawaqes-apk/webview-apk/app/google-services.json
   ```
2. أضف Firebase Messaging dependency في `app/build.gradle`:
   ```gradle
   implementation 'com.google.firebase:firebase-messaging:24.0.0'
   ```
3. أضف في `AndroidManifest.xml`:
   ```xml
   <service android:name=".NawaqesFirebaseMessagingService" android:exported="false">
       <intent-filter>
           <action android:name="com.google.firebase.MESSAGING_EVENT" />
       </intent-filter>
   </service>
   ```

## 📦 رفع APK للتوزيع

بعد بناء APK، يمكن رفعه على HF Space للتحميل المباشر:

```bash
# نسخ APK إلى مجلد التحميل
cp app/build/outputs/apk/release/app-release.apk /path/to/nawaqes/public/download/nawaqes-v3.0.0.apk

# أو رفعه على HF Dataset
python3 -c "
from huggingface_hub import HfApi
api = HfApi(token='YOUR_HF_TOKEN')
api.upload_file(
    path_or_fileobj='app-release.apk',
    path_in_repo='nawaqes-v3.0.0.apk',
    repo_id='safwatkhokha/nawaqes-backup',
    repo_type='dataset'
)
"
```

رابط التحميل سيكون:
```
https://huggingface.co/datasets/safwatkhokha/nawaqes-backup/resolve/main/nawaqes-v3.0.0.apk
```
