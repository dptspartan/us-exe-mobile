import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { networkUtility } from '../api/network';
import { useCoupleRealtime } from '../hooks/useCoupleRealtime';
import { useApp } from '../context/AppContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { groupSessionsByType, JAM_SESSION_TYPES } from '../utils/jamSessions';

export function JamModule() {
  const { accent, text, textMuted } = useVibeTheme();
  const { user, coupleId } = useApp();
  const [tab, setTab] = useState<string>(JAM_SESSION_TYPES[0].id);
  const [byType, setByType] = useState<Record<string, Record<string, unknown> | null>>({});

  const activeConf = useMemo(() => JAM_SESSION_TYPES.find((t) => t.id === tab), [tab]);
  const session = byType[tab] ?? null;

  const load = useCallback(async () => {
    const rows = await networkUtility.getActiveJamSessions(coupleId);
    setByType(groupSessionsByType(rows));
  }, [coupleId]);

  useCoupleRealtime(coupleId, 'link_drops', load, {
    userIdField: 'creator_id',
    currentUserId: user?.id,
  });

  const [expand, setExpand] = useState(false);
  const [url, setUrl] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);

  async function startJam() {
    const u = url.trim();
    const t = tag.trim();
    if (!activeConf || !u || !coupleId || !user?.id) return;
    setBusy(true);
    try {
      await networkUtility.startJamSession(coupleId, user.id, activeConf.id, t || activeConf.label, u);
      setUrl('');
      setTag('');
      setExpand(false);
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function endJam() {
    if (!session?.id) return;
    setBusy(true);
    await networkUtility.endJamSession(session.id as string);
    await load();
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={[styles.h1, { color: text }]}>Jam deck</Text>
      <Text style={[styles.h2, { color: textMuted }]}>Three live tunnels — one beam per system</Text>

      <View style={styles.seg}>
        {JAM_SESSION_TYPES.map((jt) => (
          <Pressable
            key={jt.id}
            onPress={() => {
              setTab(jt.id);
              setExpand(false);
            }}
            style={[styles.segBtn, tab === jt.id && { backgroundColor: 'rgba(255,255,255,0.08)' }]}
          >
            <Text style={styles.segEmoji}>{jt.icon}</Text>
            {!!byType[jt.id] ? <View style={styles.liveDot} /> : null}
          </Pressable>
        ))}
      </View>

      {activeConf ? (
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <Text style={styles.iconBig}>{activeConf.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{activeConf.label}</Text>
              <Text style={styles.meta}>
                {session
                  ? session.creator_id === user?.id
                    ? '⚡ You are broadcasting'
                    : '📡 Incoming link'
                  : activeConf.hint}
              </Text>
            </View>
          </View>

          {session ? (
            <View style={styles.liveRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.k, { color: accent + 'cc' }]}>
                  {session.creator_id === user?.id ? 'Your beam' : 'Partner beam'}
                </Text>
                <Text style={styles.link} numberOfLines={2}>
                  {String(session.displayTitle || session.title || '').replace(/^\[[^\]]+\]\s*/, '')}
                </Text>
              </View>
              <Pressable style={[styles.cta, { backgroundColor: accent }]} onPress={() => Linking.openURL(String(session.url))}>
                <Text style={styles.ctaTxt}>Join</Text>
              </Pressable>
              <Pressable onPress={endJam} disabled={busy} style={{ paddingHorizontal: 6 }}>
                <Text style={{ color: '#a1a1aa', fontWeight: '900' }}>✕</Text>
              </Pressable>
            </View>
          ) : expand ? (
            <View style={styles.form}>
              <Text style={styles.lab}>Link endpoint</Text>
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder={activeConf.placeholder}
                placeholderTextColor="#52525b"
                autoCapitalize="none"
                style={styles.input}
              />
              <Text style={[styles.lab, { marginTop: 12 }]}>Tag (optional)</Text>
              <TextInput value={tag} onChangeText={setTag} placeholder="Chill night" placeholderTextColor="#52525b" style={styles.input} />
              <View style={styles.formActions}>
                <Pressable onPress={() => setExpand(false)}>
                  <Text style={styles.secondary}>Back</Text>
                </Pressable>
                <Pressable style={[styles.cta, { backgroundColor: accent }]} onPress={startJam} disabled={busy}>
                  <Text style={styles.ctaTxt}>{busy ? '…' : 'Launch'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.init} onPress={() => setExpand(true)}>
              <Text style={styles.initTxt}>＋ Initialize beam</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, paddingTop: 4 },
  h1: { fontSize: 16, fontWeight: '900', letterSpacing: 5, textTransform: 'uppercase', color: '#fafafa' },
  h2: { marginTop: 6, fontSize: 11, color: '#71717a' },
  seg: {
    flexDirection: 'row',
    marginTop: 14,
    borderRadius: 16,
    padding: 4,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    alignSelf: 'flex-start',
    gap: 4,
  },
  segBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segEmoji: { fontSize: 22 },
  liveDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  card: {
    marginTop: 16,
    flex: 1,
    borderRadius: 20,
    padding: 18,
    backgroundColor: 'rgba(18,18,22,0.86)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  iconBig: { fontSize: 40 },
  title: { fontSize: 17, fontWeight: '900', color: '#fafafa', letterSpacing: 3, textTransform: 'uppercase' },
  meta: { marginTop: 4, fontSize: 12, color: '#71717a' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 },
  k: { fontSize: 9, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
  link: { fontSize: 12, color: '#d4d4d8', fontWeight: '700', marginTop: 4 },
  cta: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 14 },
  ctaTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', color: '#0a0a0c' },
  form: { marginTop: 16 },
  lab: { fontSize: 10, fontWeight: '900', letterSpacing: 3, color: '#52525b', textTransform: 'uppercase' },
  input: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    color: '#fafafa',
    backgroundColor: 'rgba(0,0,0,0.25)',
    fontSize: 13,
  },
  formActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  secondary: { color: '#a1a1aa', fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', fontSize: 11 },
  init: {
    marginTop: 26,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  initTxt: { fontSize: 12, fontWeight: '900', letterSpacing: 3, color: '#a1a1aa', textTransform: 'uppercase' },
});
