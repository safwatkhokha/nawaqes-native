package com.nawaqes.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class NawaqesFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "NawaqesFCM";
    private static int notifId = 1000;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Log.d(TAG, "From: " + remoteMessage.getFrom());

        String title = "نواقص";
        String body = "";
        String url = "/";
        String channelId = "nawaqes_default";

        if (remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle() != null
                ? remoteMessage.getNotification().getTitle() : title;
            body = remoteMessage.getNotification().getBody() != null
                ? remoteMessage.getNotification().getBody() : body;
        }

        if (remoteMessage.getData().containsKey("title")) title = remoteMessage.getData().get("title");
        if (remoteMessage.getData().containsKey("body")) body = remoteMessage.getData().get("body");
        if (remoteMessage.getData().containsKey("url")) url = remoteMessage.getData().get("url");
        if (remoteMessage.getData().containsKey("channel")) channelId = remoteMessage.getData().get("channel");

        showNotification(title, body, url, channelId);
    }

    private void showNotification(String title, String body, String url, String channelId) {
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.setData(Uri.parse(url));

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent, flags);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
                .setVibrate(new long[]{0, 200, 100, 200})
                .setContentIntent(pendingIntent)
                .setColor(getResources().getColor(R.color.colorPrimary))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body));

            NotificationManagerCompat.from(this).notify(notifId++, builder.build());
        } catch (Exception e) {
            Log.e(TAG, "showNotification failed", e);
        }
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "Refreshed FCM token: " + token);
        getSharedPreferences("nawaqes", MODE_PRIVATE)
            .edit().putString("fcm_token", token).apply();
    }
}
