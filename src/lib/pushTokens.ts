import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { fetchOwnPushToken, upsertExpoPushToken } from '../api/pushTokens';
import type { PushRegistrationState, PushRegistrationStatus } from '../types/pushRegistration';
import { PUSH_REGISTRATION_IDLE } from '../types/pushRegistration';
import { getEasProjectId } from './easProjectId';
import { supabase } from './supabase';
import { ensureSparksNotificationChannels } from './sparkNotifications';

export type PushRegistrationResult = PushRegistrationState;

const RETRY_DELAYS_MS = [0, 3000, 10000, 30000];

let activeUserId: string | null = null;
let retryTimers: ReturnType<typeof setTimeout>[] = [];
let lastState: PushRegistrationState = PUSH_REGISTRATION_IDLE;
const listeners = new Set<(s: PushRegistrationState) => void>();

function setState(next: PushRegistrationState) {
  lastState = next;
  listeners.forEach((fn) => fn(next));
}

export function subscribePushRegistration(
  listener: (s: PushRegistrationState) => void
): () => void {
  listener(lastState);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPushRegistrationState(): PushRegistrationState {
  return lastState;
}

function statusMessage(status: PushRegistrationStatus, detail?: string): string {
  switch (status) {
    case 'saved':
      return 'Push alerts are enabled for this device.';
    case 'permission_denied':
      return 'Allow notifications in Settings so your partner can buzz you when the app is closed.';
    case 'not_device':
      return 'Push tokens only work on a real phone, not an emulator.';
    case 'no_project_id':
      return 'App is missing EAS projectId — rebuild with app.json extra.eas.projectId.';
    case 'no_session':
      return 'Sign in again, then reopen the app to register push.';
    case 'token_failed':
      return (
        detail ??
        'Could not get Expo push token. On Android preview builds, add FCM in expo.dev → Project → Credentials → Android, then rebuild the APK.'
      );
    case 'save_failed':
      return detail ?? 'Could not save push token to Supabase (check RLS on user_push_tokens).';
    case 'verify_failed':
      return 'Token saved but could not be read back — check Supabase policies.';
    default:
      return detail ?? '';
  }
}

async function waitForAuthSession(maxMs = 8000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function formatTokenError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/firebase|fcm|google-services|Default FirebaseApp/i.test(msg)) {
    const projectId = getEasProjectId();
    const projectHint = projectId ? ` (project ${projectId})` : '';
    return `Android FCM not configured: ${msg}. Upload FCM V1 credentials at expo.dev${projectHint}, then run npm run eas:preview:android and reinstall.`;
  }
  if (/projectId|project.?id/i.test(msg)) {
    return `Missing or invalid EAS projectId: ${msg}`;
  }
  return msg;
}

async function ensureNotificationPermission(): Promise<'granted' | 'denied'> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return 'granted';

  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
    android: {},
  });
  return req.status === 'granted' ? 'granted' : 'denied';
}

/**
 * Registers this device for remote Expo push and upserts into user_push_tokens.
 */
export async function registerForRemotePush(userId: string): Promise<PushRegistrationResult> {
  setState({ status: 'registering', message: null, tokenPrefix: null });

  if (!Device.isDevice) {
    const s: PushRegistrationResult = {
      status: 'not_device',
      message: statusMessage('not_device'),
      tokenPrefix: null,
    };
    setState(s);
    if (__DEV__) console.log('[push]', s.message);
    return s;
  }

  await ensureSparksNotificationChannels();

  const permission = await ensureNotificationPermission();
  if (permission !== 'granted') {
    const s: PushRegistrationResult = {
      status: 'permission_denied',
      message: statusMessage('permission_denied'),
      tokenPrefix: null,
    };
    setState(s);
    console.warn('[push]', s.message);
    return s;
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    const s: PushRegistrationResult = {
      status: 'no_project_id',
      message: statusMessage('no_project_id'),
      tokenPrefix: null,
    };
    setState(s);
    console.warn('[push]', s.message);
    return s;
  }

  const hasSession = await waitForAuthSession();
  if (!hasSession) {
    const s: PushRegistrationResult = {
      status: 'no_session',
      message: statusMessage('no_session'),
      tokenPrefix: null,
    };
    setState(s);
    console.warn('[push]', s.message);
    return s;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user?.id !== userId) {
    const s: PushRegistrationResult = {
      status: 'no_session',
      message: statusMessage('no_session'),
      tokenPrefix: null,
    };
    setState(s);
    console.warn('[push] auth user mismatch');
    return s;
  }

  let token: string;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    token = tokenData.data;
  } catch (e) {
    const detail = formatTokenError(e);
    const s: PushRegistrationResult = {
      status: 'token_failed',
      message: statusMessage('token_failed', detail),
      tokenPrefix: null,
    };
    setState(s);
    console.warn('[push] getExpoPushTokenAsync failed:', detail);
    return s;
  }

  const ok = await upsertExpoPushToken(userId, token);
  if (!ok) {
    const s: PushRegistrationResult = {
      status: 'save_failed',
      message: statusMessage('save_failed'),
      tokenPrefix: token.slice(0, 24),
    };
    setState(s);
    console.warn('[push] upsert failed for', userId);
    return s;
  }

  const verified = await fetchOwnPushToken(userId);
  if (!verified || verified !== token) {
    const s: PushRegistrationResult = {
      status: 'verify_failed',
      message: statusMessage('verify_failed'),
      tokenPrefix: token.slice(0, 24),
    };
    setState(s);
    console.warn('[push] verify read-back failed');
    return s;
  }

  const prefix = token.slice(0, 28) + '…';
  const s: PushRegistrationResult = {
    status: 'saved',
    message: statusMessage('saved'),
    tokenPrefix: prefix,
  };
  setState(s);
  console.log('[push] token saved to Supabase', prefix, Platform.OS);
  return s;
}

/** Schedule retries until saved or attempts exhausted. Safe to call on resume. */
export function startPushRegistration(userId: string): void {
  if (lastState.status === 'saved' && activeUserId === userId) return;
  if (activeUserId === userId && retryTimers.length > 0) return;
  stopPushRegistration();
  activeUserId = userId;

  RETRY_DELAYS_MS.forEach((delay, index) => {
    const t = setTimeout(() => {
      void (async () => {
        const result = await registerForRemotePush(userId);
        if (result.status === 'saved') {
          stopPushRegistration();
          return;
        }
        if (index === RETRY_DELAYS_MS.length - 1) {
          console.warn('[push] registration gave up:', result.status, result.message);
        }
      })();
    }, delay);
    retryTimers.push(t);
  });
}

export function stopPushRegistration(): void {
  retryTimers.forEach(clearTimeout);
  retryTimers = [];
  activeUserId = null;
  setState(PUSH_REGISTRATION_IDLE);
}
