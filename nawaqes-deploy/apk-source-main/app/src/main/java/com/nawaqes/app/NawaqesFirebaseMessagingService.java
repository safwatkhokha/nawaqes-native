package com.nawaqes.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

/**
 * NawaqesFirebaseMessagingService
 *
 * Native Android FCM service that receives push notifications even when the
 * app is killed or in Doze mode. The WebView-based PWA cannot receive push
 * notifications reliably on Android when the app is closed, so we bridge:
 *
 *   1. WebView (JS) calls AuthBridge.registerFCM() after login
 *   2. AuthBridge (Java) calls registerToken() here with the user's JWT
 *   3. registerToken() asks Firebase for an FCM token + posts it to the
 *      server's /api/notifications/register-device endpoint
 *   4. When a push arrives, onMessageReceived() shows a system notification
 *
 * Firebase is initialized programmatically (no google-services.json needed)
 * using config values passed from JS via AuthBridge.
 */
public class NawaqesFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "NawaqesFCM";
    private static final String PREFS_NAME = "nawaqes_fcm";
    private static final String KEY_TOKEN = "fcm_token";
    private static final String KEY_JWT = "user_jwt";
    private static final String KEY_CONFIG = "fb_config";
    private static final String CHANNEL_ID_DEFAULT = "nawaqes_default";
    private static final String CHANNEL_ID_MESSAGES = "nawaqes_messages";
    private static final String TOPIC_ALL = "nawaqes_all";

    private static boolean firebaseInitialized = false;

    /**
     * Initialize Firebase programmatically using config values from the WebView.
     * Called once after the user logs in (AuthBridge passes the config from JS).
     */
    public static synchronized void initializeFirebase(Context context, String configJson) {
        if (firebaseInitialized) {
            Log.d(TAG, "Firebase already initialized");
            return;
        }
        try {
            JSONObject cfg = new JSONObject(configJson);
            FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApiKey(cfg.optString("apiKey"))
                    .setApplicationId(cfg.optString("appId"))
                    .setProjectId(cfg.optString("projectId"))
                    .setGcmSenderId(cfg.optString("messagingSenderId"))
                    .build();
            FirebaseApp.initializeApp(context.getApplicationContext(), options, "nawaqes");
            firebaseInitialized = true;
            Log.i(TAG, "Firebase initialized programmatically");
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize Firebase: " + e.getMessage(), e);
        }
    }

    /**
     * Called when a new FCM token is generated. We persist it and send it to the
     * server, then subscribe to the global topic.
     */
    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "New FCM token: " + (token == null ? "null" : token.substring(0, Math.min(token.length(), 20)) + "..."));
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putString(KEY_TOKEN, token).apply();

        // Subscribe to global topic for broadcast notifications
        FirebaseMessaging.getInstance().subscribeToTopic(TOPIC_ALL)
                .addOnCompleteListener(task -> {
                    if (task.isSuccessful()) {
                        Log.d(TAG, "Subscribed to topic: " + TOPIC_ALL);
                    } else {
                        Log.w(TAG, "Failed to subscribe to topic", task.getException());
                    }
                });

        // Send token to server if user is logged in
        String jwt = prefs.getString(KEY_JWT, null);
        if (jwt != null) {
            sendTokenToServer(token, jwt);
        } else {
            // Will retry when user logs in (AuthBridge calls registerToken)
            Log.d(TAG, "No JWT yet — token will be sent after login");
        }
    }

    /**
     * Called when a push notification is received. We display a system notification
     * regardless of whether the app is in foreground, background, or killed.
     */
    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "Push received from: " + remoteMessage.getFrom());

        // Try data payload first (works on all networks even in Doze mode)
        String title = "نواقص";
        String body = "";
        String type = "default";

        if (remoteMessage.getData() != null && !remoteMessage.getData().isEmpty()) {
            title = remoteMessage.getData().getOrDefault("title", "نواقص");
            body = remoteMessage.getData().getOrDefault("body", "");
            type = remoteMessage.getData().getOrDefault("type", "default");
        } else if (remoteMessage.getNotification() != null) {
            // Fallback to notification payload (only works in foreground)
            if (remoteMessage.getNotification().getTitle() != null) {
                title = remoteMessage.getNotification().getTitle();
            }
            body = remoteMessage.getNotification().getBody() != null
                    ? remoteMessage.getNotification().getBody() : "";
        }

        // Use high-priority channel for messages
        String channelId = "message".equals(type) ? CHANNEL_ID_MESSAGES : CHANNEL_ID_DEFAULT;
        showNotification(this, title, body, type);
    }

    /**
     * Show a system notification. Creates channels on Android 8+.
     */
    private static void showNotification(Context context, String title, String body, String type) {
        createNotificationChannels(context);
        String channelId = "message".equals(type) ? CHANNEL_ID_MESSAGES : CHANNEL_ID_DEFAULT;

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, launchIntent, flags);

        int priority = "message".equals(type)
                ? NotificationCompat.PRIORITY_HIGH
                : NotificationCompat.PRIORITY_DEFAULT;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(priority)
                .setContentIntent(pendingIntent);

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            // Use type hashCode as notification ID so different notifications don't overwrite each other
            int notifId = (title + body).hashCode();
            nm.notify(notifId, builder.build());
        }
    }

    /**
     * Create notification channels (required on Android 8+).
     */
    private static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Default channel
        if (nm.getNotificationChannel(CHANNEL_ID_DEFAULT) == null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID_DEFAULT,
                    context.getString(R.string.channel_default),
                    NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Nawaqes general notifications");
            nm.createNotificationChannel(channel);
        }

        // Messages channel (high priority)
        if (nm.getNotificationChannel(CHANNEL_ID_MESSAGES) == null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID_MESSAGES,
                    context.getString(R.string.channel_messages),
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("New chat messages");
            channel.enableVibration(true);
            channel.setShowBadge(true);
            nm.createNotificationChannel(channel);
        }
    }

    /**
     * Register FCM token for the current user. Called from AuthBridge after login.
     * Spawns a WorkManager job so the network call happens off the main thread.
     */
    public static void registerToken(final Context context, final String jwt, final String fbConfigJson) {
        // Persist JWT for later use (onNewToken might fire before login)
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putString(KEY_JWT, jwt).putString(KEY_CONFIG, fbConfigJson).apply();

        // Initialize Firebase if not done
        if (fbConfigJson != null && !fbConfigJson.isEmpty()) {
            initializeFirebase(context, fbConfigJson);
        }

        // Schedule a one-time worker to fetch the FCM token + send to server
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(RegisterTokenWorker.class)
                .build();
        WorkManager.getInstance(context).enqueue(work);
    }

    /**
     * Worker that fetches the FCM token and posts it to the server.
     */
    public static class RegisterTokenWorker extends Worker {
        public RegisterTokenWorker(Context context, WorkerParameters params) {
            super(context, params);
        }

        @Override
        public Result doWork() {
            try {
                SharedPreferences prefs = getApplicationContext()
                        .getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                String jwt = prefs.getString(KEY_JWT, null);
                if (jwt == null) {
                    Log.w(TAG, "No JWT — cannot register token");
                    return Result.success();
                }

                // Force initialize Firebase if needed
                String cfg = prefs.getString(KEY_CONFIG, null);
                if (cfg != null && !firebaseInitialized) {
                    initializeFirebase(getApplicationContext(), cfg);
                }

                // Get FCM token (this triggers onNewToken the first time)
                FirebaseMessaging fm = FirebaseMessaging.getInstance();
                String token = fm.getToken().getResult();
                Log.d(TAG, "Got FCM token: " + (token == null ? "null" : token.substring(0, Math.min(token.length(), 20)) + "..."));
                prefs.edit().putString(KEY_TOKEN, token).apply();

                // Subscribe to global topic
                fm.subscribeToTopic(TOPIC_ALL);

                // Send token to server
                sendTokenToServer(token, jwt);
                return Result.success();
            } catch (Exception e) {
                Log.e(TAG, "Token registration failed: " + e.getMessage(), e);
                return Result.retry();
            }
        }
    }

    /**
     * POST the FCM token to the server's register-device endpoint.
     */
    private static void sendTokenToServer(String token, String jwt) {
        new Thread(() -> {
            try {
                String serverUrl = "https://safwatkhokha-nawaqes.hf.space/api/notifications/register-device";
                java.net.URL url = new java.net.URL(serverUrl);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + jwt);
                conn.setDoOutput(true);

                String payload = "{\"token\":\"" + token + "\",\"platform\":\"android\"}";
                try (java.io.OutputStream os = conn.getOutputStream()) {
                    os.write(payload.getBytes("UTF-8"));
                }

                int code = conn.getResponseCode();
                Log.d(TAG, "register-device response: " + code);
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Failed to send token to server: " + e.getMessage(), e);
            }
        }).start();
    }
}
