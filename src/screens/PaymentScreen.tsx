import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { networkUtility } from '../api/network';

type Props = {
  coupleId: string;
  checkoutToken: string;
  ownerName: string;
  partnerName: string;
  shipName: string;
  onPaid: () => void;
  onBack: () => void;
};

// Dummy checkout — styled like a real one so swapping in a Stripe payment
// sheet later is a drop-in UI replacement. The backend fully owns the
// "did this succeed" decision either way.
export function PaymentScreen({ coupleId, checkoutToken, ownerName, partnerName, shipName, onPaid, onBack }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay(simulate: 'success' | 'failure') {
    setError('');
    setBusy(true);
    try {
      const result = await networkUtility.completeDummyPayment({ coupleId, checkoutToken, simulate });
      if (result?.ok) {
        onPaid();
      } else {
        setError('Payment failed. Try again below.');
      }
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'checkout_expired') {
        setError('This checkout session expired. Please start onboarding again.');
      } else if (code === 'already_processed') {
        onPaid();
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.brand}>Us.exe</Text>
        <Text style={styles.hint}>
          {shipName ? `${shipName} — ` : ''}
          {ownerName} & {partnerName}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Us.exe Membership</Text>
          <Text style={styles.price}>$0.00 / mo</Text>
        </View>
        <Text style={styles.note}>
          Dummy checkout for development. No real card is charged — the backend fully controls activation and can be
          swapped for Stripe without changing this screen.
        </Text>

        {error ? <Text style={styles.err}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          style={[styles.btn, busy && { opacity: 0.6 }]}
          disabled={busy}
          onPress={() => void pay('success')}
        >
          {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.btnTxt}>Pay & continue</Text>}
        </Pressable>

        {__DEV__ ? (
          <Pressable
            accessibilityRole="button"
            style={[styles.devBtn, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={() => void pay('failure')}
          >
            <Text style={styles.devBtnTxt}>Dev: simulate failed payment</Text>
          </Pressable>
        ) : null}

        <Pressable onPress={onBack} style={styles.linkBtn} disabled={busy}>
          <Text style={styles.linkTxt}>Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#0f0f11' },
  card: {
    borderRadius: 20,
    padding: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(24,24,28,0.75)',
  },
  brand: { fontSize: 28, fontWeight: '900', letterSpacing: 8, color: '#fafafa', textAlign: 'center' },
  hint: { marginTop: 6, fontSize: 12, color: '#a1a1aa', textAlign: 'center', marginBottom: 20 },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0a0a0c',
  },
  priceLabel: { color: '#f4f4f5', fontSize: 14, fontWeight: '700' },
  price: { color: '#ec4899', fontSize: 16, fontWeight: '900' },
  note: { marginTop: 14, fontSize: 11, lineHeight: 17, color: '#71717a', textAlign: 'center' },
  err: { color: '#fca5a5', fontSize: 12, textAlign: 'center', marginTop: 14 },
  btn: {
    marginTop: 22,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#e4e4e7',
  },
  btnTxt: { fontWeight: '900', fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', color: '#0a0a0c' },
  devBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  devBtnTxt: { color: '#fca5a5', fontSize: 11, fontWeight: '700' },
  linkBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  linkTxt: { color: '#a1a1aa', fontSize: 12, fontWeight: '700' },
});
