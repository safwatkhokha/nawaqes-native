# نواقص — Nawaqes Project

منصة الإعلانات الذكية المتكاملة — تطبيق ويب + APK موحّد.

## 📱 تطبيق APK (موحّد v1.3.0)

تطبيق واحد يجمع كل الميزات: إعلانات، سوق، دردشة، بث مباشر.

| الخاصية | القيمة |
|---------|------|
| Package | `com.nawaqes.app` |
| Version | 1.3.0 (versionCode 14) |
| يفتح | الصفحة الرئيسية `https://safwatkhokha-nawaqes.hf.space` |
| التوقيع | `nawaqes-release.keystore` |
| Android | minSdk 21, targetSdk 33 |

> **ملاحظة**: تطبيق "نواقص دردشة" المنفصل تم إزالته في v1.3.0 —
> الآن دردشة + إعلانات + سوق + بث مباشر في تطبيق واحد.

## 📂 محتويات المجلد

| المسار | الوصف |
|--------|------|
| `src/` | كود التطبيق (React + TypeScript + Vite + Express) |
| `public/` | ملفات PWA (manifest, service worker, icons, download pages) |
| `apk-source-main/` | كود Android WebView للتطبيق الموحّد |
| `apks/` | APKات جاهزة (للتحميل السريع) |
| `keystore/` | مفتاح توقيع APK |
| `Dockerfile` | لـ Hugging Face Spaces (port 7860) |
| `.env.example` | قالب المتغيرات السرية |
| `scripts/deploy-to-hf.sh` | سكريبت النشر إلى HF Spaces |
| `DEPLOYMENT-GUIDE.md` | دليل النشر الكامل |

## 🚀 التشغيل محلياً

```bash
npm install
npm run build
npm start
```

## 🚢 النشر على Hugging Face Spaces

```bash
export HF_TOKEN=hf_xxxxx
export HF_USER=safwatkhokha
bash scripts/deploy-to-hf.sh all
```

راجع `DEPLOYMENT-GUIDE.md` للتفاصيل الكاملة.

## 🔨 بناء APK جديد

استخدم GitHub Actions workflow في `.github/workflows/build-apk.yml`
أو ابنِ يدوياً باستخدام `apk-source-main/` + Android Studio.

راجع `apk-source-main/BUILD_GUIDE.md` للتفاصيل.

## 📋 المتطلبات

- Node.js 20+
- البيئة: ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET, etc. (راجع `.env.example`)
