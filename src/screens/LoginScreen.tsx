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
import { useApp } from '../context/AppContext';

export function LoginScreen() {
  const { isAuthenticated, isPaired, loading } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated && !isPaired) {
      setError('Your account is logged in, but no couple row is paired yet (Supabase `couples`).');
    } else {
      setError('');
    }
  }, [loading, isAuthenticated, isPaired]);

  async function login() {
    setError('');
    setBusy(true);
    try {
      await networkUtility.signIn(email, password);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Access denied.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>Us.exe</Text>
        <Text style={styles.hint}>Secure session · same Supabase as web</Text>

        <Text style={styles.lab}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@email.com"
          placeholderTextColor="#52525b"
          style={styles.input}
        />

        <Text style={styles.lab}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#52525b"
          style={styles.input}
        />

        {error ? <Text style={styles.err}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          style={[styles.btn, (!email.trim() || !password || busy) && { opacity: 0.45 }]}
          disabled={!email.trim() || !password || busy}
          onPress={login}
        >
          {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.btnTxt}>Authorize</Text>}
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
  hint: { marginTop: 6, fontSize: 11, color: '#71717a', textAlign: 'center', marginBottom: 22 },
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
});
