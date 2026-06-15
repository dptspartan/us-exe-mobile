import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const STICKY_NOTE_SCREEN = 'notes';
export const PARTNER_NOTES_CHANNEL = 'partner-notes';

let initialized = false;

export function stickyNoteNotificationCopy(partnerName: string) {
  const name = partnerName.trim() || 'Your partner';
  return { title: `${name} left a note for you` };
}

export async function initNotificationBehavior() {
  if (initialized) return;
  initialized = true;

  await Notifications.setNotificationChannelAsync(PARTNER_NOTES_CHANNEL, {
    name: 'Partner notes',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 280, 120, 280],
    lightColor: '#ec4899',
  });
}

/** Local fallback when the app is backgrounded and remote push is unavailable. */
export async function notifyPartnerStickyNote(partnerName: string) {
  if (AppState.currentState === 'active') return;

  await initNotificationBehavior();
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    if (req.status !== 'granted') return;
  }

  const { title } = stickyNoteNotificationCopy(partnerName);

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      sound: 'default',
      data: { screen: STICKY_NOTE_SCREEN, type: 'sticky_note' },
      ...(Platform.OS === 'android' ? { android: { channelId: PARTNER_NOTES_CHANNEL } } : {}),
    },
    trigger: null,
  });
}

export function isStickyNoteNotification(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as { screen?: string; type?: string };
  return d.screen === STICKY_NOTE_SCREEN || d.type === 'sticky_note';
}
