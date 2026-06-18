import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { networkUtility } from '../api/network';
import { useCoupleRealtime } from '../hooks/useCoupleRealtime';
import { useApp } from '../context/AppContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { hexAlpha } from '../utils/theme';
import { notifyPartnerStickyNote, initNotificationBehavior } from '../lib/notifications';

type Row = { id: string; content?: string };

type Props = { partnerName: string };

const SHADOW_STACK = [-5, -3.5, -2].map((r, i) => ({
  rotate: ((i % 2) - 0.5) * 10,
  dx: ((i % 3) - 1) * 10,
  dy: i * 4,
  opacity: 0.2 + i * 0.1,
}));

const HEADER_FOOTER_H = 118;

export function StickyNotesTray({ partnerName }: Props) {
  const { accent, text, textMuted, card, cardBorder, palette } = useVibeTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { user, coupleId } = useApp();
  const [notes, setNotes] = useState<Row[]>([]);
  const seen = useRef(new Set<string>());
  const firstHydrate = useRef(true);

  const cardMinH = Math.round(screenH * 0.3);
  const cardMaxH = Math.round(screenH * 0.4);
  const bodyMinH = Math.max(80, cardMinH - HEADER_FOOTER_H);
  const bodyMaxH = Math.max(bodyMinH, cardMaxH - HEADER_FOOTER_H);
  const cardW = Math.min(screenW - 52, 360);

  const stackGhosts = useMemo(() => {
    if (notes.length <= 1) return [];
    const depth = Math.min(notes.length - 1, SHADOW_STACK.length);
    return SHADOW_STACK.slice(0, depth);
  }, [notes.length]);

  useEffect(() => {
    void initNotificationBehavior();
  }, []);

  const load = useCallback(async () => {
    if (!coupleId || !user?.id) return;
    const fetched = (await networkUtility.getActiveIncomingNotes(coupleId, user.id)) || [];
    const next = fetched as Row[];

    setNotes((prev) => {
      if (firstHydrate.current) {
        firstHydrate.current = false;
        next.forEach((r) => seen.current.add(r.id));
        return next;
      }

      const prevIds = new Set(prev.map((n) => n.id));
      for (const r of next) {
        const isNew = !prevIds.has(r.id);
        if (!seen.current.has(r.id)) seen.current.add(r.id);
        if (isNew && AppState.currentState !== 'active') {
          void notifyPartnerStickyNote(partnerName);
        }
      }
      return next;
    });
  }, [coupleId, user?.id, partnerName]);

  useCoupleRealtime(coupleId, 'sticky_notes', load, {
    userIdField: 'author_id',
    currentUserId: user?.id,
  });

  async function dismiss(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await networkUtility.clearStickyNote(id);
  }

  const top = notes[0];
  const body = top?.content?.trim() ?? '';

  if (!top) return null;

  return (
    <Modal visible transparent animationType="fade" presentationStyle="overFullScreen">
      <View style={styles.scrim}>
        <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[styles.scrimTint, { backgroundColor: hexAlpha(palette.base, 0.58) }]} />

        <View style={[styles.stackStage, { width: cardW, minHeight: cardMinH, maxHeight: cardMaxH }]}>
          {stackGhosts.map((s, i) => (
            <View
              key={`ghost-${i}`}
              style={[
                styles.stackGhost,
                {
                  opacity: s.opacity,
                  borderColor: hexAlpha(cardBorder, 0.35),
                  transform: [{ translateX: s.dx }, { translateY: s.dy }, { rotate: `${s.rotate}deg` }],
                  zIndex: i,
                },
              ]}
            >
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              <View
                style={[StyleSheet.absoluteFill, { backgroundColor: hexAlpha(palette.deepMine, 0.55) }]}
              />
            </View>
          ))}

          <View
            style={[
              styles.card,
              {
                width: cardW,
                minHeight: cardMinH,
                maxHeight: cardMaxH,
                borderColor: hexAlpha(accent, 0.32),
                zIndex: 10,
              },
            ]}
          >
            <BlurView intensity={52} tint="dark" style={StyleSheet.absoluteFill} />
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: hexAlpha(palette.deepMine, 0.62) }]}
            />

            <View style={styles.cardInner}>
              <View style={[styles.head, { borderBottomColor: hexAlpha(cardBorder, 0.45) }]}>
                <Text style={[styles.badge, { color: accent }]}>
                  {partnerName} · note{notes.length > 1 ? ` (${notes.length})` : ''}
                </Text>
                <View style={[styles.dot, { backgroundColor: hexAlpha(accent, 0.45) }]} />
              </View>

              <ScrollView
                style={{ minHeight: bodyMinH, maxHeight: bodyMaxH, flexGrow: 1 }}
                contentContainerStyle={[styles.bodyContent, { minHeight: bodyMinH }]}
                showsVerticalScrollIndicator={body.length > 180}
                bounces={body.length > 180}
              >
                <Text style={[styles.copy, { color: text }]}>{body || ' '}</Text>
              </ScrollView>

              <View style={[styles.foot, { borderTopColor: hexAlpha(cardBorder, 0.45) }]}>
                {notes.length > 1 ? (
                  <Text style={[styles.queue, { color: textMuted }]}>
                    {notes.length - 1} more in stack
                  </Text>
                ) : (
                  <View />
                )}
                <Pressable
                  style={[styles.btn, { borderColor: hexAlpha(cardBorder, 0.55) }]}
                  accessibilityRole="button"
                  onPress={() => dismiss(top.id)}
                >
                  <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                  <View
                    style={[StyleSheet.absoluteFill, { backgroundColor: hexAlpha(card, 0.78) }]}
                  />
                  <Text style={[styles.btnTxt, { color: text }]}>Dismiss</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 26,
    overflow: 'hidden',
  },
  scrimTint: {
    ...StyleSheet.absoluteFillObject,
  },
  stackStage: {
    alignSelf: 'center',
    position: 'relative',
  },
  stackGhost: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 14,
    bottom: 0,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
  },
  cardInner: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    flexDirection: 'column',
    flex: 1,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    marginBottom: 10,
  },
  badge: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    flex: 1,
    paddingRight: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bodyContent: {
    flexGrow: 0,
    paddingBottom: 4,
  },
  copy: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
  },
  foot: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 10,
  },
  queue: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  btnTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    zIndex: 1,
  },
});
