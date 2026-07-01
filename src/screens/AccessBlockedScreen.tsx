import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { networkUtility } from '../api/network';
import { useApp } from '../context/AppContext';

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  canceled: {
    title: 'Access paused',
    body: "Your subscription lapsed and the grace period has ended. Both of you lose access until it's fixed.",
  },
  incomplete: {
    title: 'Finish setting up billing',
    body: 'Your last payment attempt did not go through. Try again to unlock the Dashboard for both of you.',
  },
  past_due: {
    title: 'Payment past due',
    body: 'Your grace period has ended. Both of you lose access until this is fixed.',
  },
};

// Full-screen block for both partners whenever get_my_access_status()
// reports access_allowed = false (subscription is couple-level, not
// per-user). Reactivation here calls the same shared dummy-provider state
// transition a real Stripe retry-payment webhook would call later.
export function AccessBlockedScreen() {
  const { accessStatus, refreshAccessStatus } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const copy = STATUS_COPY[accessStatus?.subscription_status ?? ''] ?? STATUS_COPY.canceled;

  async function reactivate() {
    setError('');
    setBusy(true);
    try {
      await networkUtility.reactivateSubscription();
      await refreshAccessStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not reactivate. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await networkUtility.signOut();
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🔒</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>

        {error ? <Text style={styles.err}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          style={[styles.btn, busy && { opacity: 0.6 }]}
          disabled={busy}
          onPress={reactivate}
        >
          {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.btnTxt}>Reactivate (dummy payment)</Text>}
        </Pressable>

        <Pressable onPress={signOut} style={styles.linkBtn} disabled={busy}>
          <Text style={styles.linkTxt}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#0f0f11' },
  card: {
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248,113,113,0.25)',
    backgroundColor: 'rgba(24,24,28,0.75)',
  },
  emoji: { fontSize: 40, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '900', color: '#fafafa', textAlign: 'center' },
  body: { marginTop: 12, fontSize: 14, lineHeight: 21, color: '#d4d4d8', textAlign: 'center' },
  err: { color: '#fca5a5', fontSize: 12, textAlign: 'center', marginTop: 14 },
  btn: {
    marginTop: 24,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#e4e4e7',
  },
  btnTxt: { fontWeight: '900', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: '#0a0a0c' },
  linkBtn: { marginTop: 18, paddingVertical: 8 },
  linkTxt: { color: '#71717a', fontSize: 12, fontWeight: '700' },
});
