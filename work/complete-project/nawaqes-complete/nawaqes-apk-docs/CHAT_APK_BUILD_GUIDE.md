# 📱 نواقص دردشة — APK Build Guide v1.3.0

## المشكلة التي تم إصلاحها
تطبيق الدردشة APK القديم (v1.2.2) كان يفتح الصفحة الرئيسية بدلاً من صفحة الدردشة.
الإصدار الجديد (v1.3.0) يفتح `/messages` مباشرةً.

## كيف يعمل
1. الـ APK يستخدم `start_url: /messages?app=chat` في manifest
2. عند فتح التطبيق، الـ WebView يحمل `https://safwatkhokha-nawaqes.hf.space/messages?app=chat`
3. كود App.tsx يكتشف `?app=chat` ويوجه تلقائياً لـ `#/messages`
4. ينظف الـ URL (يحذف `?app=chat`)

## بناء APK جديد

### الطريقة 1: Bubblewrap (TWA) — الأسهل

```bash
# تثبيت Bubblewrap
npm install -g @bubblewrap/cli

# إنشاء مشروع TWA لتطبيق الدردشة
mkdir nawaqes-chat-apk && cd nawaqes-chat-apk

bubblewrap init \
  --manifest="https://safwatkhokha-nawaqes.hf.space/manifest-chat.webmanifest" \
  --packageId="com.nawaqes.chat" \
  --name="نواقص دردشة" \
  --launcherName="دردشة" \
  --display=standalone \
  --orientation=portrait \
  --themeColor="#000000" \
  --backgroundColor="#000000" \
  --iconUrl="https://safwatkhokha-nawaqes.hf.space/icons/icon-512.png" \
  --maskableIconUrl="https://safwatkhokha-nawaqes.hf.space/icons/maskable-512.png" \
  --splashScreenFadeOutDuration=300 \
  --signingKeyPath=./keystore \
  --signingKeyAlias=nawaqes-chat

# بناء APK
bubblewrap build --skipPwaValidation --type=apk

# نسخ النتيجة
cp app-release-signed.apk /path/to/nawaqes/public/download/nawaqes-chat-v1.3.0.apk
```

### الطريقة 2: WebView APK (مخصص)

#### 1. تعديل AndroidManifest.xml
```xml
<application
    android:label="نواقص دردشة"
    ...>
    <activity android:name=".MainActivity" ...>
        ...
    </activity>
</application>
```

#### 2. تعديل MainActivity.java
```java
// تغيير الـ start URL لفتح صفحة الدردشة مباشرة
private static final String START_URL = "https://safwatkhokha-nawaqes.hf.space/messages?app=chat";
```

#### 3. تعديل strings.xml
```xml
<string name="app_name">نواقص دردشة</string>
```

#### 4. تعديل build.gradle
```gradle
android {
    defaultConfig {
        applicationId "com.nawaqes.chat"
        versionCode 16
        versionName "1.3.0"
    }
}
```

#### 5. بناء
```bash
./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk public/download/nawaqes-chat-v1.3.0.apk
```

### الطريقة 3: PWA TWA Builder (online)
1. اذهب إلى https://www.pwabuilder.com/
2. أدخل: `https://safwatkhokha-nawaqes.hf.space`
3. اختر manifest: `manifest-chat.webmanifest`
4. حمّل Android APK
5. عدّل `applicationId` إلى `com.nawaqes.chat`
6. عدّل `start_url` إلى `/messages?app=chat`

## الفرق بين التطبيقين

| | تطبيق نواقص | تطبيق دردشة |
|---|---|---|
| Package ID | `com.nawaqes.app` | `com.nawaqes.chat` |
| اسم التطبيق | نواقص | نواقص دردشة |
| start_url | `/` (الرئيسية) | `/messages?app=chat` |
| manifest | `manifest.webmanifest` | `manifest-chat.webmanifest` |
| الإصدار | v1.1.0 | v1.3.0 |
| الحجم | 6.7 MB | 7.0 MB |

## رفع APK للسيرفر
```bash
# نسخ APK إلى مجلد التحميل
cp nawaqes-chat-v1.3.0.apk /home/z/my-project/work/hf-space/public/download/

# commit + push
cd /home/z/my-project/work/hf-space
git add -A
git commit -m "feat: نشر تطبيق دردشة v1.3.0"
git push origin main
```
