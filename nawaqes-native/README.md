# Nawaqes Native — تطبيق أندرويد أصلي

> تطبيق نواقص بواجهة أندرويد **أصلية** (Native) — مبني بـ React Native + Expo.

## 📱 الفرق عن التطبيق السابق
| القديم (WebView) | الجديد (Native) |
|---|---|
| يفتح موقع الويب داخل WebView | مكونات أندرويد حقيقية |
| بطيء (تحميل HTML/JS) | سريع (كود أصلي) |
| محدود الوصول للجهاز | وصول كامل (كاميرا، إشعارات، ملفات) |
| نفس تصميم الويب | تصميم أصلي بمكونات أندرويد |

## 🚀 طريقة البناء

### المتطلبات:
- Node.js 18+
- Expo CLI: `npm install -g expo-cli eas-cli`
- حساب Expo (مجاني): https://expo.dev

### البناء محلياً (للتجربة):
```bash
cd nawaqes-native
npm install
npx expo start  # للتطوير
# أو
npx expo run:android  # يحتاج Android Studio
```

### بناء APK عبر EAS (في السحابة):
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

### بناء AAB للنشر على Play Store:
```bash
eas build --platform android --profile production
```

## 📁 هيكل المشروع
```
nawaqes-native/
├── App.tsx                    # نقطة الدخول
├── app.json                   # إعدادات Expo
├── eas.json                   # إعدادات البناء
├── package.json
├── babel.config.js
├── metro.config.js
├── tsconfig.json
└── src/
    ├── contexts/
    │   └── AuthContext.tsx    # إدارة المصادقة (SecureStore)
    ├── navigation/
    │   └── AppNavigator.tsx   # التنقل + Bottom Tabs
    ├── screens/
    │   ├── LoginScreen.tsx
    │   ├── HomeScreen.tsx       # تغذية الإعلانات
    │   ├── MarketLiveScreen.tsx # البث المباشر
    │   ├── CreatePostScreen.tsx # إنشاء إعلان + رفع صور
    │   ├── WalletScreen.tsx     # المحفظة + المعاملات
    │   └── ProfileScreen.tsx    # الحساب + الإعدادات
    └── services/
        └── api.ts               # عميل API (Axios + SecureStore)
```

## ✅ الشاشات المنجزة:
- [x] **Login** — بريد إلكتروني + كلمة مرور (مع SecureStore)
- [x] **Home/Feed** — تغذية الإعلانات (FlatList + RefreshControl)
- [x] **Market Live** — قائمة البثوث النشطة (يجدد كل 15 ثانية)
- [x] **Create Post** — منتقي صور أصلي + رفع + نشر
- [x] **Wallet** — الرصيد + الهدايا + المعاملات
- [x] **Profile** — الحساب + الإعدادات + خروج
- [x] **Navigation** — Auth flow + Bottom Tabs

## 🔜 قيد التطوير:
- [ ] البث المباشر بالكاميرا (Camera + WebRTC)
- [ ] الدردشة
- [ ] الإشعارات (FCM)
- [ ] القنوات
- [ ] لوحة التحكم

## 🎨 المميزات الأصلية:
- ✅ **SecureStore** — تشفير JWT على الجهاز
- ✅ **ImagePicker** — منتقي صور أندرويد أصلي
- ✅ **KeyboardAvoidingView** — لوحة مفاتيح لا تغطي الحقول
- ✅ **SafeAreaView** — دعم الشاشات ذات الحواف
- ✅ **RefreshControl** — سحب للتحديث
- ✅ **Haptics** — اهتزاز عند التفاعل
