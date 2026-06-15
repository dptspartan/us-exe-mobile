import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { SPARK_DEEP_LINK_SCREEN } from '../types/sparks';
import { isStickyNoteNotification } from '../lib/notifications';
import type { SessionId } from '../components/sessionTiles';

function isSparksNotification(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  return (data as { screen?: string }).screen === SPARK_DEEP_LINK_SCREEN;
}

function sessionFromNotification(data: unknown): SessionId | null {
  if (isSparksNotification(data)) return 'sparks';
  if (isStickyNoteNotification(data)) return 'notes';
  return null;
}

/** Opens the right session when the user taps a push notification. */
export function usePushDeepLink(onNavigate: (session: SessionId) => void) {
  useEffect(() => {
    const openFromResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const session = sessionFromNotification(response.notification.request.content.data);
      if (session) onNavigate(session);
    };

    void Notifications.getLastNotificationResponseAsync().then(openFromResponse);

    const sub = Notifications.addNotificationResponseReceivedListener(openFromResponse);
    return () => sub.remove();
  }, [onNavigate]);
}
