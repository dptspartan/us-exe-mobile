import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing as ReanimatedEasing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { networkUtility } from '../api/network';
import { useCoupleRealtime } from '../hooks/useCoupleRealtime';
import { useApp } from '../context/AppContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { hexAlpha } from '../utils/theme';

const FLIP_MS = 560;
const PERSPECTIVE = 1200;

export function LetterTab() {
  const vibe = useVibeTheme();
  const { accent, palette, text, textMuted, textFaint, card, cardBorder, inputBg } = vibe;
  const { user, coupleId, partnerId } = useApp();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [mineTxt, setMineTxt] = useState('');
  const [theirsTxt, setTheirsTxt] = useState('');
  const [saving, setSaving] = useState(false);
  const [flipped, setFlipped] = useState(false);

  const editingRef = useRef(false);
  const isFlipped = useSharedValue(0);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  const load = useCallback(async () => {
    const letters = await networkUtility.getFlipLetters(coupleId);
    const mine = letters.find((l: { author_id: string }) => l.author_id === user?.id);
    const theirsL = letters.find((l: { author_id: string }) => l.author_id === partnerId);
    const m = mine?.content || '';
    setMineTxt(m);
    setTheirsTxt(theirsL?.content || '');
    if (!editingRef.current) setDraft(m);
  }, [coupleId, user?.id, partnerId]);

  useCoupleRealtime(coupleId, 'flip_letters', load, {
    userIdField: 'author_id',
    currentUserId: user?.id,
  });

  async function save() {
    if (!coupleId || !user?.id || saving) return;
    setSaving(true);
    try {
      await networkUtility.updateFlipLetter(coupleId, user.id, draft);
      setMineTxt(draft);
      setEditing(false);
    } catch (err) {
      console.error('Failed to save flip letter:', err);
    } finally {
      setSaving(false);
    }
  }

  const runFlipTo = useCallback(
    (showTheirs: boolean) => {
      setFlipped(showTheirs);
      isFlipped.value = withTiming(showTheirs ? 1 : 0, {
        duration: FLIP_MS,
        easing: ReanimatedEasing.inOut(ReanimatedEasing.cubic),
      });
    },
    [isFlipped],
  );

  const toggleFlip = useCallback(() => {
    if (editing) return;
    runFlipTo(!flipped);
  }, [editing, flipped, runFlipTo]);

  const beginEdit = useCallback(() => {
    setDraft(mineTxt);
    setEditing(true);
  }, [mineTxt]);

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const deg = interpolate(isFlipped.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: PERSPECTIVE }, { rotateY: `${deg}deg` }],
      zIndex: isFlipped.value > 0.5 ? 0 : 2,
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const deg = interpolate(isFlipped.value, [0, 1], [180, 360]);
    return {
      transform: [{ perspective: PERSPECTIVE }, { rotateY: `${deg}deg` }],
      zIndex: isFlipped.value > 0.5 ? 2 : 0,
    };
  });

  const mineBorder = cardBorder;
  const mineBg = hexAlpha(palette.deepMine, 0.92);
  const theirsBorder = hexAlpha(palette.accentPartner, 0.45);
  const theirsBg = hexAlpha(palette.deepPartner, 0.94);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.hint, { color: textMuted }]}>Two-sided cardstock · flip to read each side</Text>

      <View style={styles.cardColumn}>
        <View style={styles.flipStage}>
          <View style={styles.cardStack} collapsable={false}>
            <Animated.View
              pointerEvents={flipped ? 'none' : 'auto'}
              style={[
                styles.face,
                frontAnimatedStyle,
                {
                  borderColor: mineBorder,
                  backgroundColor: mineBg,
                  shadowColor: palette.glowMine,
                },
              ]}
            >
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lab, { color: textMuted }]}>My side</Text>
                  <Text style={[styles.headline, { color: text }]}>To someone special</Text>
                </View>
                <Pressable
                  onPress={() => {
                    if (editing) void save();
                    else beginEdit();
                  }}
                  disabled={saving}
                  style={[
                    styles.pill,
                    {
                      borderColor: editing ? hexAlpha(accent, 0.55) : cardBorder,
                      backgroundColor: card,
                    },
                  ]}
                >
                  <Text style={[styles.pillTxt, { color: editing ? accent : textMuted }]}>
                    {editing ? (saving ? '…' : 'Done') : 'Edit'}
                  </Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {editing ? (
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    autoFocus
                    editable={!saving}
                    placeholder="Tell them something…"
                    placeholderTextColor={textMuted}
                    style={[styles.input, { color: text, backgroundColor: inputBg, borderColor: cardBorder }]}
                    textAlignVertical="top"
                  />
                ) : (
                  <Text style={[styles.read, { color: text }]}>
                    {mineTxt.trim() ? mineTxt : 'Tap edit to whisper something permanent.'}
                  </Text>
                )}
              </ScrollView>

              <Text style={[styles.flipCue, { color: textFaint, borderTopColor: cardBorder }]}>
                {editing ? 'Tap Done to save · flip below when ready' : 'Scroll the letter · flip below'}
              </Text>
            </Animated.View>

            <Animated.View
              pointerEvents={flipped && !editing ? 'box-none' : 'none'}
              style={[
                styles.face,
                backAnimatedStyle,
                {
                  borderColor: theirsBorder,
                  backgroundColor: theirsBg,
                  shadowColor: palette.glowPartner,
                },
              ]}
            >
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lab, { color: textMuted }]}>Their side</Text>
                  <Text style={[styles.headline, { color: text }]}>Words from yours</Text>
                </View>
                <View style={{ width: 72 }} />
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                <Text style={[styles.read, { color: hexAlpha(text, 0.85) }]}>
                  {theirsTxt.trim()
                    ? theirsTxt
                    : 'Have patience… they are still handwriting their universe for you.'}
                </Text>
              </ScrollView>

              <Text style={[styles.flipCue, { color: textFaint, borderTopColor: cardBorder }]}>
                Scroll the letter · flip below
              </Text>
            </Animated.View>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Flip letter card"
          disabled={editing}
          onPress={toggleFlip}
          style={[
            styles.flipBar,
            { backgroundColor: card, borderColor: hexAlpha(accent, 0.35) },
            editing && styles.flipBarDisabled,
          ]}
        >
          <Ionicons name="swap-horizontal" size={18} color={accent} />
          <Text style={[styles.flipBarTxt, { color: textMuted }]}>
            {editing
              ? 'Finish editing to flip'
              : flipped
                ? 'Flip to my side'
                : 'Flip to their side'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
  },
  hint: { marginBottom: 10, fontSize: 11, paddingRight: 8 },

  cardColumn: {
    flex: 1,
    minHeight: 0,
    marginBottom: 8,
    gap: 10,
  },
  flipStage: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardStack: {
    width: '100%',
    flex: 1,
    maxWidth: 520,
    alignSelf: 'center',
    position: 'relative',
  },

  face: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth + 1,
    backfaceVisibility: 'hidden',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  lab: { fontSize: 10, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase' },
  headline: { marginTop: 4, fontSize: 14, fontWeight: '800' },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },

  scroll: {
    flex: 1,
    marginTop: 14,
    minHeight: 120,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 6,
  },
  read: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    minHeight: 240,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },

  flipCue: {
    marginTop: 10,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },

  flipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flipBarDisabled: { opacity: 0.45 },
  flipBarTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
});
