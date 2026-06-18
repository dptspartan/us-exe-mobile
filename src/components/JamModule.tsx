import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { networkUtility } from '../api/network';
import { useCoupleRealtime } from '../hooks/useCoupleRealtime';
import { useApp } from '../context/AppContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { hexAlpha } from '../utils/theme';
import { groupSessionsByType, JAM_SESSION_TYPES } from '../utils/jamSessions';

type JamConf = (typeof JAM_SESSION_TYPES)[number];

const JAM_VISUALS: Record<
  JamConf['id'],
  {
    icon: keyof typeof Ionicons.glyphMap;
    gradient: [string, string];
    aura: string;
  }
> = {
  meet: { icon: 'videocam', gradient: ['#6366f1', '#38bdf8'], aura: '#818cf8' },
  teleparty: { icon: 'film', gradient: ['#db2777', '#f97316'], aura: '#f472b6' },
  spotify: { icon: 'musical-notes', gradient: ['#16a34a', '#22d3ee'], aura: '#22c55e' },
};

type JamCardProps = {
  conf: JamConf;
  session: Record<string, unknown> | null;
  userId?: string;
  accent: string;
  text: string;
  textMuted: string;
  textFaint: string;
  cardBorder: string;
  inputBg: string;
  expanded: boolean;
  busy: boolean;
  onToggleExpand: () => void;
  onStart: (url: string, tag: string) => Promise<boolean>;
  onEnd: () => void;
};

