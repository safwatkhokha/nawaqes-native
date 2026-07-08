# نواقص — ملفات النشر النهائية

## 📦 الملفات

### 1. nawaqes-COMPLETE-FIXED-2026-07-05.zip (31 MB)
المشروع الكامل بعد إصلاح جميع الأخطاء — يحتوي على:
- الكود المصدري (src/)
- ملفات البناء (Dockerfile, .dockerignore, .env.example)
- سكريبت النشر (scripts/deploy-to-hf.sh)
- دليل النشر الكامل (DEPLOYMENT-GUIDE.md)
- تطبيقات APK الجاهزة (apks/)
- كود مصدر تطبيقات الأندرويد (apk-source-chat, apk-source-main)
- مفتاح توقيع APK (keystore/)
- ملف Firebase service account (server-data/data/firebase-service-account.json)

### 2. nawaqes-hf-spaces-deploy.zip (1.3 MB)
نسخة جاهزة للرفع مباشرة على Hugging Face Spaces — تحتوي فقط على:
- الكود المصدري (بدون APKs / keystores / node_modules)
- Dockerfile + .dockerignore
- .env.example + .env (placeholder values)
- README.md بهدف HF Spaces (sdk: docker)
- scripts/deploy-to-hf.sh
- .gitattributes (لـ LFS)

**ملاحظة**: لا يحتوي على ملف Firebase service account (لأسباب أمنية).

## 🚀 كيفية النشر

1. **افتح** `DEPLOYMENT-GUIDE.md` واتبع الخطوات بالتفصيل.
2. **الطريقة السريعة**:
   ```bash
   # فك ضغط النسخة الكاملة
   unzip nawaqes-COMPLETE-FIXED-2026-07-05.zip -d nawaqes
   cd nawaqes

   # عيّن متغيرات البيئة
   export HF_TOKEN=hf_xxxxx
   export HF_USER=safwatkhokha
   export HF_REPO=nawaqes

   # شغّل سكريبت النشر
   bash scripts/deploy-to-hf.sh all
   ```

## ✅ ما تم إصلاحه

| # | المشكلة | الحل |
|---|---------|------|
| 1 | 14 خطأ TypeScript | إصلاح الأنواع والمقارنات في 6 ملفات |
| 2 | السيرفر يرفض التشغيل (DB يُحمّل قبل dotenv) | تحويل استيرادات الـ routes إلى dynamic imports |
| 3 | مفتاح Firebase تالف (`[REDACTED:ssh_private_key]`) | تنظيف الملف، المفتاح صالح الآن |
| 4 | لا يوجد Dockerfile | إنشاء Dockerfile لـ HF Spaces (port 7860, /data persistent) |
| 5 | لا يوجد .env.example | إنشاء قالب شامل لكل المتغيرات |
| 6 | سكريبت النشر مكسور | إنشاء scripts/deploy-to-hf.sh جديد مع 4 أوضاع |

## 📋 متغيرات البيئة المطلوبة

راجع `.env.example` للقائمة الكاملة. الأهم:
- `JWT_SECRET` (64+ حرف عشوائي)
- `ADMIN_EMAIL` + `ADMIN_PASSWORD` (8+ chars)
- `OWNER_EMAIL` + `OWNER_PASSWORD` (8+ chars)
- `HF_TOKEN` (write permission)
- `HF_BACKUP_REPO` (مستودع النسخ الاحتياطي)
- `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`

## 🔗 روابط مفيدة

- دليل النشر الكامل: `DEPLOYMENT-GUIDE.md` داخل الـ zip
- Hugging Face Spaces: https://huggingface.co/spaces
- HF Tokens: https://huggingface.co/settings/tokens
- استكشاف الأخطاء: راجع القسم 8 من دليل النشر
