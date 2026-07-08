# 📱 Nawaqes Android App v1.3.0 — دليل البناء

> تطبيق نواقص الموحّد — يجمع كل الميزات (إعلانات، سوق، دردشة، بث مباشر) في تطبيق واحد.

## 📋 المواصفات

| الخاصية | القيمة |
|---------|------|
| Package ID | `com.nawaqes.app` |
| Version | 1.3.0 (versionCode 14) |
| Min SDK | 21 (Android 5.0 Lollipop) |
| Target SDK | 33 (Android 13) |
| Compile SDK | 34 |
| Java | 17 |
| Gradle | 8.7 |
| URL | `https://safwatkhokha-nawaqes.hf.space` |

## 🚀 طريقة البناء

### الطريقة 1: GitHub Actions (موصى بها)

استخدم ملف `.github/workflows/build-apk.yml` (في جذر المستودع الرئيسي).
راجع القسم التالي للحصول على نسخة جاهزة.

1. اذهب إلى GitHub repo: https://github.com/safwatkhokha/nawaqes
2. تأكد من وجود `.github/workflows/build-apk.yml`
3. اذهب إلى **Actions** tab
4. اختر **Build APK** workflow → **Run workflow**
5. بعد ~5-10 دقائق، حمّل الـ APK من **Artifacts**

### الطريقة 2: بناء محلي (Linux/Mac/WSL)

#### المتطلبات:
- JDK 17
- Android SDK (API 34 + Build Tools 34)
- Gradle 8.7+ (يأتي مدمجاً عبر `gradlew`)

#### الخطوات:
```bash
export ANDROID_HOME=/path/to/android/sdk
cd apk-source-main/
chmod +x gradlew
./gradlew assembleRelease

# APK سيكون في:
# app/build/outputs/apk/release/app-release.apk
```

### الطريقة 3: Android Studio

1. افتح Android Studio
2. **File → Open** → اختر `apk-source-main/`
3. انتظر تحميل Gradle
4. **Build → Generate Signed Bundle / APK → APK**
5. استخدم `keystore/nawaqes-release.keystore`
   - Keystore password: `nawaqes2026`
   - Key alias: `nawaqes`
   - Key password: `nawaqes2026`
6. **Release → Finish**
7. APK سيكون في `app/build/outputs/apk/release/app-release.apk`

## ✅ المميزات

| الميزة | الحالة |
|--------|------|
| 📷 كاميرا مباشرة | ✅ |
| 📁 رفع ملفات متعددة | ✅ |
| 💾 تخزين دائم (localStorage) | ✅ |
| 🎤 ميكروفون (WebRTC) | ✅ |
| 📍 موقع جغرافي | ✅ |
| 🔔 إشعارات FCM Native | ✅ (يعمل عند قفل التطبيق) |
| ⬅️ زر رجوع ذكي | ✅ |
| 🌐 Deep linking | ✅ |
| 📡 صفحة offline | ✅ |
| 🎨 Splash screen | ✅ |
| 🔒 TLS only (no cleartext) | ✅ |

## 🔔 تفعيل FCM (الإشعارات)

الإصدار v1.3.0 يدعم FCM Native تلقائياً. التدفق:

1. المستخدم يفتح التطبيق → WebView يحمل `https://safwatkhokha-nawaqes.hf.space`
2. بعد تسجيل الدخول، الـ JS يقرأ JWT من localStorage
3. الـ JS hook (مُدمج في `MainActivity.java`) يستدعي `AndroidAuthBridge.onLogin(jwt, firebaseConfig)`
4. `AuthBridge.java` يستدعي `NawaqesFirebaseMessagingService.registerToken()`
5. الفئة `RegisterTokenWorker` (WorkManager) تجلب FCM token وتشترك في topic `nawaqes_all`
6. الـ token يُرسل إلى `/api/notifications/register-device` مع JWT
7. عند وصول push notification، `onMessageReceived()` يعرض system notification

**ملاحظة**: Firebase يُهيّأ برمجياً (لا حاجة لـ `google-services.json`). الـ JS يجلب
الإعدادات من `/api/notifications/firebase-config` ويمررها إلى Java.

## 📦 رفع APK للتوزيع

بعد بناء APK، ارفعه إلى HF Dataset:

```bash
# تثبيت huggingface_hub
pip install huggingface_hub

# رفع APK
python3 -c "
from huggingface_hub import HfApi
api = HfApi(token='hf_YOUR_TOKEN')
api.upload_file(
    path_or_fileobj='app/build/outputs/apk/release/app-release.apk',
    path_in_repo='nawaqes-v1.3.0.apk',
    repo_id='safwatkhokha/nawaqes-backup',
    repo_type='dataset'
)
print('Uploaded!')
"
```

رابط التحميل سيكون:
```
https://huggingface.co/datasets/safwatkhokha/nawaqes-backup/resolve/main/nawaqes-v1.3.0.apk
```

## 🔄 التحديث من إصدار سابق

المستخدمون الذين لديهم v1.2.1 يمكنهم الترقية مباشرة بتثبيت v1.3.0 فوقه —
نفس package ID (`com.nawaqes.app`) ونفس مفتاح التوقيع.

المستخدمون الذين لديهم تطبيق "نواقص دردشة" (`com.nawaqes.chat`) المنفصل:
- يجب أن يحذفوه يدوياً إن أرادوا (يستطيعون إبقاءه أيضاً — لا تعارض)
- تطبيق v1.3.0 الموحّد يحتوي على كل ميزات الدردشة + المزيد
