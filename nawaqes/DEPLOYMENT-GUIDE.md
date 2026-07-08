# 🚀 دليل النشر الكامل — مشروع نواقص

> **الملخص**: هذا الدليل يشرح كيفية رفع مشروع نواقص على Hugging Face Spaces
> مع كل الإعدادات اللازمة لتشغيله في بيئة الإنتاج.

## 📋 المحتويات

1. [المتطلبات الأساسية](#1-المتطلبات-الأساسية)
2. [فحص المشروع — ما تم إصلاحه](#2-فحص-المشروع--ما-تم-إصلاحه)
3. [إنشاء مساحة على Hugging Face Spaces](#3-إنشاء-مساحة-على-hugging-face-spaces)
4. [إعداد المتغيرات السرية (Secrets)](#4-إعداد-المتغيرات-السرية-secrets)
5. [رفع ملف Firebase Service Account](#5-رفع-ملف-firebase-service-account)
6. [تشغيل سكريبت النشر](#6-تشغيل-سكريبت-النشر)
7. [التحقق من نجاح النشر](#7-التحقق-من-نجاح-النشر)
8. [استكشاف الأخطاء وإصلاحها](#8-استكشاف-الأخطاء-وإصلاحها)

---

## 1. المتطلبات الأساسية

| المتطلب | الوصف |
|---------|--------|
| حساب Hugging Face | https://huggingface.co/join |
| HF Token (write) | https://huggingface.co/settings/tokens — صلاحية **Write** |
| مشروع نواقص | المجلد بعد التعديلات (يحتوي على `Dockerfile` + `scripts/deploy-to-hf.sh`) |
| Node.js 20+ | لتشغيل سكريبت البناء محلياً |
| git | مثبت افتراضياً على معظم الأنظمة |
| (اختياري) Docker | للبناء المحلي — غير مطلوب للنشر عبر السكريبت |

---

## 2. فحص المشروع — ما تم إصلاحه

تم فحص المشروع بالكامل وإصلاح المشاكل التالية:

### ✅ أخطاء TypeScript (تم إصلاح 14 خطأ)
- `src/chat/MessageBubble.tsx`: استخدام `any` صراحةً بدلاً من `never`
- `src/components/ChannelView.tsx`: إضافة `'posts'` إلى نوع `ChannelTab`
- `src/components/MarketPulsePage.tsx`: تمرير `limit` كنص بدلاً من رقم؛ تصحيح فلتر التبويبات
- `src/components/RightSidebar.tsx`: إضافة أنواع الإشعارات `video_like`/`video_save`/`video_share`
- `src/components/chat/MessageInput.tsx`: تصحيح نوع `setMessageText`
- `src/routes/auth.ts`: جعل `current` حقاً مطلوباً في `SessionRecord`؛ استبدال `'base32'` بـ `'base64'`

### ✅ مشكلة تحميل متغيرات البيئة (حرجة)
- **المشكلة**: كان `src/database/index.ts` يُحمَّل عند استيراد الوحدات النمطية (ESM hoisting)،
  ويقرأ `process.env.ADMIN_PASSWORD` **قبل** تشغيل `dotenv.config()` في `server.ts`.
  النتيجة: رفض تشغيل السيرفر في الإنتاج لأنه يرى كلمات مرور فارغة.
- **الحل**: تحويل جميع استيرادات الـ routes إلى `await import()` داخل `startServer()`،
  مما يضمن تحميل متغيرات البيئة أولاً.

### ✅ مفتاح Firebase Service Account تالف
- **المشكلة**: الملف `server-data/data/firebase-service-account.json` كان يحتوي على
  سطر `[REDACTED:ssh_private_key]` قبل `-----BEGIN PRIVATE KEY-----` مما يجعله غير صالح.
- **الحل**: تم إصلاح الملف، وأصبح المفتاح صالحاً للاستخدام مع Firebase Admin SDK.

### ✅ ملفات النشر المفقودة
تم إنشاء:
- `Dockerfile` — لـ Hugging Face Spaces (SDK: docker, port: 7860)
- `.dockerignore` — لاستبعاد الملفات غير الضرورية من صورة Docker
- `.env.example` — قالب كامل لجميع متغيرات البيئة المطلوبة
- `scripts/deploy-to-hf.sh` — سكريبت نشر كامل (build → prepare → push)

---

## 3. إنشاء مساحة على Hugging Face Spaces

1. اذهب إلى: https://huggingface.co/new-space
2. املأ البيانات:
   - **Owner**: حسابك (مثلاً `safwatkhokha`)
   - **Space name**: `nawaqes`
   - **License**: MIT
   - **SDK**: **Docker** (مهم!)
   - **Space hardware**: **CPU basic (Free)** — يكفي للبداية
   - **Visibility**: Public أو Private حسب رغبتك
3. اضغط **Create Space**

> 💡 بعد الإنشاء، ستكون المساحة فارغة. السكريبت سيرفع الكود لها تلقائياً.

---

## 4. إعداد المتغيرات السرية (Secrets)

في صفحة المساحة: **Settings → Variables and secrets → New secret**

أضف المتغيرات التالية (القيم أمثلة — استبدلها بقيمك الحقيقية):

| الاسم | القيمة | ملاحظة |
|------|-------|--------|
| `NODE_ENV` | `production` | مطلوب |
| `JWT_SECRET` | (64+ حرف hex عشوائي) | استخدم: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `ADMIN_EMAIL` | `admin@nawaqes.app` | بريد المسؤول |
| `ADMIN_PASSWORD` | `YourStrongPass123!` | 8 أحرف على الأقل |
| `OWNER_EMAIL` | `owner@nawaqes.app` | بريد المالك |
| `OWNER_PASSWORD` | `YourStrongPass123!` | 8 أحرف على الأقل |
| `OWNER_PHONE` | `01000000001` | رقم المالك |
| `HF_TOKEN` | `hf_xxxxxxxxxxxxxxxxx` | نفس التوكن المستخدم للرفع |
| `HF_BACKUP_REPO` | `safwatkhokha/nawaqes-backup` | مستودع النسخ الاحتياطي (Dataset) |
| `FIREBASE_PROJECT_ID` | `nawaqes-app` | من إعدادات Firebase |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-fbsvc@nawaqes-app.iam.gserviceaccount.com` | من ملف الخدمة |
| `FIREBASE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n` | راجع القسم 5 |
| `FIREBASE_API_KEY` | `AIzaSy...` | من إعدادات Firebase للمشروع |
| `FIREBASE_VAPID_KEY` | `BL...` | من Firebase Console → Cloud Messaging |
| `APP_URL` | `https://safwatkhokha-nawaqes.hf.space` | استبدل باسم مساحتك |

> 🔐 **ملاحظة أمان**: استخدم **Secrets** (وليس Variables) لكل القيم الحساسة.
> Hugging Face لا يعرض الـ Secrets بعد حفظها.

---

## 5. رفع ملف Firebase Service Account

ملف `server-data/data/firebase-service-account.json` (الذي يأتي مع المشروع) يحتوي على
مفتاح Firebase اللازم لإرسال الإشعارات. هناك طريقتان لرفعه:

### الطريقة 1: عبر متغيرات البيئة (موصى بها للأمان)

اقرأ الملف محلياً وحوّله إلى متغيرات:

```bash
# من جهازك المحلي
cd /home/z/my-project/nawaqes
node -e "
const data = require('./server-data/data/firebase-service-account.json');
console.log('FIREBASE_PROJECT_ID=' + data.project_id);
console.log('FIREBASE_CLIENT_EMAIL=' + data.client_email);
console.log('FIREBASE_PRIVATE_KEY=\"' + data.private_key.replace(/\n/g, '\\\\n') + '\"');
"
```

انسخ المخرجات وأضفها كـ Secrets في HF Spaces.

### الطريقة 2: رفع الملف مباشرة إلى /data

بعد إنشاء المساحة، استخدم HF API لرفع الملف:

```bash
# ضع الملف في المسار /data/nawaqes-firebase-admin.json داخل المساحة
curl -X POST \
  "https://huggingface.co/spaces/safwatkhokha/nawaqes/upload/main/data/nawaqes-firebase-admin.json" \
  -H "Authorization: Bearer $HF_TOKEN" \
  -F "file=@server-data/data/firebase-service-account.json"
```

> ⚠️ لا ترفع الملف إلى Git (السكريبت يستبعده تلقائياً في `.dockerignore` و `rsync`).

---

## 6. تشغيل سكريبت النشر

من جهازك المحلي:

```bash
cd /home/z/my-project/nawaqes

# 1. عيّن متغيرات البيئة (أضفها لـ ~/.bashrc للديمومة)
export HF_TOKEN=hf_xxxxxxxxxxxxxxxxx
export HF_USER=safwatkhokha        # اسم حسابك على HF
export HF_REPO=nawaqes              # اسم المساحة

# 2. شغّل سكريبت النشر الكامل (build + prepare + push)
bash scripts/deploy-to-hf.sh all
```

### أوضاع التشغيل

| الأمر | الوصف |
|------|------|
| `bash scripts/deploy-to-hf.sh build` | بناء فقط، بدون رفع |
| `bash scripts/deploy-to-hf.sh prepare` | بناء + تجهيز مجلد النشر، بدون رفع |
| `bash scripts/deploy-to-hf.sh push` | رفع فقط (بعد prepare) |
| `bash scripts/deploy-to-hf.sh all` | كل الخطوات (افتراضي) |

### ماذا يفعل السكريبت؟

1. **Build**: `npm ci` → `tsc --noEmit` → `npm run build` (Vite + esbuild)
2. **Prepare**: نسخ الملفات إلى `/home/z/my-project/nawaqes-deploy/` مع:
   - استبعاد `node_modules`, `dist`, `.env`, APKs, keystores
   - إنشاء `.gitattributes` (لـ LFS)
   - إنشاء `README.md` بهدف HF Spaces (SDK: docker)
   - نسخ `.env.example` كـ `.env` (تُتجاوز قيمه بواسطة HF Secrets)
3. **Push**: `git init` → `git remote add` (مع HF_TOKEN في الـ URL) → `git push origin main`

---

## 7. التحقق من نجاح النشر

بعد انتهاء السكريبت بنجاح، انتظر 2-5 دقائق ثم تحقق:

```bash
# استبدل USERNAME و REPO بقيمك
SPACE_URL="https://safwatkhokha-nawaqes.hf.space"

# 1. فحص الصحة
curl $SPACE_URL/api/health
# يجب أن يرجع: {"status":"ok","database":"connected",...}

# 2. فحص الصفحة الرئيسية
curl -I $SPACE_URL/
# يجب أن يرجع: HTTP/1.1 200 OK

# 3. فحص تسجيل الدخول
curl -X POST $SPACE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nawaqes.app","password":"YourStrongPass123!"}'
# يجب أن يرجع: {"user":{...},"token":"..."}
```

افتح المتصفح على: **https://safwatkhokha-nawaqes.hf.space**

### صفحات مفيدة

| الصفحة | الرابط |
|-------|------|
| التطبيق الرئيسي | `https://<user>-nawaqes.hf.space/` |
| صفحة الرسائل | `https://<user>-nawaqes.hf.space/#/messages` |
| صفحة تحميل APK | `https://<user>-nawaqes.hf.space/get-app` |
| إعداد Firebase | `https://<user>-nawaqes.hf.space/firebase-setup` |
| PWA Manifest | `https://<user>-nawaqes.hf.space/manifest.webmanifest` |
| Health Check | `https://<user>-nawaqes.hf.space/api/health` |
| Logs (HF) | `https://huggingface.co/spaces/<user>/nawaqes/logs` |

---

## 8. استكشاف الأخطاء وإصلاحها

### المشكلة: السيرفر يرفض التشغيل بـ "JWT_SECRET missing"

**السبب**: لم يتم تعيين `JWT_SECRET` كـ Secret في HF Spaces، أو قيمته تحمل placeholder.

**الحل**:
1. اذهب إلى Settings → Variables and secrets
2. تأكد من وجود `JWT_SECRET` بقيمة عشوائية 64+ حرفاً hex
3. أعد تشغيل المساحة (Factory reboot في Settings)

---

### المشكلة: "ADMIN_EMAIL/ADMIN_PASSWORD not configured"

**السبب**: نفس السبب أعلاه — متغيرات البيئة غير محملة.

**الحل**: راجع القسم 4 وتأكد من تعيين كل من:
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (8+ chars)
- `OWNER_EMAIL`, `OWNER_PASSWORD` (8+ chars)

---

### المشكلة: فشل `git push` بـ 401 Unauthorized

**السبب**: `HF_TOKEN` غير صحيح أو منتهي الصلاحية.

**الحل**:
1. اذهب إلى https://huggingface.co/settings/tokens
2. أنشئ توكن جديد بصلاحية **Write**
3. حدّث المتغير: `export HF_TOKEN=hf_new_token_here`
4. أعد تشغيل السكريبت

---

### المشكلة: فشل `git push` بـ 404 Not Found

**السبب**: المساحة غير موجودة، أو `HF_USER`/`HF_REPO` خاطئ.

**الحل**:
1. تأكد من إنشاء المساحة في القسم 3
2. تحقق من `HF_USER` و `HF_REPO`: `echo $HF_USER/$HF_REPO`
3. تأكد من تطابق الأسماء مع URL المساحة

---

### المشكلة: Build فاشل في HF Spaces

**السبب الأرجح**: مشكلة في تثبيت `better-sqlite3` (يحتاج compilation).

**الحل**: راجع سجلات البناء على HF (Logs tab). الـ Dockerfile مثبت فيه `python3 make g++ libc6-dev` للـ native build.

---

### المشكلة: السيرفر يعمل لكن الصور لا تظهر

**السبب**: مجلد `uploads/` فارغ — الصور المرفوعة سابقاً موجودة في `server-data/`.

**الحل**: ارفع الصور القديمة إلى المساحة عبر HF API:

```bash
# رفع مجلد uploads إلى /data/uploads في المساحة
cd /home/z/my-project/upload/nawaqes-server-data-2026-07-05.zip
# (نفّذ الضغط أولاً ثم ارفع كل ملف)
```

أو استخدم endpoint النسخ الاحتياطي:
```bash
# بعد تسجيل دخول الأدمن، احصل على token ثم:
curl -X POST https://<user>-nawaqes.hf.space/api/admin/backup-uploads \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

### المشكلة: الإشعارات (FCM) لا تعمل

**السبب**: إعدادات Firebase غير مكتملة.

**الحل**: تحقق من:
1. وجود `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
2. صحة `FIREBASE_PRIVATE_KEY` — يجب أن يحتوي على `\n` حقيقية (استخدم `\\n` في الـ Secret)
3. شاهد سجل السيرفر للبحث عن `[FCM]` messages

---

## 📞 معلومات إضافية

### بنية المشروع

```
nawaqes/
├── src/                  # كود التطبيق (React + Express)
├── public/               # ملفات PWA (manifest, service worker, icons)
├── server-data/          # بيانات السيرفر (Firebase service account, ملفات رفع)
├── apks/                 # تطبيق APK جاهز (nawaqes-v1.3.0.apk)
├── apk-source-main/      # كود مصدر تطبيق نواقص الموحّد v1.3.0
├── keystore/             # مفتاح توقيع APK (سري!)
├── .github/workflows/
│   └── build-apk.yml     # GitHub Actions لبناء APK تلقائياً
├── scripts/
│   └── deploy-to-hf.sh   # سكريبت النشر إلى HF Spaces
├── Dockerfile            # لـ HF Spaces (SDK: docker)
├── .dockerignore         # استبعادات Docker
├── .env.example          # قالب المتغيرات
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### الحسابات الافتراضية بعد أول تشغيل

| الدور | البريد | كلمة المرور |
|------|-------|-------------|
| المسؤول | قيمة `ADMIN_EMAIL` | قيمة `ADMIN_PASSWORD` |
| المالك | قيمة `OWNER_EMAIL` | قيمة `OWNER_PASSWORD` |

> غيّر كلمات المرور من لوحة التحكم بعد أول تسجيل دخول.

### النسخ الاحتياطي التلقائي

السيرفر ينشئ نسخة احتياطية يومية من قاعدة البيانات إلى `HF_BACKUP_REPO`
(Dataset على HF). تأكد من:
1. إنشاء Dataset باسم `safwatkhokha/nawaqes-backup` (أو أي اسم تختاره)
2. تعيين `HF_BACKUP_REPO` و `HF_TOKEN` كـ Secrets

### تحديث التطبيق لاحقاً

عند تعديل الكود محلياً:

```bash
cd /home/z/my-project/nawaqes
bash scripts/deploy-to-hf.sh all
```

سيقوم السكريبت بـ:
- إعادة بناء المشروع
- تحديث مجلد النشر
- عمل commit + push إلى HF Spaces

HF Spaces سيكتشف التغيير وسيعيد بناء الـ Docker image تلقائياً خلال 2-5 دقائق.

---

## ✅ قائمة التحقق النهائية قبل النشر

- [ ] إنشاء مساحة HF Spaces (SDK: Docker)
- [ ] تعيين جميع الـ Secrets المطلوبة (راجع القسم 4)
- [ ] تعيين `HF_TOKEN`, `HF_USER`, `HF_REPO` محلياً
- [ ] تشغيل `bash scripts/deploy-to-hf.sh all`
- [ ] التحقق من `/api/health` بعد 5 دقائق
- [ ] تسجيل الدخول بحساب المسؤول
- [ ] تغيير كلمة مرور المسؤول والمالك
- [ ] اختبار رفع صورة ومنشور
- [ ] اختبار الدردشة (WebSocket)
- [ ] (اختياري) رفع الصور القديمة من `server-data/`

بالتوفيق! 🎉
