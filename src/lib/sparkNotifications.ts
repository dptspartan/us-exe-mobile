import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { sparkNotificationSound } from '../constants/sparkSounds';
import type { SparkType } from '../types/sparks';
import { SPARK_DEEP_LINK_SCREEN } from '../types/sparks';
import { initNotificationBehavior, isStickyNoteNotification } from './notifications';

export const BUZZ_CHANNEL = 'spark-buzz';
export const SPARKS_CHANNEL = 'partner-sparks';

let channelsReady = false;

export async function ensureSparksNotificationChannels() {
  await initNotificationBehavior();
  if (Platform.OS !== 'android') {
    channelsReady = true;
    return;
  }

  await Notifications.deleteNotificationChannelAsync(BUZZ_CHANNEL).catch(() => {});
  await Notifications.deleteNotificationChannelAsync(SPARKS_CHANNEL).catch(() => {});

  await Notifications.setNotificationChannelAsync(BUZZ_CHANNEL, {
    name: 'Buzz',
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: false,
    lightColor: '#818cf8',
  });

  await Notifications.setNotificationChannelAsync(SPARKS_CHANNEL, {
    name: 'Our Sparks',
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: false,
    lightColor: '#f472b6',
  });

  channelsReady = true;
}

export function sparkNotificationCopy(
  type: SparkType,
  partnerName: string
): { title: string; body: string } {
  switch (type) {
    case 'buzz':
      return { title: partnerName, body: 'I miss you 💫' };
    case 'love_you':
      return { title: partnerName, body: 'I love you! 💕' };
    case 'need_hugs':
      return { title: `${partnerName} needs a hug`, body: 'Open Us.exe — they are waiting' };
    case 'hug_returned':
      return { title: partnerName, body: 'Sent you a hug back 🫂' };
    default:
      return { title: partnerName, body: 'Open Us.exe' };
  }
}

export async function notifySparkReceived(type: SparkType, partnerName: string) {
  await ensureSparksNotificationChannels();

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    if (req.status !== 'granted') return false;
  }

  const { title, body } = sparkNotificationCopy(type, partnerName);
  const channelId = type === 'buzz' ? BUZZ_CHANNEL : SPARKS_CHANNEL;
  const sound = sparkNotificationSound(type);

  const content = {
    title,
    body,
    sound,
    data: { screen: SPARK_DEEP_LINK_SCREEN, sparkType: type },
    ...(Platform.OS === 'android' ? { android: { channelId } } : {}),
  };

  try {
    await Notifications.scheduleNotificationAsync({ content, trigger: null });
  } catch {
    await Notifications.scheduleNotificationAsync({
      content: { ...content, sound: 'default' },
      trigger: null,
    });
  }
  return true;
}

/** Suppress in-app banners when app is open (handled by SparksContext). */
export function configureSparkNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as {
        sparkType?: SparkType;
        screen?: string;
      };
      const isSpark = data?.screen === SPARK_DEEP_LINK_SCREEN;
      const isStickyNote = isStickyNoteNotification(data);
      const active = AppState.currentState === 'active';

      if ((isSpark || isStickyNote) && active) {
        return {
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }

      if (isSpark) {
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        };
      }

      if (isStickyNote) {
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        };
      }

      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    },
  });
}

export function parseSparkNotificationData(
  data: unknown
): { sparkType?: SparkType; screen?: string; sparkId?: string } | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { screen?: string; sparkType?: SparkType; sparkId?: string };
  if (d.screen !== SPARK_DEEP_LINK_SCREEN) return null;
  return d;
}
