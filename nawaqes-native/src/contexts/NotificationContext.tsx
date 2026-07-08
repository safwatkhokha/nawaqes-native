// ─── Notifications Context (Resilient) ──────────────────────────────
// All notification setup wrapped in try/catch — never crashes the app.

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api, getStoredToken } from '../services/api';

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
}

const NotificationContext = createContext<NotificationContextType>({
  expoPushToken: null,
  notification: null,
});

// Safe notification handler
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (e) {
  console.warn('[NOTIF] setNotificationHandler failed:', e);
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    try {
      registerForPushNotifications()
        .then(token => { if (token) setExpoPushToken(token); })
        .catch(e => console.warn('[NOTIF] register failed:', e));

      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        setNotification(notification);
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('[NOTIF] Tapped:', response.notification.request.content.data);
      });
    } catch (e) {
      console.warn('[NOTIF] useEffect failed:', e);
    }

    return () => {
      try {
        if (notificationListener.current) Notifications.removeNotificationSubscription(notificationListener.current);
        if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
      } catch (e) {}
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ expoPushToken, notification }}>
      {children}
    </NotificationContext.Provider>
  );
};

async function registerForPushNotifications(): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: 'nawaqes-native' });
    const token = tokenData.data;

    try {
      const jwt = await getStoredToken();
      if (jwt) {
        await api.client.post('/notifications/register-device', { token, platform: Platform.OS });
      }
    } catch (e) {}

    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'نواقص',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#f97316',
          sound: 'default',
        });
      } catch (e) {}
    }

    return token;
  } catch (e) {
    console.warn('[NOTIF] Registration failed:', e);
    return null;
  }
}

export const useNotifications = () => useContext(NotificationContext);
