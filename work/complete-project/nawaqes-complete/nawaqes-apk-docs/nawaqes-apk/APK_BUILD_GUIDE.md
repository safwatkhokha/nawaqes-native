# 📱 نواقص | Nawaqes — دليل تحويل التطبيق إلى APK

> دليل شامل لتحويل منصة نواقص إلى تطبيق Android (APK) جاهز للتثبيت المباشر، مع دعم Firebase Push Notifications و PWA.

---

## 📋 جدول المحتويات

1. [نظرة عامة على الحلول المتاحة](#1-نظرة-عامة-على-الحلول-المتاحة)
2. [الحل السريع: PWA + WebView APK (موصى به الآن)](#2-الحل-السريع-pwa--webview-apk)
3. [الحل المتقدم: Capacitor APK (مستقبلاً)](#3-الحل-المتقدم-capacitor-apk)
4. [إعداد Firebase Cloud Messaging](#4-إعداد-firebase-cloud-messaging)
5. [رفع APK على السيرفر الحالي](#5-رفع-apk-على-السيرفر-الحالي)
6. [خطوات النشر للمستخدمين](#6-خطوات-النشر-للمستخدمين)
7. [استكشاف الأخطاء](#7-استكشاف-الأخطاء)

---

## 1. نظرة عامة على الحلول المتاحة

تم تجهيز **3 حلول** متكاملة لإطلاق التطبيق:

| الحل | طريقة البناء | حجم APK | الميزات | متى تستخدمه؟ |
|------|--------------|---------|---------|--------------|
| **1. PWA** | يثبت مباشرة من المتصفح | 0 (يستخدم ذاكرة المتصفح) | يعمل على كل المنصات، تحديثات فورية | للمستخدمين على iPhone / سطح المكتب |
| **2. WebView APK** | Android Studio أو Gradle CLI | ~3-5 MB | يعمل مثل تطبيق native، يفتح من أيقونة | **موصى به الآن** — الأسرع والأسهل |
| **3. Capacitor APK** | Android Studio + Capacitor | ~15-25 MB | وصول native كامل للكاميرا والإشعارات | مستقبلاً، بعد حل مشكلة Play Console |

### 🎯 التوصية الحالية
1. **فوراً**: استخدم **WebView APK** + **PWA** — يمكن للمستخدمين تحميله الآن
2. **بعد حل مشكلة Play Console**: انتقل إلى **Capacitor APK** للنشر على المتجر

---

## 2. الحل السريع: PWA + WebView APK

### الخطوة 1: نشر تحديثات المشروع على Hugging Face Spaces

تم تعديل المشروع لإضافة:
- `manifest.webmanifest` — تعريف التطبيق
- `sw.js` — Service Worker (يعمل offline + إشعارات)
- `public/download.html` — صفحة تحميل التطبيق
- `public/offline.html` — صفحة "غير متصل"
- `public/icons/` — جميع الأيقونات بأحجام مختلفة
- `capacitor.config.ts` — إعداد Capacitor

**للنشر:**
```bash
cd /home/z/my-project/nawaqes

# رفع التغييرات إلى GitHub
git add .
git commit -m "Add PWA support + APK download landing page"
git push origin main

# Hugging Face Spaces سيعيد البناء تلقائياً
```

### الخطوة 2: بناء WebView APK

#### الطريقة أ: محلياً باستخدام Android Studio (الأسهل)

1. **حمّل Android Studio**: https://developer.android.com/studio
2. افتح المجلد: `/home/z/my-project/nawaqes-apk/webview-apk`
3. انتظر Gradle Sync
4. اضغط **Build → Build Bundle(s) / APK(s) → Build APK(s)**
5. سيظهر ملف APK في: `app/build/outputs/apk/debug/app-debug.apk`

#### الطريقة ب: باستخدام Gradle من سطر الأوامر

```bash
# تثبيت Java JDK 17 + Android SDK
sudo apt install openjdk-17-jdk
# حمل Android Command Line Tools من:
# https://developer.android.com/studio#command-line-tools-only

cd /home/z/my-project/nawaqes-apk/webview-apk

# بناء APK Debug
./gradlew assembleDebug

# APK سيظهر في:
# app/build/outputs/apk/debug/app-debug.apk
```

#### الطريقة ج: باستخدام GitHub Actions (تلقائي)

```bash
# انسخ ملف workflow إلى المشروع
mkdir -p /home/z/my-project/nawaqes/.github/workflows
cp /home/z/my-project/nawaqes-apk/build-scripts/github-actions-build-apk.yml \
   /home/z/my-project/nawaqes/.github/workflows/build-apk.yml

# Commit and push
cd /home/z/my-project/nawaqes
git add .github/workflows/build-apk.yml
git commit -m "Add GitHub Actions APK build workflow"
git push origin main

# APK سيظهر في: Actions tab → Build artifact
```

### الخطوة 3: رفع APK على السيرفر

```bash
# انسخ ملف APK إلى مجلد downloads على السيرفر
mkdir -p /home/z/my-project/nawaqes/downloads
cp app-debug.apk /home/z/my-project/nawaqes/downloads/nawaqes-v2.0.0.apk

# commit and push
git add downloads/nawaqes-v2.0.0.apk
git commit -m "Add APK release v2.0.0"
git push origin main
```

**سيكون متاحاً على**: `https://safwatkhokha-nawaqes.hf.space/download/nawaqes-v2.0.0.apk`

---

## 3. الحل المتقدم: Capacitor APK

### متى تستخدمه؟
- بعد حل مشكلة حساب Google Play Console
- عندما تحتاج وصول native كامل للكاميرا والميكروفون
- للنشر على Play Store بتجربة عالية الجودة

### الإعداد

```bash
cd /home/z/my-project/nawaqes

# تثبيت Capacitor (مضاف بالفعل في package.json)
npm install

# إضافة منصة Android
npm run cap:add

# بناء APK Debug
npm run apk:debug

# بناء APK Release
npm run apk:release

# بناء AAB للـ Play Store
npm run aab:release
```

### استخدام سكريبت البناء الجاهز

```bash
# بناء APK Debug
bash /home/z/my-project/nawaqes-apk/build-scripts/build-apk.sh debug

# بناء APK Release
bash /home/z/my-project/nawaqes-apk/build-scripts/build-apk.sh release

# تنظيف
bash /home/z/my-project/nawaqes-apk/build-scripts/build-apk.sh clean
```

### بناء عبر Docker (بدون Android Studio)

```bash
bash /home/z/my-project/nawaqes-apk/build-scripts/build-apk-docker.sh release
```

---

## 4. إعداد Firebase Cloud Messaging

### الخطوة 1: إنشاء مشروع Firebase

1. اذهب إلى: https://console.firebase.google.com
2. **Add Project** → اسم المشروع: `nawaqes-app`
3. Disable Google Analytics → Create Project

### الخطوة 2: إضافة تطبيق Android

1. Project Settings ⚙️ → Add app → Android
2. Package name: `com.nawaqes.app`
3. App nickname: `Nawaqes`
4. Register app
5. **حمّل `google-services.json`** وضعه في:
   ```
   /home/z/my-project/nawaqes-apk/webview-apk/app/google-services.json
   ```

### الخطوة 3: إضافة تطبيق Web (لـ PWA)

1. Add app → Web `</>`
2. App nickname: `Nawaqes Web`
3. Register app
4. انسخ `firebaseConfig`
5. **Cloud Messaging → Web Configuration → Generate key pair** للحصول على `vapidKey`

### الخطوة 4: تحديث ملف .env على السيرفر

```bash
# على سيرفر HF Spaces
cat >> /data/.env << 'EOF'
FIREBASE_PROJECT_ID=nawaqes-app
FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXX
FIREBASE_AUTH_DOMAIN=nawaqes-app.firebaseapp.com
FIREBASE_STORAGE_BUCKET=nawaqes-app.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:web:abcdef
FIREBASE_VAPID_KEY=BJXXXXXXXXXXXX
FIREBASE_SERVICE_ACCOUNT_PATH=/data/firebase-service-account.json
EOF
```

### الخطوة 5: توليد Service Account Key

1. Firebase Console → **Project Settings → Service Accounts**
2. **Generate new private key** → حمّل ملف JSON
3. ارفع الملف إلى السيرفر:
   ```bash
   scp firebase-service-account.json user@server:/data/firebase-service-account.json
   ```

### الخطوة 6: اختبار الإشعارات

```bash
# احصل على device token من console المتصفح بعد تفعيل الإشعارات
node /home/z/my-project/nawaqes-apk/firebase/test-push.js <DEVICE_TOKEN>
```

📖 **دليل مفصل**: `/home/z/my-project/nawaqes-apk/firebase/SETUP.md`

---

## 5. رفع APK على السيرفر الحالي

### الطريقة الموصى بها: رفع مباشر على HF Spaces

```bash
# على جهازك المحلي
cd /home/z/my-project/nawaqes

# إنشاء مجلد التحميلات
mkdir -p downloads

# نسخ APK بعد بنائه
cp /path/to/app-release.apk downloads/nawaqes-v2.0.0.apk

# Commit and push (سيرفع الملف إلى HF Spaces)
git add downloads/nawaqes-v2.0.0.apk
git commit -m "Release APK v2.0.0"
git push origin main

# سيكون متاحاً خلال 1-2 دقيقة على:
# https://safwatkhokha-nawaqes.hf.space/download/nawaqes-v2.0.0.apk
```

### صفحة التحميل العامة

تم إنشاء صفحة هبوط احترافية على:
- **URL**: `https://safwatkhokha-nawaqes.hf.space/get-app`
- أو `https://safwatkhokha-nawaqes.hf.space/download.html`

الصفحة تحتوي على:
- شرح المميزات
- أزرار تحميل APK + PWA
- QR Code للتحميل السريع
- تعليمات التثبيت
- إحصائيات

---

## 6. خطوات النشر للمستخدمين

### خطة النشر المقترحة (للوطن العربي)

#### المرحلة 1: نشر فوري (اليوم)
1. ✅ ارفع كود PWA على HF Spaces
2. ✅ ابنِ WebView APK محلياً
3. ✅ ارفع APK على `downloads/` folder
4. ✅ انشر رابط التحميل: `https://safwatkhokha-nawaqes.hf.space/get-app`

#### المرحلة 2: التسويق (الأسبوع القادم)
1. انشر الرابط على وسائل التواصل
2. اطلب من المستخدمين تثبيت PWA (لأنها الأسرع)
3. اطلب من مستخدمي Android تحميل APK
4. اجمع ملاحظات المستخدمين

#### المرحلة 3: Play Store (بعد حل المشكلة)
1. ابنِ Capacitor APK
2. أنشئ سياسة خصوصية (مطلوبة للكاميرا)
3. ارفع AAB على Play Console
4. املأ بيانات التطبيق (وصف، صور، فئة: Business)

### روابط مهمة للمستخدمين

| الرابط | الوصف |
|--------|-------|
| `https://safwatkhokha-nawaqes.hf.space/` | التطبيق (Web/PWA) |
| `https://safwatkhokha-nawaqes.hf.space/get-app` | صفحة تحميل التطبيق |
| `https://safwatkhokha-nawaqes.hf.space/download/nawaqes-v2.0.0.apk` | تحميل APK مباشر |

### نصائح للمستخدمين

**لتثبيت APK على Android:**
1. افتح رابط التحميل في متصفح الهاتف
2. اضغط "Download"
3. بعد التحميل، افتح الملف من مجلد التنزيلات
4. اسمح بـ "تثبيت من مصادر غير معروفة" (إذا طُلب)
5. اضغط "Install"

**لتثبيت PWA على iPhone (Safari):**
1. افتح الرابط في Safari
2. اضغط زر Share
3. اختر "Add to Home Screen"
4. اضغط "Add"

**لتثبيت PWA على Android (Chrome):**
1. افتح الرابط في Chrome
2. ستظهر رسالة "Add to Home Screen" → اضغطها
3. أو: قائمة Chrome ⋮ → "Add to Home screen"

---

## 7. استكشاف الأخطاء

### مشكلة: APK لا يثبت على الهاتف
**السبب**: التوقيع غير صالح أو إصدار Android قديم جداً.
**الحل**:
- تأكد أن `minSdkVersion = 24` (Android 7.0)
- استخدم debug keystore للتطبيقات غير الرسمية
- على Android 8+: اسمح بـ "تثبيت من مصادر غير معروفة" من الإعدادات

### مشكلة: شاشة بيضاء في التطبيق
**السبب**: السيرفر غير متاح أو لا يدعم HTTPS.
**الحل**:
- تأكد أن `https://safwatkhokha-nawaqes.hf.space` يعمل
- تحقق من Console في Android Studio (Logcat)
- تأكد أن `network_security_config.xml` مسموح به للنطاق

### مشكلة: لا تصل الإشعارات
**الأسباب المحتملة**:
1. `google-services.json` غير موجود في `app/`
2. لم يتم إعداد `FIREBASE_VAPID_KEY` على السيرفر
3. المستخدم لم يمنح صلاحية الإشعارات

**الحل**:
- راجع `/home/z/my-project/nawaqes-apk/firebase/SETUP.md`
- اختبر الإشعارات بـ: `node firebase/test-push.js <TOKEN>`
- تحقق من Logcat في Android Studio لرسائل FCM

### مشكلة: الكاميرا لا تعمل في التطبيق
**السبب**: WebView لا يطلب صلاحيات الكاميرا بشكل صحيح.
**الحل**: استخدم Capacitor APK (الحل المتقدم) بدلاً من WebView APK.

### مشكلة: التطبيق بطيء
**الأسباب**:
- شبكة المستخدم بطيئة
- Service Worker لم يخزن الملفات بعد
- السيرفر على HF Spaces قد يكون بطيئاً أحياناً

**الحل**: استخدم Capacitor APK مع تخزين الأصول محلياً (offline-first).

---

## 📁 هيكل الملفات

```
/home/z/my-project/
├── nawaqes/                          # المشروع الأصلي (مُحدَّث)
│   ├── public/
│   │   ├── manifest.webmanifest      # ⭐ جديد — PWA manifest
│   │   ├── sw.js                     # ⭐ جديد — Service Worker
│   │   ├── offline.html              # ⭐ جديد — صفحة offline
│   │   ├── download.html             # ⭐ جديد — صفحة التحميل
│   │   └── icons/                    # ⭐ جديد — أيقونات PWA
│   ├── capacitor.config.ts           # ⭐ جديد — إعداد Capacitor
│   ├── src/server.ts                 # محدَّث — مسارات APK + Firebase
│   └── package.json                  # محدَّث — Capacitor + Firebase
│
├── nawaqes-apk/                      # ⭐ جديد — حزمة APK كاملة
│   ├── assets/                       # أيقونات + شعارات + splash
│   │   ├── icon-512x512.png
│   │   ├── icon-192x192.png
│   │   ├── maskable-icon-512x512.png
│   │   ├── splash-1080x1920.png
│   │   ├── wordmark-1200x600.png
│   │   └── og-image-1200x630.png
│   ├── apk-source/                   # ملفات Android الأصلية
│   │   ├── AndroidManifest.xml
│   │   ├── build.gradle
│   │   ├── proguard-rules.pro
│   │   ├── res/                      # موارد Android (icons, strings, themes)
│   │   └── src/com/nawaqes/app/      # Java sources
│   │       ├── MainActivity.java
│   │       ├── NawaqesApplication.java
│   │       ├── NawaqesFirebaseMessagingService.java
│   │       └── NotificationHelper.java
│   ├── webview-apk/                  # ⭐ مشروع WebView APK جاهز للبناء
│   │   ├── app/                      # تطبيق Android كامل
│   │   ├── build.gradle
│   │   ├── settings.gradle
│   │   └── README.md
│   ├── firebase/                     # إعداد Firebase
│   │   ├── firebase-config.json
│   │   ├── notifications.ts          # كود العميل
│   │   ├── fcm-sender.ts             # كود السيرفر
│   │   ├── test-push.js              # أداة اختبار
│   │   └── SETUP.md                  # دليل الإعداد
│   ├── build-scripts/                # سكريبتات البناء
│   │   ├── build-apk.sh              # Capacitor build
│   │   ├── build-apk-docker.sh       # Docker build
│   │   ├── build-apk-twa.sh          # TWA build (Bubblewrap)
│   │   └── github-actions-build-apk.yml
│   └── APK_BUILD_GUIDE.md            # هذا الملف
│
├── scripts/                          # سكريبتات التوليد
│   ├── generate_logo.py              # توليد الشعار
│   └── generate-webview-apk.py       # توليد مشروع WebView
│
└── download/                         # الملفات النهائية للمستخدم
    └── (APKs سيوضع هنا بعد البناء)
```

---

## ✅ Checklist للنشر

- [ ] تم تحديث المشروع على HF Spaces (PWA + manifest + sw.js)
- [ ] تم تصميم الشعار والأيقونات
- [ ] تم إنشاء `webview-apk` project
- [ ] تم بناء APK محلياً (Debug أو Release)
- [ ] تم رفع APK إلى `downloads/` folder
- [ ] تم اختبار الرابط: `https://safwatkhokha-nawaqes.hf.space/download/nawaqes-v2.0.0.apk`
- [ ] تم اختبار صفحة التحميل: `https://safwatkhokha-nawaqes.hf.space/get-app`
- [ ] تم إنشاء مشروع Firebase
- [ ] تم تنزيل `google-services.json` وإضافته للمشروع
- [ ] تم إعداد `FIREBASE_*` env vars على السيرفر
- [ ] تم اختبار الإشعارات بـ `test-push.js`
- [ ] تم اختبار التطبيق على هاتف Android حقيقي
- [ ] تم نشر الرابط للمستخدمين

---

## 📞 الدعم

للمساعدة في أي خطوة:
1. راجع قسم "استكشاف الأخطاء" أعلاه
2. ابحث في Logcat (لـ Android) أو Console (للمتصفح)
3. تحقق من `/home/z/my-project/nawaqes-apk/firebase/SETUP.md` لمشاكل Firebase
4. راجع GitHub Issues: https://github.com/safwatkhokha/nawaqes/issues

---

## 🎯 الخطوة التالية الموصى بها

1. **الآن**: ارفع التحديثات على HF Spaces وابدأ ببناء WebView APK
2. **خلال أيام**: انشر رابط `/get-app` للمستخدمين
3. **خلال أسبوع**: أضف Firebase للإشعارات
4. **عند حل مشكلة Play Console**: انتقل إلى Capacitor APK للنشر الرسمي

بالتوفيق! 🚀
