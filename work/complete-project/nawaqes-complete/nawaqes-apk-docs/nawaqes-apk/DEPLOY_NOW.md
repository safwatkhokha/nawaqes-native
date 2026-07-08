# 🚀 نواقص | Nawaqes — دليل النشر السريع (5 دقائق)

> **الهدف**: رفع التطبيق على Hugging Face Spaces ليكون جاهزاً للمستخدمين فوراً.

---

## ✅ ما تم إنجازه (جاهز للنشر)

| المكوّن | الحالة | الموقع |
|---------|-------|---------|
| 🌐 **PWA كامل** | ✅ جاهز | `public/manifest.webmanifest` + `public/sw.js` |
| 📱 **صفحة تثبيت ذكية** | ✅ جاهز | `/install` (تكتشف الجهاز تلقائياً) |
| ⬇️ **صفحة تحميل** | ✅ جاهز | `/get-app` |
| 📴 **صفحة Offline** | ✅ جاهز | `public/offline.html` |
| 🎨 **الشعار والأيقونات** | ✅ جاهز | `public/icons/` (22 ملف) |
| 🔔 **Push Notifications** | ✅ جاهز (يحتاج Firebase) | `/api/notifications/*` |
| 📦 **APK placeholder** | ✅ جاهز | `/download/nawaqes-v2.0.0.apk` |
| 🤖 **مكون PWA Install Banner** | ✅ جاهز | `src/components/PWAInstallBanner.tsx` |
| 📋 **Capacitor Config** | ✅ جاهز | `capacitor.config.ts` |
| 🔐 **متغيرات البيئة** | ✅ جاهز | `.env.example` |

---

## 🚀 خطوات النشر (5 دقائق)

### الطريقة 1: النشر التلقائي (الأسرع)

```bash
# شغّل سكريبت النشر التلقائي
bash /home/z/my-project/nawaqes-apk/build-scripts/deploy-to-hf.sh
```

السكريبت سيقوم بـ:
1. تثبيت التبعيات
2. بناء المشروع (Web + Server)
3. تجهيز مجلد النشر
4. عمل commit و push إلى HF Spaces

