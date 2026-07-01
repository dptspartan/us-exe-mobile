import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { networkUtility } from '../api/network';

type Props = {
  onStarted: (result: {
    coupleId: string;
    checkoutToken: string;
    ownerName: string;
    partnerName: string;
    shipName: string;
  }) => void;
  onBackToLogin: () => void;
};

const FIELD_ERRORS: Record<string, string> = {
  invalid_email: 'Please check both email addresses.',
  missing_name: 'Both names are required.',
  emails_must_differ: 'You and your partner need different email addresses.',
  onboarding_disabled: 'New onboarding is temporarily closed. Check back soon.',
  rate_limited: 'Too many attempts — please wait a few minutes and try again.',
};

export function OnboardingStartScreen({ onStarted, onBackToLogin }: Props) {
  const [checkingEnabled, setCheckingEnabled] = useState(true);
  const [enabled, setEnabled] = useState(true);

  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [shipName, setShipName] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void networkUtility.isOnboardingEnabled().then((value: boolean) => {
      if (mounted) {
        setEnabled(value);
        setCheckingEnabled(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const canSubmit =
    ownerName.trim() && ownerEmail.trim() && partnerName.trim() && partnerEmail.trim() && !busy;

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const result = await networkUtility.startOnboarding({
        ownerEmail: ownerEmail.trim(),
        ownerName: ownerName.trim(),
        partnerEmail: partnerEmail.trim(),
        partnerName: partnerName.trim(),
        shipName: shipName.trim() || undefined,
      });
      onStarted({
        coupleId: result.couple_id,
        checkoutToken: result.checkout_token,
        ownerName: ownerName.trim(),
        partnerName: partnerName.trim(),
        shipName: shipName.trim(),
      });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      const role = (e as { details?: { role?: string } })?.details?.role;
      if (code === 'email_already_registered') {
        setError(
          role === 'partner_1'
            ? 'Your email is already registered — try logging in instead.'
            : "Your partner's email is already registered to another account.",
        );
      } else if (code && FIELD_ERRORS[code]) {
        setError(FIELD_ERRORS[code]);
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (checkingEnabled) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }

  if (!enabled) {
    return (
      <View style={[styles.center, { paddingHorizontal: 28 }]}>
        <Text style={styles.brand}>Us.exe</Text>
        <Text style={styles.hint}>New onboarding is temporarily closed. Check back soon.</Text>
        <Pressable onPress={onBackToLogin} style={styles.linkBtn}>
          <Text style={styles.linkTxt}>Back to login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.brand}>Us.exe</Text>
          <Text style={styles.hint}>Onboard yourself and your partner</Text>

          <Text style={styles.section}>You</Text>
          <Text style={styles.lab}>Your name</Text>
          <TextInput
            value={ownerName}
            onChangeText={setOwnerName}
            placeholder="Alex"
            placeholderTextColor="#52525b"
            style={styles.input}
          />
          <Text style={styles.lab}>Your email</Text>
          <TextInput
            value={ownerEmail}
            onChangeText={setOwnerEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@email.com"
            placeholderTextColor="#52525b"
            style={styles.input}
          />

          <Text style={styles.section}>Your partner</Text>
          <Text style={styles.lab}>Their name</Text>
          <TextInput
            value={partnerName}
            onChangeText={setPartnerName}
            placeholder="Sam"
            placeholderTextColor="#52525b"
            style={styles.input}
          />
          <Text style={styles.lab}>Their email</Text>
          <TextInput
            value={partnerEmail}
            onChangeText={setPartnerEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="partner@email.com"
            placeholderTextColor="#52525b"
            style={styles.input}
          />

          <Text style={styles.section}>Optional</Text>
          <Text style={styles.lab}>Ship name (couple nickname)</Text>
          <TextInput
            value={shipName}
            onChangeText={setShipName}
            placeholder="Alexam"
            placeholderTextColor="#52525b"
            style={styles.input}
          />

          {error ? <Text style={styles.err}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            style={[styles.btn, !canSubmit && { opacity: 0.45 }]}
            disabled={!canSubmit}
            onPress={submit}
          >
            {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.btnTxt}>Continue to payment</Text>}
          </Pressable>

          <Pressable onPress={onBackToLogin} style={styles.linkBtn}>
            <Text style={styles.linkTxt}>Already onboarded? Log in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f11' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f11' },
  card: {
    borderRadius: 20,
    padding: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(24,24,28,0.75)',
  },
  brand: { fontSize: 28, fontWeight: '900', letterSpacing: 8, color: '#fafafa', textAlign: 'center' },
  hint: { marginTop: 6, fontSize: 11, color: '#71717a', textAlign: 'center', marginBottom: 18 },
  section: {
    marginTop: 16,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#ec4899',
  },
  lab: { fontSize: 10, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', color: '#a1a1aa' },
  input: {
    marginTop: 8,
    marginBottom: 10,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0a0a0c',
    color: '#f4f4f5',
    fontSize: 15,
  },
  err: { color: '#fca5a5', fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 4 },
  btn: {
    marginTop: 18,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#e4e4e7',
  },
  btnTxt: { fontWeight: '900', fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', color: '#0a0a0c' },
  linkBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  linkTxt: { color: '#a1a1aa', fontSize: 12, fontWeight: '700' },
});
