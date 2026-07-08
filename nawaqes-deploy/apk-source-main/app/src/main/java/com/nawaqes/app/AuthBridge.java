package com.nawaqes.app;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.util.Log;

/**
 * AuthBridge
 *
 * JavaScript ↔ Java bridge for the WebView. Exposes methods that the JS side
 * can call via `window.AndroidAuthBridge.methodName(...)` to:
 *
 *   1. Receive the user's JWT after login (so Java can register FCM token)
 *   2. Receive Firebase config (so Java can init Firebase programmatically)
 *   3. Trigger FCM token registration
 *
 * This is required because push notifications on Android only work reliably
 * when the native FCM SDK is used — the WebView/PWA approach fails when the
 * app is killed or in Doze mode.
 */
public class AuthBridge {
    private static final String TAG = "AuthBridge";
    private final Context context;

    public AuthBridge(Context context) {
        this.context = context;
    }

    /**
     * Called from JS after the user logs in successfully.
     * Stores the JWT and triggers FCM token registration.
     *
     * JS usage:
     *   window.AndroidAuthBridge.onLogin(jwt, firebaseConfigJson)
     *
     * @param jwt                 the user's JWT token
     * @param firebaseConfigJson  JSON string with Firebase config
     *                            (apiKey, appId, projectId, messagingSenderId)
     */
    @JavascriptInterface
    public void onLogin(String jwt, String firebaseConfigJson) {
        Log.d(TAG, "onLogin called, jwt len=" + (jwt == null ? 0 : jwt.length()));
        if (jwt == null || jwt.isEmpty()) {
            Log.w(TAG, "onLogin: empty JWT — ignoring");
            return;
        }
        try {
            NawaqesFirebaseMessagingService.registerToken(context, jwt, firebaseConfigJson);
        } catch (Exception e) {
            Log.e(TAG, "onLogin failed: " + e.getMessage(), e);
        }
    }

    /**
     * Called from JS when the user logs out. Clears the stored JWT.
     */
    @JavascriptInterface
    public void onLogout() {
        Log.d(TAG, "onLogout called");
        try {
            android.content.SharedPreferences prefs = context
                    .getSharedPreferences("nawaqes_fcm", Context.MODE_PRIVATE);
            prefs.edit().remove("user_jwt").apply();
        } catch (Exception e) {
            Log.e(TAG, "onLogout failed: " + e.getMessage(), e);
        }
    }

    /**
     * Get the last known FCM token (for debugging).
     */
    @JavascriptInterface
    public String getFcmToken() {
        try {
            android.content.SharedPreferences prefs = context
                    .getSharedPreferences("nawaqes_fcm", Context.MODE_PRIVATE);
            return prefs.getString("fcm_token", "");
        } catch (Exception e) {
            return "";
        }
    }
}
