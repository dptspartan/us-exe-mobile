import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMood } from '../context/MoodContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { MOOD_OPTIONS, moodEmoji } from '../utils/moods';
import { hexAlpha } from '../utils/theme';

const PILL_H = 40;
const GAP = 10;
const GRID_COLUMNS = 4;

/**
 * Compact header row + bottom sheet mood grid (uniform cells, RN Animated only).
 */
export function MoodPickerOrb() {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { accent, text, textMuted, card, cardBorder } = useVibeTheme();
  const { mine, theirs, updateMood, saving } = useMood();
  const [open, setOpen] = useState(false);

  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(1)).current;

  const sheetPad = 20;
  const cellGap = GAP;
  const gridInnerW = W - sheetPad * 2;
  const cellW = (gridInnerW - cellGap * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: open ? 1 : 0,
        duration: open ? 220 : 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: open ? 0 : 1,
        duration: open ? 280 : 220,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, backdrop, slide]);

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 420],
  });

  async function choose(mood: string) {
    if (saving || mood === mine) {
      setOpen(false);
      return;
    }
    setOpen(false);
    await updateMood(mood);
  }

  return (
    <>
      <View style={styles.headerRow}>
        <View pointerEvents="none" style={[styles.pillMuted, { height: PILL_H, flex: 1 }]}>
          <Text style={styles.pillPre}>You</Text>
          <Text style={styles.pillEmoji} numberOfLines={1}>
            {moodEmoji[theirs] ?? '🌙'} <Text style={styles.pillName}>{truncate(theirs, 10)}</Text>
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens mood picker"
          onPress={() => setOpen(true)}
          disabled={saving}
          style={[
            styles.pillYou,
            { borderColor: hexAlpha(accent, 0.65), height: PILL_H, flex: 1 },
            saving && { opacity: 0.55 },
          ]}
        >
          <Text style={styles.pillPre}>Me</Text>
          <Text style={styles.pillEmoji} numberOfLines={1}>
            {moodEmoji[mine] ?? '🌙'} <Text style={[styles.pillName, { color: accent }]}>{truncate(mine, 10)}</Text>
          </Text>
          <Text style={[styles.editGlyph, { color: accent }]}>▾</Text>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Animated.View
            style={[
              styles.backdropFill,
              {
                opacity: backdrop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.72] }),
              },
            ]}
          />
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Dismiss" />

          <Animated.View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, 16),
                transform: [{ translateY }],
              },
            ]}
          >
            <View style={styles.sheetGrip} />

            <Text style={[styles.sheetTitle, { color: text }]}>Set your vibe</Text>
            <Text style={[styles.sheetSub, { color: textMuted }]}>One tap saves for both dashboards · same as web</Text>

            <View style={[styles.grid, { gap: cellGap }]}>
              {MOOD_OPTIONS.map((mood) => {
                const sel = mood === mine;
                return (
                  <Pressable
                    key={mood}
                    onPress={() => choose(mood)}
                    style={[
                      styles.cell,
                      {
                        width: cellW,
                        borderColor: sel ? accent : cardBorder,
                        backgroundColor: sel ? hexAlpha(accent, 0.14) : card,
                      },
                    ]}
                  >
                    <Text style={styles.cellEmoji}>{moodEmoji[mood] ?? '✨'}</Text>
                    <Text style={[styles.cellLabel, sel && { color: accent }]} numberOfLines={2}>
                      {mood}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={[styles.closeTxt, { color: textMuted }]}>Close</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

function truncate(s: string, n: number) {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', gap: GAP, alignItems: 'stretch', paddingTop: 8 },
  pillMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: PILL_H / 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
    minWidth: 0,
    justifyContent: 'flex-start',
  },
  pillYou: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: PILL_H / 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    minWidth: 0,
    justifyContent: 'flex-start',
  },
  pillPre: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(244,244,245,0.38)',
    width: 54,
    flexShrink: 0,
  },
  pillEmoji: { flex: 1, fontSize: 15, fontWeight: '700', color: '#fafafa', minWidth: 0 },
  pillName: { fontSize: 14, fontWeight: '800', color: '#e4e4e7' },
  editGlyph: { fontSize: 13, flexShrink: 0, opacity: 0.9 },

  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdropFill: { ...StyleSheet.absoluteFillObject, backgroundColor: '#030305' },
  sheet: {
    backgroundColor: 'rgba(16,14,26,0.97)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sheetGrip: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: '#fafafa',
    textAlign: 'center',
  },
  sheetSub: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(244,244,245,0.45)',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  cell: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth + 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
  },
  cellEmoji: { fontSize: 26, marginBottom: 6 },
  cellLabel: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    color: 'rgba(244,244,245,0.75)',
    textTransform: 'capitalize',
  },
  closeBtn: { marginTop: 18, paddingVertical: 14, alignItems: 'center' },
  closeTxt: { fontSize: 12, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', color: '#71717a' },
});
