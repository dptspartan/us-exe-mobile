import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { networkUtility } from '../api/network';

// Note: uses React Native's built-in `Linking` module rather than the
// `expo-linking` package — for a single custom URL scheme with no universal
// links, `Linking.getInitialURL()` / `addEventListener('url', ...)` already
// do everything we need, with zero new dependencies. The app's `scheme`
// (`usexe` / `usexe-dev`, see app.config.js) is what actually registers the
// OS-level URL handler; expo-linking would only add convenience helpers
// (like `Linking.createURL()`) that this flow doesn't use.

export type InviteLinkStatus = 'idle' | 'verifying' | 'error';

export type InviteLinkState = {
  status: InviteLinkStatus;
  error: string | null;
  dismiss: () => void;
};

function parseInviteUrl(url: string): { tokenHash: string; email: string; type: 'invite' | 'magiclink' } | null {
  try {
    const parsed = new URL(url);
    const looksLikeInvite = parsed.host === 'invite-callback' || parsed.pathname.includes('invite-callback');
    if (!looksLikeInvite) return null;

    const tokenHash = parsed.searchParams.get('token_hash');
    const type = parsed.searchParams.get('type');
    const email = parsed.searchParams.get('email');
    if (!tokenHash || !email || (type !== 'invite' && type !== 'magiclink')) return null;

    return { tokenHash, email, type };
  } catch {
    return null;
  }
}

export function useInviteDeepLink(): InviteLinkState {
  const [status, setStatus] = useState<InviteLinkStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    async function handleUrl(url: string | null) {
      if (!url) return;
      const parsed = parseInviteUrl(url);
      if (!parsed) return;

      const dedupeKey = `${parsed.email}:${parsed.tokenHash}`;
      if (handledRef.current.has(dedupeKey)) return;
      handledRef.current.add(dedupeKey);

      if (!mounted) return;
      setStatus('verifying');
      setError(null);
      try {
        await networkUtility.verifyInviteToken({
          email: parsed.email,
          tokenHash: parsed.tokenHash,
          type: parsed.type,
        });
        if (mounted) setStatus('idle');
        // AppContext's onAuthStateChange listener picks up the new session
        // from here; App.tsx's Shell naturally routes to SetPasswordScreen.
      } catch (e: unknown) {
        handledRef.current.delete(dedupeKey);
        if (mounted) {
          setStatus('error');
          setError(e instanceof Error ? e.message : 'This invite link is invalid or has expired.');
        }
      }
    }

    void Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => void handleUrl(url));

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return {
    status,
    error,
    dismiss: () => {
      setStatus('idle');
      setError(null);
    },
  };
}
