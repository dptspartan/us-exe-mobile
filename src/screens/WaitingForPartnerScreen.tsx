import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { networkUtility } from '../api/network';
import { useApp } from '../context/AppContext';

type Invite = { role: string; email: string; display_name: string; status: string };

const POLL_MS = 15_000;

// Shown once the current user has finished their own account setup but the
// couple isn't fully paired+paid yet (blocks until BOTH partners have
// accepted — see plan's confirmed decision on waiting-room UX).
export function WaitingForPartnerScreen() {
  const { refreshCoupleProfile } = useApp();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fixingRole, setFixingRole] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const rows = await networkUtility.getOnboardingInvites();
    setInvites(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
      void refreshCoupleProfile();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [load, refreshCoupleProfile]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([load(), refreshCoupleProfile()]);
    setRefreshing(false);
  }

  async function resend(role: string, emailOverride?: string) {
    setBusy(true);
    try {
      await networkUtility.resendInvite({
        role,
        newEmail: emailOverride,
        coupleId: undefined,
        checkoutToken: undefined,
      });
      Alert.alert('Sent', 'Invite email sent again.');
      setFixingRole(null);
      setNewEmail('');
      await load();
    } catch (e: unknown) {
      Alert.alert('Could not resend', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await networkUtility.signOut();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl tintColor="#ec4899" refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.card}>
        <Text style={styles.emoji}>⏳</Text>
        <Text style={styles.title}>Waiting on your partner</Text>
        <Text style={styles.body}>Both of you need to finish setting up before the Dashboard unlocks.</Text>

        <View style={styles.list}>
          {invites.map((invite) => (
            <View key={invite.role} style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {invite.display_name}
                </Text>
                <Text style={styles.rowEmail} numberOfLines={1}>
                  {invite.email}
                </Text>
              </View>
              {invite.status === 'accepted' ? (
                <Text style={styles.badgeDone}>✓ Done</Text>
              ) : (
                <Text style={styles.badgePending}>Pending</Text>
              )}
            </View>
          ))}
        </View>

        {invites.some((i) => i.status !== 'accepted') ? (
          <View style={styles.fixSection}>
            {invites
              .filter((i) => i.status !== 'accepted')
              .map((invite) =>
                fixingRole === invite.role ? (
                  <View key={invite.role} style={styles.fixForm}>
                    <TextInput
                      value={newEmail}
                      onChangeText={setNewEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholder={invite.email}
                      placeholderTextColor="#52525b"
                      style={styles.input}
                    />
                    <View style={styles.fixRow}>
                      <Pressable
                        style={[styles.smallBtn, busy && { opacity: 0.5 }]}
                        disabled={busy}
                        onPress={() => void resend(invite.role, newEmail.trim() || undefined)}
                      >
                        <Text style={styles.smallBtnTxt}>{busy ? '…' : 'Save & resend'}</Text>
                      </Pressable>
                      <Pressable style={styles.smallBtnGhost} onPress={() => setFixingRole(null)}>
                        <Text style={styles.smallBtnGhostTxt}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View key={invite.role} style={styles.fixRow}>
                    <Pressable
                      style={[styles.smallBtn, busy && { opacity: 0.5 }]}
                      disabled={busy}
                      onPress={() => void resend(invite.role)}
                    >
                      <Text style={styles.smallBtnTxt}>Resend to {invite.email}</Text>
                    </Pressable>
                    <Pressable style={styles.smallBtnGhost} onPress={() => setFixingRole(invite.role)}>
                      <Text style={styles.smallBtnGhostTxt}>Fix email</Text>
                    </Pressable>
                  </View>
                ),
              )}
          </View>
        ) : null}

        <Pressable onPress={signOut} style={styles.linkBtn}>
          <Text style={styles.linkTxt}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f11' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f11' },
  card: {
    borderRadius: 20,
    padding: 26,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(24,24,28,0.75)',
  },
  emoji: { fontSize: 36, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '900', color: '#fafafa', textAlign: 'center' },
  body: { marginTop: 8, fontSize: 13, lineHeight: 20, color: '#a1a1aa', textAlign: 'center' },
  list: { marginTop: 20, width: '100%', gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0a0a0c',
  },
  rowName: { color: '#f4f4f5', fontSize: 14, fontWeight: '700' },
  rowEmail: { color: '#71717a', fontSize: 11, marginTop: 2 },
  badgeDone: { color: '#4ade80', fontSize: 11, fontWeight: '800' },
  badgePending: { color: '#facc15', fontSize: 11, fontWeight: '800' },
  fixSection: { marginTop: 16, width: '100%', gap: 10 },
  fixForm: { gap: 8 },
  fixRow: { flexDirection: 'row', gap: 8 },
  input: {
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0a0a0c',
    color: '#f4f4f5',
    fontSize: 13,
  },
  smallBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#e4e4e7',
  },
  smallBtnTxt: { color: '#0a0a0c', fontSize: 11, fontWeight: '800' },
  smallBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  smallBtnGhostTxt: { color: '#a1a1aa', fontSize: 11, fontWeight: '700' },
  linkBtn: { marginTop: 22, paddingVertical: 8 },
  linkTxt: { color: '#71717a', fontSize: 12, fontWeight: '700' },
});