function JamCard({
  conf,
  session,
  userId,
  accent,
  text,
  textMuted,
  textFaint,
  cardBorder,
  inputBg,
  expanded,
  busy,
  onToggleExpand,
  onStart,
  onEnd,
}: JamCardProps) {
  const visual = JAM_VISUALS[conf.id];
  const live = !!session;
  const mine = live && session?.creator_id === userId;
  const [url, setUrl] = useState('');
  const [tag, setTag] = useState('');

  async function launch() {
    if (!url.trim() || busy) return;
    const ok = await onStart(url, tag);
    if (ok) {
      setUrl('');
      setTag('');
    }
  }

  const displayTitle = live
    ? String(session?.displayTitle || session?.title || '').replace(/^\[[^\]]+\]\s*/, '')
    : '';

  return (
    <View style={[styles.card, { borderColor: hexAlpha(visual.aura, live ? 0.55 : 0.28) }]}>
      <LinearGradient
        colors={[hexAlpha(visual.gradient[0], 0.22), hexAlpha(visual.gradient[1], 0.04), 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.cardSheen, { backgroundColor: hexAlpha(visual.aura, 0.06) }]} />

      <View style={styles.cardHead}>
        <LinearGradient colors={visual.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.iconOrb}>
          <Ionicons name={visual.icon} size={22} color="#0a0a0c" />
        </LinearGradient>
        <View style={styles.cardHeadTxt}>
          <View style={styles.titleRow}>
            <Text style={[styles.cardTitle, { color: text }]}>{conf.label}</Text>
            {live ? (
              <View style={[styles.livePill, { backgroundColor: hexAlpha('#22c55e', 0.16), borderColor: hexAlpha('#22c55e', 0.45) }]}>
                <View style={styles.liveDot} />
                <Text style={styles.liveTxt}>Live</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.cardHint, { color: textMuted }]}>
            {live ? (mine ? 'You are broadcasting' : 'Partner is live') : conf.hint}
          </Text>
        </View>
        {live ? (
          <Pressable
            style={[styles.joinBtn, styles.joinBtnHead, { backgroundColor: accent }]}
            onPress={() => Linking.openURL(String(session?.url))}
          >
            <Text style={styles.joinTxt}>Join</Text>
            <Ionicons name="arrow-forward" size={14} color="#0a0a0c" />
          </Pressable>
        ) : null}
      </View>

      {live ? (
        <View style={styles.liveBody}>
          <Text style={[styles.beamKicker, { color: hexAlpha(visual.aura, 0.9) }]}>
            {mine ? 'Your beam' : 'Incoming beam'}
          </Text>
          <Text style={[styles.beamTitle, { color: text }]} numberOfLines={2}>
            {displayTitle || 'Shared session'}
          </Text>
          {mine ? (
            <Pressable onPress={onEnd} disabled={busy} style={[styles.endBtn, { borderColor: cardBorder }]}>
              <Text style={[styles.endTxt, { color: textMuted }]}>{busy ? '…' : 'End beam'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : expanded ? (
        <View style={styles.form}>
          <Text style={[styles.fieldLab, { color: textFaint }]}>Link</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder={conf.placeholder}
            placeholderTextColor={textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: text, backgroundColor: inputBg, borderColor: hexAlpha(cardBorder, 0.7) }]}
          />
          <Text style={[styles.fieldLab, { color: textFaint, marginTop: 10 }]}>Tag (optional)</Text>
          <TextInput
            value={tag}
            onChangeText={setTag}
            placeholder="Chill night"
            placeholderTextColor={textFaint}
            style={[styles.input, { color: text, backgroundColor: inputBg, borderColor: hexAlpha(cardBorder, 0.7) }]}
          />
          <View style={styles.formActions}>
            <Pressable onPress={onToggleExpand} hitSlop={8}>
              <Text style={[styles.ghostBtn, { color: textMuted }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.launchBtn, { backgroundColor: visual.gradient[0] }, (!url.trim() || busy) && { opacity: 0.45 }]}
              onPress={() => void launch()}
              disabled={!url.trim() || busy}
            >
              <Text style={styles.launchTxt}>{busy ? 'Launching…' : 'Launch beam'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={onToggleExpand}
          style={[styles.idleCta, { borderColor: hexAlpha(visual.aura, 0.35) }]}
        >
          <Ionicons name="add" size={16} color={visual.aura} />
          <Text style={[styles.idleCtaTxt, { color: hexAlpha(visual.aura, 0.95) }]}>Drop a link</Text>
        </Pressable>
      )}
    </View>
  );
}

export function JamModule() {
  const { accent, text, textMuted, textFaint, cardBorder, inputBg } = useVibeTheme();
  const { user, coupleId } = useApp();
  const [byType, setByType] = useState<Record<string, Record<string, unknown> | null>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await networkUtility.getActiveJamSessions(coupleId);
    setByType(groupSessionsByType(rows));
  }, [coupleId]);

  useCoupleRealtime(coupleId, 'link_drops', load, {
    userIdField: 'creator_id',
    currentUserId: user?.id,
  });

  async function startJam(typeId: string, url: string, tag: string): Promise<boolean> {
    const conf = JAM_SESSION_TYPES.find((t) => t.id === typeId);
    const u = url.trim();
    const t = tag.trim();
    if (!conf || !u || !coupleId || !user?.id) return false;
    setBusyId(typeId);
    try {
      await networkUtility.startJamSession(coupleId, user.id, conf.id, t || conf.label, u);
      setExpandedId(null);
      await load();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function endJam(typeId: string) {
    const session = byType[typeId];
    if (!session?.id) return;
    setBusyId(typeId);
    await networkUtility.endJamSession(session.id as string);
    await load();
    setBusyId(null);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {JAM_SESSION_TYPES.map((conf) => (
          <JamCard
            key={conf.id}
            conf={conf}
            session={byType[conf.id] ?? null}
            userId={user?.id}
            accent={accent}
            text={text}
            textMuted={textMuted}
            textFaint={textFaint}
            cardBorder={cardBorder}
            inputBg={inputBg}
            expanded={expandedId === conf.id}
            busy={busyId === conf.id}
            onToggleExpand={() => setExpandedId((id) => (id === conf.id ? null : conf.id))}
            onStart={(url, tag) => startJam(conf.id, url, tag)}
            onEnd={() => void endJam(conf.id)}
          />
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, paddingTop: 4 },
  scroll: { flex: 1 },
  list: {
    gap: 14,
    paddingBottom: 16,
  },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  cardSheen: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  iconOrb: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cardHeadTxt: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  liveTxt: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#86efac',
  },
  cardHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  idleCta: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  idleCtaTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  liveBody: { marginTop: 14 },
  beamKicker: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  beamTitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  joinBtnHead: {
    flexShrink: 0,
    marginTop: 2,
  },
  joinTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#0a0a0c',
  },
  endBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  endTxt: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  form: { marginTop: 14 },
  fieldLab: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    fontSize: 13,
    fontWeight: '600',
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  ghostBtn: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  launchBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  launchTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#0a0a0c',
  },
});
