# نواقص — Nawaqes Complete Project

## محتويات المجلد

### 1. src/ — كود التطبيق (Frontend + Backend)
- React + TypeScript + Vite
- Express.js server
- SQLite database
- WebSocket real-time

### 2. public/ — ملفات عامة
- HTML, CSS, manifest
- صفحة التحميل + التثبيت
- Service Worker

### 3. server-data/ — بيانات السيرفر
- nawaqes.db — قاعدة البيانات (أحدث نسخة احتياطية)
- data/ — Firebase service account
- uploads/ — الصور والملفات المرفوعة

### 4. apks/ — تطبيقات APK جاهزة
- nawaqes-v1.2.1.apk — تطبيق نواقص (موقّع)
- nawaqes-chat-v1.3.1.apk — تطبيق دردشة (موقّع)

### 5. apk-source-chat/ — كود تطبيق الدردشة
- Android WebView project
- Package: com.nawaqes.chat
- يفتح /messages مباشرة

### 6. apk-source-main/ — كود تطبيق نواقص
- Android WebView project
- Package: com.nawaqes.app
- يفتح الصفحة الرئيسية

### 7. keystore/ — مفتاح التوقيع
- nawaqes-release.keystore
- Password: nawaqes2026
- Alias: nawaqes

## التشغيل
```bash
npm install
npm run build
npm start
```

## متطلبات
- Node.js 20+
- البيئة: ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET, etc.
