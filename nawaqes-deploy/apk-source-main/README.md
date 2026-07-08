# 📱 Nawaqes Android App v3.0.0

تطبيق أندرويد محسّن لنواقص — متزامن بالكامل مع الموقع.

## ✅ المميزات

| الميزة | الوصف |
|--------|------|
| 📷 **كاميرا مباشرة** | التقاط الصور والفيديو مباشرة من الكاميرا |
| 📁 **رفع ملفات** | رفع صور متعددة من معرض الصور |
| 💾 **تخزين دائم** | حفظ بيانات المستخدم محلياً (يبقى بعد إغلاق التطبيق) |
| 🎤 **ميكروفون** | رسائل صوتية + مكالمات WebRTC |
| 📍 **موقع** | للأ nearby ads feature |
| 🔔 **إشعارات FCM** | Firebase Cloud Messaging (يتطلب google-services.json) |
| 🔄 **Pull-to-refresh** | اسحب لأسفل للتحديث |
| ⬅️ **زر رجوع ذكي** | يرجع في تاريخ WebView أولاً قبل الخروج |
| 🌐 **Deep linking** | `nawaqes://` scheme |
| 📡 **صفحة offline** | تظهر عند انقطاع الإنترنت |
| 🎨 **Splash screen** | شاشة بداية أثناء التحميل |

## 🔧 البناء

### الطريقة 1: GitHub Actions (موصى بها)
```bash
# Push الكود إلى GitHub، ثم اذهب إلى:
# https://github.com/safwatkhokha/nawaqes/actions
# سيتم بناء APK تلقائياً وتحميله كـ artifact
```

### الطريقة 2: بناء محلي
```bash
cd nawaqes-apk/webview-apk
./gradlew assembleRelease
# APK سيكون في:
# app/build/outputs/apk/release/app-release.apk
```

## 📋 المتطلبات

- Android 5.0+ (API 24+)
- Chrome WebView (موجود افتراضياً على كل أجهزة أندرويد)
- اتصال بالإنترنت

## 🔗 الروابط

- **الموقع:** https://safwatkhokha-nawaqes.hf.space
- **GitHub:** https://github.com/safwatkhokha/nawaqes
- **Package ID:** `com.nawaqes.app`

## 📝 معلومات الإصدار

| الحقل | القيمة |
|-------|--------|
| Version | 3.0.0 |
| Version Code | 3 |
| Min SDK | 24 (Android 5.0) |
| Target SDK | 34 (Android 14) |
| Package | com.nawaqes.app |
