# =====================================================
# Nawaqes — Firebase Cloud Messaging Setup Guide
# =====================================================

## 🔥 خطوات إنشاء مشروع Firebase

### 1. إنشاء المشروع

1. اذهب إلى: https://console.firebase.google.com
2. اضغط **Add Project** (إضافة مشروع)
3. اسم المشروع: `nawaqes-app`
4. اضغط Continue → Disable Google Analytics (غير مطلوب) → Create Project

### 2. إضافة تطبيق Android

1. من قائمة المشروع: **Project Settings ⚙️ → Add app → Android**
2. Package name: `com.nawaqes.app`
3. App nickname: `Nawaqes`
4. SHA-1: اتركه فارغاً الآن (سنضيفه لاحقاً)
5. اضغط **Register app**
6. حمّل ملف `google-services.json` (سنستخدمه في Capacitor)

### 3. إضافة تطبيق Web (لـ PWA)

1. من نفس الصفحة: **Add app → Web `</>`**
2. App nickname: `Nawaqes Web`
3. اضغط **Register app**
4. ستظهر لك `firebaseConfig` — انسخ القيم
5. اذهب إلى **Project Settings → Cloud Messaging → Web Configuration**
6. اضغط **Generate key pair** للحصول على `vapidKey`

### 4. تحديث إعدادات التطبيق

عدّل الملف التالي بالقيم التي حصلت عليها:

```
/home/z/my-project/nawaqes-apk/firebase/firebase-config.json
```

وكذلك أنشئ ملف على السيرفر:

```
/home/z/my-project/nawaqes/.env.example  (أضف هذه القيم)
```

```env
FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXX
FIREBASE_AUTH_DOMAIN=nawaqes-app.firebaseapp.com
FIREBASE_PROJECT_ID=nawaqes-app
FIREBASE_STORAGE_BUCKET=nawaqes-app.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:web:abcdef
FIREBASE_VAPID_KEY=BJXXXXXXXXXXXX
```

### 5. تفعيل Cloud Messaging API (V1)

بدءاً من يونيو 2024، أوقفت Google FCM Legacy API.

1. اذهب إلى **Cloud Messaging** في Firebase Console
2. تأكد أن **Firebase Cloud Messaging API (V1)** مفعّل
3. اذهب إلى: https://console.cloud.google.com
4. اختر مشروع `nawaqes-app`
5. ابحث عن **Firebase Cloud Messaging API** وفعّله

### 6. توليد Service Account للحصول على Access Token

1. Firebase Console → **Project Settings → Service Accounts**
2. اضغط **Generate new private key** → حمّل ملف JSON
3. ضع الملف على السيرفر في: `/data/firebase-service-account.json`
4. سيستخدمه السيرفر لإرسال الإشعارات عبر V1 API

### 7. اختبار الإشعارات

استخدم سكريبت الاختبار المرفق:

```bash
node /home/z/my-project/nawaqes-apk/firebase/test-push.js
```

أو من خلال ساعي البريد (Postman):

```http
POST https://fcm.googleapis.com/v1/projects/nawaqes-app/messages:send
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "message": {
    "token": "<DEVICE_TOKEN>",
    "notification": {
      "title": "نواقص",
      "body": "مرحباً بك في نظام الإشعارات!"
    },
    "data": {
      "url": "/"
    }
  }
}
```

---

## 📱 أنواع الإشعارات المدعومة

| النوع | المنصة | الوصف |
|------|--------|-------|
| Web Push | PWA / Browser | عبر VAPID key + Service Worker |
| Native FCM | Android APK | عبر `@capacitor/push-notifications` |
| Topic Subscription | الكل | إشعارات لبث عام (مثلاً: عروض السوق) |
| User-specific | الكل | إشعارات فردية (رسائل، تعليقات) |

## 🔔 الإشعارات المقترحة لمشروع نواقص

1. **رسالة جديدة**: عند وصول رسالة في `MessagesPage`
2. **تعليق جديد**: عند تعليق شخص على منشورك
3. **إعجاب جديد**: عند إعجاب شخص بمنشورك
4. **عرض سوق جديد**: عند ظهور إعلان يطابق اهتماماتك
5. **شحن المحفظة**: تأكيد شحن الرصيد
6. **انتهاء ترويج**: قبل انتهاء فترة ترويج إعلانك
7. **تحديثات النظام**: إعلانات من الإدارة (admin broadcast)

## 🌍 استهداف الوطن العربي

- استخدم خادم FCM الافتراضي (Google تتعامل مع التوجيه تلقائياً).
- اللغة الافتراضية: العربية (`dir: 'rtl'`, `lang: 'ar'`) — مفعّل في الكود.
- التوقيت: استخدم توقيت القاهرة (Africa/Cairo) عند جدولة الإشعارات.
