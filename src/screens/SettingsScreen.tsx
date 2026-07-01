import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { networkUtility } from '../api/network';
import { useApp } from '../context/AppContext';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SettingsScreen({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user, coupleProfile, refreshCoupleProfile } = useApp();

  const myName =
    coupleProfile && user?.id
      ? user.id === (coupleProfile.partner_1_id as string)
        ? (coupleProfile.partner_1_name as string)
        : (coupleProfile.partner_2_name as string)
      : '';

  const [displayName, setDisplayName] = useState('');
  const [shipName, setShipName] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  useEffect(() => {
    if (visible) {
      setDisplayName(myName || '');
      setShipName((coupleProfile?.ship_name as string) || '');
      setProfileMsg('');
      setProfileErr('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwMsg('');
      setPwErr('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function saveProfile() {
    setProfileErr('');
    setProfileMsg('');
    if (!displayName.trim()) {
      setProfileErr('Name cannot be empty.');
      return;
    }
    setProfileBusy(true);
    try {
      await networkUtility.updateMyProfile({ displayName: displayName.trim(), shipName: shipName.trim() });
      await refreshCoupleProfile();
      setProfileMsg('Saved!');
    } catch (e: unknown) {
      setProfileErr(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword() {
    setPwErr('');
    setPwMsg('');
    if (newPassword.length < 8) {
      setPwErr('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwErr('New passwords do not match.');
      return;
    }
    if (!user?.email) {
      setPwErr('Missing account email.');
      return;
    }
    setPwBusy(true);
    try {
      await networkUtility.changePassword({ email: user.email, currentPassword, newPassword });
      setPwMsg('Password updated!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: unknown) {
      setPwErr(e instanceof Error ? e.message : 'Could not update password.');
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Text style={styles.title}>Settings</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>Done</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>Profile</Text>
          <View style={styles.card}>
            <Text style={styles.lab}>Email</Text>
            <Text style={styles.readonly}>{user?.email ?? '—'}</Text>

            <Text style={styles.lab}>Your name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor="#52525b"
              style={styles.input}
            />

            <Text style={styles.lab}>Ship name (couple nickname)</Text>
            <TextInput
              value={shipName}
              onChangeText={setShipName}
              placeholder="Optional"
              placeholderTextColor="#52525b"
              style={styles.input}
            />

            {profileErr ? <Text style={styles.err}>{profileErr}</Text> : null}
            {profileMsg ? <Text style={styles.success}>{profileMsg}</Text> : null}

            <Pressable
              style={[styles.btn, profileBusy && { opacity: 0.6 }]}
              disabled={profileBusy}
              onPress={saveProfile}
            >
              {profileBusy ? <ActivityIndicator color="#111" /> : <Text style={styles.btnTxt}>Save profile</Text>}
            </Pressable>
          </View>

          <Text style={styles.section}>Change password</Text>
          <View style={styles.card}>
            <Text style={styles.lab}>Current password</Text>
            <TextInput
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#52525b"
              style={styles.input}
            />
            <Text style={styles.lab}>New password</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="At least 8 characters"
              placeholderTextColor="#52525b"
              style={styles.input}
            />
            <Text style={styles.lab}>Confirm new password</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#52525b"
              style={styles.input}
            />

            {pwErr ? <Text style={styles.err}>{pwErr}</Text> : null}
            {pwMsg ? <Text style={styles.success}>{pwMsg}</Text> : null}

            <Pressable
              style={[styles.btn, (pwBusy || !currentPassword || !newPassword) && { opacity: 0.6 }]}
              disabled={pwBusy || !currentPassword || !newPassword}
              onPress={changePassword}
            >
              {pwBusy ? <ActivityIndicator color="#111" /> : <Text style={styles.btnTxt}>Update password</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0c' },
  scroll: { paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', color: '#fafafa' },
  closeBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  closeTxt: { color: '#ec4899', fontSize: 14, fontWeight: '800' },
  section: {
    marginTop: 22,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#ec4899',
  },
  card: {
    borderRadius: 18,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(24,24,28,0.75)',
  },
  lab: { fontSize: 10, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', color: '#a1a1aa', marginTop: 10 },
  readonly: { marginTop: 8, fontSize: 14, color: '#71717a' },
  input: {
    marginTop: 8,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0a0a0c',
    color: '#f4f4f5',
    fontSize: 15,
  },
  err: { color: '#fca5a5', fontSize: 12, marginTop: 10 },
  success: { color: '#4ade80', fontSize: 12, marginTop: 10 },
  btn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#e4e4e7',
  },
  btnTxt: { fontWeight: '900', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#0a0a0c' },
});
