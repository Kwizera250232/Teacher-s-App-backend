import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerPushToken } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const ANDROID_CHANNELS = [
  { id: 'default', name: 'General', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'homework', name: 'Homework', importance: Notifications.AndroidImportance.HIGH },
  { id: 'class_moments', name: 'Class moments', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'school', name: 'School announcements', importance: Notifications.AndroidImportance.HIGH },
];

export async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  for (const ch of ANDROID_CHANNELS) {
    await Notifications.setNotificationChannelAsync(ch.id, {
      name: ch.name,
      importance: ch.importance,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#075e54',
    });
  }
}

export async function requestPushPermissions() {
  if (!Device.isDevice) {
    return { ok: false, reason: 'Push notifications need a physical phone (not an emulator).' };
  }
  await ensureAndroidChannels();
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== 'granted') {
    return { ok: false, reason: 'Notification permission was denied. Enable it in Settings to get homework alerts.' };
  }
  return { ok: true };
}

export async function getExpoPushToken() {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error('EAS projectId missing in app.config.js');
  }
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

/** Register device token with UClass API (call after login). */
export async function syncPushTokenWithServer(authToken) {
  const perm = await requestPushPermissions();
  if (!perm.ok) return perm;
  const expoToken = await getExpoPushToken();
  await registerPushToken(authToken, expoToken, Platform.OS);
  return { ok: true, expoToken };
}
