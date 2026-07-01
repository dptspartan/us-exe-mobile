import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { networkUtility } from '../api/network';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';

// Shown whenever the app has an authenticated session for someone who
// hasn't finished onboarding yet (i.e. they arrived via an invite deep link
// and have no password set, or the app was relaunched mid-flow). Reachable
// purely by deriving "authenticated but not yet paired" — no extra
// client-side flag needs to survive an app restart.
export function SetPasswordScreen() {
  const { refreshCoupleProfile } = useApp();
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const name = (data.user?.user_metadata as { display_name?: string } | undefined)?.display_name;
      if (name) setDisplayName(name);
    });
  }, []);

  const canSubmit = password.length >= 8 && password === confirmPassword && !busy;

  async function submit() {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await networkUtility.setNewPassword(password);
      await networkUtility.finishAccountSetup();
      await refreshCoupleProfile();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'invite_not_found') {
        setError('We could not find an invite for this account. Contact support if this keeps happening.');
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOutAndRetry() {
    await networkUtility.signOut();
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.brand}>Us.exe</Text>
        <Text style={styles.hint}>{displayName ? `Welcome, ${displayName}!` : 'Welcome!'} Set a password to finish.</Text>

        <Text style={styles.lab}>New password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="At least 8 characters"
          placeholderTextColor="#52525b"
          style={styles.input}
        />

        <Text style={styles.lab}>Confirm password</Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholder="••••••••"
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
          {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.btnTxt}>Finish setup</Text>}
        </Pressable>

        <Pressable onPress={signOutAndRetry} style={styles.linkBtn} disabled={busy}>
          <Text style={styles.linkTxt}>Wrong account? Sign out</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
  hint: { marginTop: 6, fontSize: 12, color: '#a1a1aa', textAlign: 'center', marginBottom: 22 },
  lab: { fontSize: 10, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', color: '#a1a1aa' },
  input: {
    marginTop: 8,
    marginBottom: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0a0a0c',
    color: '#f4f4f5',
    fontSize: 15,
  },
  err: { color: '#fca5a5', fontSize: 12, textAlign: 'center', marginBottom: 10 },
  btn: {
    marginTop: 8,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#e4e4e7',
  },
  btnTxt: { fontWeight: '900', fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', color: '#0a0a0c' },
  linkBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  linkTxt: { color: '#a1a1aa', fontSize: 12, fontWeight: '700' },
});