> ⚠️ سيطلب منك بيانات Hugging Face (username + access token من https://huggingface.co/settings/tokens)

### الطريقة 2: النشر اليدوي عبر Git

```bash
# 1. اذهب لمجلد المشروع
cd /home/z/my-project/nawaqes

# 2. ثبّت التبعيات
npm install

# 3. ابنِ المشروع
npm run build

# 4. انسخ ملفات HF Spaces
cat > README.md << 'EOF'
---
title: Nawaqes
emoji: 🏪
colorFrom: red
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---
# نواقص | Nawaqes
EOF

# 5. اربط المشروع بـ HF Spaces
git init
git remote add origin https://huggingface.co/spaces/safwatkhokha/nawaqes

# 6. ارفع الكود
git add .
git commit -m "🚀 Production release v2.0.0"
git push -u origin main
```

### الطريقة 3: رفع عبر واجهة Hugging Face

1. اذهب إلى: https://huggingface.co/spaces/safwatkhokha/nawaqes
2. اضغط **Files → Add file → Upload files**
3. ارفع جميع ملفات المشروع (ما عدا `node_modules/`, `dist/`, `.env`)
4. سيتم البناء تلقائياً

---

## 🎯 بعد النشر — الروابط المتاحة

بعد دقائق من النشر، ستكون هذه الروابط جاهزة:

| الرابط | الوصف |
|--------|-------|
| 🔗 `https://safwatkhokha-nawaqes.hf.space/` | التطبيق (Web/PWA) |
| 📲 `https://safwatkhokha-nawaqes.hf.space/install` | **صفحة التثبيت الذكية** (تكتشف الجهاز) |
| ⬇️ `https://safwatkhokha-nawaqes.hf.space/get-app` | صفحة التحميل الكاملة |
| 📋 `https://safwatkhokha-nawaqes.hf.space/manifest.webmanifest` | PWA Manifest |
| 🔧 `https://safwatkhokha-nawaqes.hf.space/api/health` | Health Check |
| 🔔 `https://safwatkhokha-nawaqes.hf.space/api/notifications/firebase-config` | Firebase Config |

### الرابط المختصر للمشاركة مع المستخدمين:

**📱 `https://safwatkhokha-nawaqes.hf.space/install`**

هذا الرابط:
- يكتشف نوع جهاز المستخدم تلقائياً (iPhone, Android, Desktop)
- يعرض تعليمات التثبيت المناسبة
- يحتوي على زر "تثبيت" يفتح نافذة التثبيت التلقائية (PWA)
- يعرض QR Code لمشاركة سريعة
- يتحقق من توفر ملف APK تلقائياً

---

## 🔥 (اختياري) تفعيل Firebase Push Notifications

لتفعيل الإشعارات الفورية، اتبع:

📖 **الدليل الكامل**: `/home/z/my-project/nawaqes-apk/firebase/SETUP.md`

### ملخص سريع:

1. أنشئ مشروع Firebase: https://console.firebase.google.com
2. أضف تطبيق Web → احصل على `vapidKey` و `firebaseConfig`
3. أضف تطبيق Android (package: `com.nawaqes.app`) → حمّل `google-services.json`
4. حمّل Service Account JSON للسيرفر

#### على سيرفر HF Spaces:

بعد النشر، أضف هذه المتغيرات في HF Spaces **Settings → Repository secrets**:

```
FIREBASE_PROJECT_ID=nawaqes-app
FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXX
FIREBASE_AUTH_DOMAIN=nawaqes-app.firebaseapp.com
FIREBASE_STORAGE_BUCKET=nawaqes-app.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:web:abcdef
FIREBASE_VAPID_KEY=BJXXXXXXXXXXXX
```

أو ارفع ملف `.env` يحتوي على نفس المتغيرات إلى `/data/.env` على السيرفر.

---

## 📱 (اختياري) بناء APK للتثبيت المباشر

إذا أردت تقديم APK للمستخدمين بجانب PWA:

📖 **الدليل الكامل**: `/home/z/my-project/nawaqes-apk/APK_BUILD_GUIDE.md`

### الطريقة الأسرع: GitHub Actions (تلقائي)

```bash
# انسخ ملف workflow إلى مشروعك
mkdir -p /home/z/my-project/nawaqes/.github/workflows
cp /home/z/my-project/nawaqes-apk/build-scripts/github-actions-build-apk.yml \
   /home/z/my-project/nawaqes/.github/workflows/build-apk.yml

# Commit and push إلى GitHub
cd /home/z/my-project/nawaqes
git add .github/workflows/build-apk.yml
git commit -m "Add GitHub Actions APK build"
git push origin main

# APK سيظهر في GitHub → Actions → Build artifact
```

### الطريقة المحلية: Android Studio

1. حمّل Android Studio: https://developer.android.com/studio
2. افتح المجلد: `/home/z/my-project/nawaqes-apk/webview-apk/`
3. اضغط **Build → Build APK**
4. سيظهر ملف APK في: `app/build/outputs/apk/debug/app-debug.apk`

### بعد الحصول على APK:

```bash
# ضع APK في مجلد downloads في المشروع
mkdir -p /home/z/my-project/nawaqes/downloads
cp app-debug.apk /home/z/my-project/nawaqes/downloads/nawaqes-v2.0.0.apk

# commit and push
cd /home/z/my-project/nawaqes
git add downloads/nawaqes-v2.0.0.apk
git commit -m "Add APK release v2.0.0"
git push origin main
```

سيظهر تلقائياً على: `https://safwatkhokha-nawaqes.hf.space/download/nawaqes-v2.0.0.apk`
وستظهر زر "تحميل APK" تلقائياً في صفحة `/install`.

---

## 📊 ما الذي سيحدث بعد النشر

### تجربة المستخدم على الأندرويد:
1. يفتح `https://safwatkhokha-nawaqes.hf.space/install`
2. يرى زر **"تثبيت التطبيق الآن"** (يظهر تلقائياً في Chrome)
3. يضغطه → يفتح نافذة تثبيت PWA
4. يجد أيقونة نواقص على شاشته الرئيسية
5. عند فتح التطبيق، يظهر banner "تثبيت" إذا لم يثبّت بعد
6. يمكنه أيضاً تحميل APK مباشرة (إذا كان متاحاً)

### تجربة المستخدم على iPhone:
1. يفتح `https://safwatkhokha-nawaqes.hf.space/install` في Safari
2. يرى تعليمات "Add to Home Screen" مع صور
3. يضغط زر المشاركة → "إضافة إلى الشاشة الرئيسية"
4. يجد أيقونة نواقص على شاشته الرئيسية

### تجربة المستخدم على Desktop:
1. يفتح `https://safwatkhokha-nawaqes.hf.space/install`
2. يرى تعليمات "تثبيت من Chrome/Edge"
3. يضغط أيقونة التثبيت ➕ في شريط العنوان
4. يصبح التطبيق نافذة مستقلة

---

## ✅ Checklist ما قبل النشر

- [ ] المشروع مبني بنجاح (`npm run build` ينجح)
- [ ] ملف `manifest.webmanifest` موجود في `public/`
- [ ] ملف `sw.js` موجود في `public/`
- [ ] ملف `install.html` موجود في `public/`
- [ ] ملف `download.html` موجود في `public/`
- [ ] ملف `offline.html` موجود في `public/`
- [ ] مجلد `public/icons/` يحتوي على 9 أيقونات على الأقل
- [ ] `capacitor.config.ts` موجود في جذر المشروع
- [ ] `package.json` يحتوي على Capacitor dependencies
- [ ] `.env.example` يحتوي على متغيرات FIREBASE_*
- [ ] `Dockerfile` موجود ولم يتم تعديله (يعمل كما هو)
- [ ] `README.md` يحتوي على HF Spaces metadata

**كل شيء أعلاه ✅ جاهز بالفعل في `/home/z/my-project/nawaqes/`**

---

## 🆘 استكشاف الأخطاء

### المشكلة: Build fails بعد النشر على HF Spaces

```bash
# تحقق من logs في HF Spaces
# أو شغّل البناء محلياً للتأكد:
cd /home/z/my-project/nawaqes
npm install
npm run build
```

### المشكلة: PWA لا يثبت

- تأكد أن `manifest.webmanifest` يصل عبر `/manifest.webmanifest` (200 OK)
- تأكد أن `sw.js` يصل ويسجل بنجاح (افتح DevTools → Application → Service Workers)
- تأكد أن الـ icons موجودة بالأحجام الصحيحة (192 و 512 على الأقل)
- يجب أن يكون الموقع على HTTPS (HF Spaces يوفره تلقائياً)

### المشكلة: الإشعارات لا تعمل

- تأكد من إعداد FIREBASE_* env vars على HF Spaces
- تأكد من تفعيل Firebase Cloud Messaging API (V1) في Firebase Console
- راجع `/home/z/my-project/nawaqes-apk/firebase/SETUP.md`

### المشكلة: شاشة بيضاء

- تحقق من Console في المتصفح
- تأكد أن `/api/health` يعود 200
- تحقق من أن السيرفر يعمل (HF Spaces → Status: Running)

---

## 📞 الدعم

- **الدليل الكامل لـ APK**: `/home/z/my-project/nawaqes-apk/APK_BUILD_GUIDE.md`
- **دليل Firebase**: `/home/z/my-project/nawaqes-apk/firebase/SETUP.md`
- **دليل المستخدم**: `/home/z/my-project/nawaqes-apk/USER_GUIDE_AR.md`

---

## 🎉 بعد النشر الناجح

**شارك هذا الرابط مع المستخدمين**:

### 👉 `https://safwatkhokha-nawaqes.hf.space/install`

سيتمكن المستخدمون من:
- ✅ تثبيت التطبيق كـ PWA بنقرة واحدة
- ✅ تحميل APK مباشرة (عند توفره)
- ✅ استخدام التطبيق كنسخة Web
- ✅ تلقي الإشعارات (بعد إعداد Firebase)

**مبارك! 🎊 التطبيق جاهز للاستخدام الفوري من قبل المستخدمين في الوطن العربي.**
