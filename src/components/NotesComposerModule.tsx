import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { networkUtility } from '../api/network';
import { useApp } from '../context/AppContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { hexAlpha } from '../utils/theme';

const SHADOW_STACK = [-5, -3.5, -2].map((r, i) => ({ rotate: ((i % 2) - 0.5) * 10, dx: ((i % 3) - 1) * 10, dy: i * 4, opacity: 0.25 + i * 0.12 }));

export function NotesComposerModule() {
  const { accent, text, textMuted, card, cardBorder } = useVibeTheme();
  const { user, coupleId } = useApp();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function pin() {
    const t = msg.trim();
    if (!t || !coupleId || !user?.id || busy) return;
    setBusy(true);
    try {
      await networkUtility.sendStickyNote(coupleId, user.id, t);
      setMsg('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.shell}>
      <View style={styles.stackStage}>
        {SHADOW_STACK.map((s, i) => (
          <View
            key={String(i)}
            style={[
              styles.stackGhost,
              {
                opacity: s.opacity,
                transform: [{ translateX: s.dx }, { translateY: s.dy }, { rotate: `${s.rotate}deg` }],
                zIndex: i,
              },
            ]}
          />
        ))}
        <View style={[styles.card, { borderColor: hexAlpha(accent, 0.22), backgroundColor: card, zIndex: 10 }]}>
          <View style={[styles.head, { borderBottomColor: cardBorder }]}>
            <Text style={[styles.tag, { color: textMuted }]}>Write sticky</Text>
            <View style={[styles.pip, { backgroundColor: hexAlpha(accent, 0.55) }]} />
          </View>
          <TextInput
            value={msg}
            onChangeText={setMsg}
            multiline
            placeholder="Something sweet, urgent, or silly…"
            placeholderTextColor={textMuted}
            style={[styles.area, { color: text }]}
            textAlignVertical="top"
          />
          <View style={[styles.foot, { borderTopColor: cardBorder }]}>
            <Text style={[styles.count, { color: textMuted }]}>{msg.trim().length} chars</Text>
            <Pressable
              accessibilityRole="button"
              onPress={pin}
              disabled={!msg.trim() || busy}
              style={[styles.btn, { backgroundColor: accent }, (!msg.trim() || busy) && { opacity: 0.45 }]}
            >
              <Text style={styles.btnTxt}>{busy ? 'Sending…' : 'Pin note'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, justifyContent: 'center' },
  stackStage: { width: '100%', maxWidth: 360, alignSelf: 'center', minHeight: 280 },
  stackGhost: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 18,
    bottom: 0,
    borderRadius: 20,
    backgroundColor: '#16161a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  card: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: 'rgba(30,30,36,0.97)',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 260,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    paddingBottom: 10,
    marginBottom: 10,
  },
  tag: { fontSize: 10, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase', color: '#a1a1aa' },
  pip: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3f3f46' },
  area: { flex: 1, color: '#f4f4f5', fontSize: 14, lineHeight: 21, minHeight: 120, fontWeight: '600' },
  foot: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 12,
  },
  count: { fontSize: 10, fontWeight: '800', color: '#52525b', letterSpacing: 1, textTransform: 'uppercase' },
  btn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  btnTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', color: '#0a0a0c' },
});
