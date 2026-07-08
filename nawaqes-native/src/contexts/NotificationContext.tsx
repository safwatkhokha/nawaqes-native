// ─── Notifications Context ──────────────────────────────────────────
// Sets up expo-notifications + registers device for FCM push notifications.

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import { api, getStoredToken } from '../services/api';

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
}

const NotificationContext = createContext<NotificationContextType>({
  expoPushToken: null,
  notification: null,
});

// ─── Notification handler (how to display incoming notifications) ────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    registerForPushNotifications().then(token => {
      if (token) setExpoPushToken(token);
    });

    // Listen for incoming notifications while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    // Listen for user tapping on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      // Handle notification tap (navigate to relevant screen)
      console.log('[NOTIF] Tapped:', data);
    });

    return () => {
      if (notificationListener.current) Notifications.removeNotificationSubscription(notificationListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ expoPushToken, notification }}>
      {children}
    </NotificationContext.Provider>
  );
};

// ─── Register for push notifications ────────────────────────────────
async function registerForPushNotifications(): Promise<string | null> {
  try {
    // 1. Check permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[NOTIF] Permission not granted');
      return null;
    }

    // 2. Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'nawaqes-native',
    });
    const token = tokenData.data;
    console.log('[NOTIF] Push token:', token);

    // 3. Register token with backend (so server can send pushes to this device)
    try {
      const jwt = await getStoredToken();
      if (jwt) {
        await api.client.post('/notifications/register-device', {
          token,
          platform: Platform.OS,
        });
      }
    } catch (e) {
      // Non-fatal: device not registered for push, but app still works
    }

    // 4. Set up Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'نواقص',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#f97316',
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'الرسائل',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10b981',
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('live', {
        name: 'البث المباشر',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#ef4444',
        sound: 'default',
      });
    }

    return token;
  } catch (e) {
    console.error('[NOTIF] Registration failed:', e);
    return null;
  }
}

export const useNotifications = () => useContext(NotificationContext);
