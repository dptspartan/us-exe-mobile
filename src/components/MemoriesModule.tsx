import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { networkUtility } from '../api/network';
import { useCoupleRealtime } from '../hooks/useCoupleRealtime';
import { useApp } from '../context/AppContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { hexAlpha } from '../utils/theme';

type Photo = {
  id: string;
  imageUrl: string;
  caption?: string;
  storage_path: string;
  source_type?: string;
  uploaded_by?: string;
  created_at?: string;
};

const ACTION_GAP = 10;
const DECK_MS = 440;
const DECK_RISE_DELAY = 70;

type StackParts = {
  opacity: number;
  zIndex: number;
  innerTransform: (
    | { translateX: number }
    | { translateY: number }
    | { rotate: string }
    | { scale: number }
  )[];
  ty: number;
};

/** Stack offsets split so we can layer motion (whole-card slide vs next card rising into view). */
function stackParts(index: number, total: number, active: number, cardW: number): StackParts {
  const rel = (index - active + total) % total;
  const sx = Math.max(cardW / 220, 1);
  const rotDeg = -5 + rel * 3.2 + (index % 2 ? 1.2 : -1.2);
  const tx = rel * 3 * sx;
  const ty = rel * 6 * sx;
  const scale = 1 - rel * 0.045;
  const opacity = rel > 3 ? 0 : 1 - rel * 0.16;

  const innerTransform: StackParts['innerTransform'] = [
    { translateX: tx },
    { translateY: ty },
    { rotate: `${rotDeg}deg` },
    { scale },
  ];

  return {
    opacity,
    zIndex: total - rel,
    innerTransform,
    ty,
  };
}

export function MemoriesModule() {
  const { accent, text, textMuted, cardBorder, palette } = useVibeTheme();
  const sheetBg = hexAlpha(palette.deepMine, 0.96);
  const { width: screenW } = useWindowDimensions();
  const { user, coupleId } = useApp();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tags, setTags] = useState<Record<string, { title: string; scheduled_date: string }>>({});
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState(false);
  const [caption, setCaption] = useState('');
  const [picked, setPicked] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [names, setNames] = useState({ myName: 'You', partnerName: 'Partner' });

  const polaroidSizing = useMemo(() => {
    const W = Math.min(Math.max(screenW - 104, 272), 340);
    const H = Math.round(W * 1.2 + 12);
    return { W, H };
  }, [screenW]);

  const load = useCallback(async () => {
    if (!coupleId) return;
    const [rows, t] = await Promise.all([
      networkUtility.getPhotosWithUrls(coupleId),
      networkUtility.getPhotoDateTags(coupleId),
    ]);
    setPhotos(rows as Photo[]);
    setTags(t || {});
    setActive((i) => (rows.length ? Math.min(i, rows.length - 1) : 0));
  }, [coupleId]);

  const { reload } = useCoupleRealtime(coupleId, 'photo_wall', load, {
    userIdField: 'uploaded_by',
    currentUserId: user?.id,
  });
  useCoupleRealtime(coupleId, 'date_diary', load);

  useEffect(() => {
    if (!coupleId || !user?.id) return;
    void networkUtility.getNamesFromCouple(coupleId, user.id).then((n) => {
      if (n && typeof n === 'object') {
        setNames({ myName: n.myName || 'You', partnerName: n.partnerName || 'Partner' });
      }
    });
  }, [coupleId, user?.id]);

  const saverLabel = useCallback(
    (uploadedBy?: string) => {
      if (!uploadedBy || !user?.id) return 'Someone';
      return networkUtility.resolveSaverName(coupleId!, user.id, uploadedBy, names);
    },
    [coupleId, user?.id, names],
  );

  const slideAway = useRef(new Animated.Value(0)).current;
  const nextRise = useRef(new Animated.Value(0)).current;
  const deckBusy = useRef(false);

  useEffect(() => {
    deckBusy.current = false;
    slideAway.setValue(0);
    nextRise.setValue(0);
  }, [photos.length, slideAway, nextRise]);

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos', 'Allow library access to drop memories on the wall.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]) {
      setPicked(res.assets[0]);
      setPreview(true);
    }
  }

  async function commitUpload() {
    if (!picked || !coupleId || !user?.id) return;
    setBusy(true);
    try {
      await networkUtility.uploadPhotoToWall(coupleId, user.id, picked, caption.trim());
      setPreview(false);
      setPicked(null);
      setCaption('');
      await reload();
      setActive(0);
    } catch (e: unknown) {
      Alert.alert('Upload', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  /** Top card slips left while the card beneath lifts up slightly, then swap active index */
  const cycleDeck = useCallback(() => {
    const n = photos.length;
    if (n <= 1 || deckBusy.current) return;
    deckBusy.current = true;

    Animated.parallel([
      Animated.timing(slideAway, {
        toValue: 1,
        duration: DECK_MS,
        easing: Easing.bezier(0.33, 0, 0.2, 1),
        useNativeDriver: true,
      }),
      Animated.timing(nextRise, {
        toValue: 1,
        duration: DECK_MS + 100,
        delay: DECK_RISE_DELAY,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      slideAway.setValue(0);
      nextRise.setValue(0);
      deckBusy.current = false;
      if (finished) {
        setActive((i) => (i + 1) % n);
      }
    });
  }, [photos.length, active, polaroidSizing.W, slideAway, nextRise]);

  function requestDelete(p: Photo) {
    setDeleteTarget(p);
  }

  async function commitDelete() {
    if (!deleteTarget || !coupleId) return;
    setDeleting(true);
    try {
      const ok = await networkUtility.wipePhotoFromServer(
        deleteTarget.id,
        deleteTarget.storage_path,
        coupleId,
      );
      if (ok) {
        setPhotos((prev) => prev.filter((x) => x.id !== deleteTarget.id));
        setActive(0);
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const clusterBleedX = 52;
  const clusterBleedStackY = 100;
  const clusterW = polaroidSizing.W + clusterBleedX;
  const stackClusterH = polaroidSizing.H + clusterBleedStackY;
  const stackCardLeft = Math.round((clusterW - polaroidSizing.W) / 2);
  const stackCardTop = Math.round((stackClusterH - polaroidSizing.H) / 2);

  /** Used in render tree so native driver binds during animation */
  const slideXI = slideAway.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -Math.round(Math.min(polaroidSizing.W * 0.38, 112))],
  });
  const slideRotI = slideAway.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-12deg'],
  });
  const slideOpacityI = slideAway.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [1, 0.9, 0.5],
  });

  const nPhotos = photos.length;
  const nextIdx = nPhotos ? (active + 1) % nPhotos : 0;
  const incomingLayoutMemo = useMemo(() => stackParts(nextIdx, nPhotos || 1, active, polaroidSizing.W), [nextIdx, nPhotos, active, polaroidSizing.W]);
  const riseYI =
    nPhotos > 1
      ? nextRise.interpolate({
          inputRange: [0, 1],
          outputRange: [incomingLayoutMemo.ty - 68, incomingLayoutMemo.ty],
        })
      : null;
  const riseScaleI =
    nPhotos > 1
      ? nextRise.interpolate({
          inputRange: [0, 1],
          outputRange: [0.92, 1],
        })
      : null;

  const topPhoto = photos.length ? photos[Math.min(active, photos.length - 1)] : null;

  return (
    <View style={styles.wrap}>
      {!preview ? (
        <View style={styles.actionRailOuter} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete current photo"
            disabled={photos.length === 0}
            onPress={() => {
              if (topPhoto) requestDelete(topPhoto);
            }}
            style={[
              styles.actionBtn,
              styles.actionBtnDelete,
              photos.length === 0 && styles.actionBtnDisabled,
            ]}
          >
            <Text style={styles.actionBtnDeleteTxt}>Delete</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            onPress={pickImage}
            style={[styles.actionBtn, { backgroundColor: accent, borderColor: hexAlpha(accent, 0.5) }]}
          >
            <Text style={styles.actionBtnAddTxt}>Add</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.stage}>
        <View style={[styles.deckWrap, { width: clusterW }]}>
          <View
            pointerEvents="box-none"
            style={[styles.stackClusterBox, { width: clusterW, height: stackClusterH }]}
          >
          {preview && picked ? (
            <View
              style={[
                styles.polaroid,
                styles.previewPolaroid,
                {
                  width: polaroidSizing.W,
                  height: polaroidSizing.H,
                  left: stackCardLeft,
                  top: stackCardTop,
                },
              ]}
            >
              <View style={styles.frame}>
                <Image source={{ uri: picked.uri }} style={styles.img} />
              </View>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Caption…"
                placeholderTextColor="rgba(30,30,34,0.35)"
                style={styles.previewCaption}
                maxLength={42}
              />
              <View style={styles.previewRow}>
                <Pressable
                  style={styles.previewPill}
                  onPress={() => {
                    setPreview(false);
                    setPicked(null);
                    setCaption('');
                  }}
                >
                  <Text style={styles.previewPillTxt}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.previewPill, { backgroundColor: accent }]}
                  onPress={commitUpload}
                  disabled={busy}
                >
                  <Text style={[styles.previewPillTxt, { color: '#0a0a0c' }]}>
                    {busy ? '…' : 'Pin'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : photos.length === 0 ? (
            <Pressable
              style={[
                styles.polaroid,
                styles.empty,
                styles.previewPolaroid,
                {
                  width: polaroidSizing.W,
                  height: polaroidSizing.H,
                  left: stackCardLeft,
                  top: stackCardTop,
                },
              ]}
              onPress={pickImage}
            >
              <Text style={styles.bigPlus}>＋</Text>
              <Text style={styles.emptyTxt}>No memories yet</Text>
              <Text style={styles.emptySub}>Tap Add to drop a memory</Text>
            </Pressable>
          ) : (
            photos.map((p, rawIndex) => {
              const lay = stackParts(rawIndex, photos.length, active, polaroidSizing.W);
              const onTop = rawIndex === active;
              const isIncoming = rawIndex === nextIdx && nPhotos > 1;
              const tag = tags[p.id];

              const innerCard = (
                <View style={[styles.polaroid, { transform: lay.innerTransform }]}>
                  <View style={styles.cardPressInner}>
                    <View style={styles.frame}>
                      {tag?.scheduled_date ? (
                        <View style={[styles.pin, { borderColor: accent }]}>
                          <Text style={[styles.pinTxt, { color: accent }]}>📌</Text>
                          <Text style={styles.pinDate}>
                            {new Date(`${tag.scheduled_date}T12:00:00`).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </Text>
                        </View>
                      ) : null}
                      <Image source={{ uri: p.imageUrl }} style={styles.img} />
                    </View>
                    <Text style={styles.capRead} numberOfLines={2}>
                      {p.caption || ' '}
                    </Text>
                    {p.source_type === 'doodle' && p.created_at ? (
                      <Text style={styles.doodleMeta} numberOfLines={1}>
                        Saved by {saverLabel(p.uploaded_by)} ·{' '}
                        {new Date(p.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );

              /** Motion wrapper: outgoing top slips left on X; incoming (next index) lifts on Y toward stack slot */
              let wrapped: React.ReactElement = innerCard;
              if (isIncoming && riseYI && riseScaleI) {
                wrapped = (
                  <Animated.View
                    style={[styles.motionFill, { transform: [{ translateY: riseYI }, { scale: riseScaleI }] }]}
                  >
                    {innerCard}
                  </Animated.View>
                );
              }
              if (onTop) {
                wrapped = (
                  <Animated.View
                    style={[
                      styles.motionFill,
                      {
                        opacity: slideOpacityI,
                        transform: [{ translateX: slideXI }, { rotate: slideRotI }],
                      },
                    ]}
                  >
                    {wrapped}
                  </Animated.View>
                );
              }

              return (
                <View
                  key={p.id}
                  style={[
                    styles.polaroidStackSlot,
                    {
                      width: polaroidSizing.W,
                      height: polaroidSizing.H,
                      left: stackCardLeft,
                      top: stackCardTop,
                      opacity: lay.opacity,
                      zIndex: lay.zIndex,
                    },
                    !onTop && { pointerEvents: 'none' },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint={onTop ? 'Shows next polaroid' : undefined}
                    onPress={() => {
                      if (onTop) cycleDeck();
                    }}
                    disabled={!onTop}
                    style={[styles.pressFill, !onTop && { opacity: 1 }]}
                  >
                    {wrapped}
                  </Pressable>
                </View>
              );
            })
          )}
          </View>
        </View>
      </View>

      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      >
        <View style={styles.confirmRoot}>
          <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.confirmTint, { backgroundColor: hexAlpha(palette.base, 0.55) }]} />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!deleting) setDeleteTarget(null);
            }}
            accessibilityLabel="Dismiss"
          />
          <View style={[styles.confirmCard, { backgroundColor: sheetBg, borderColor: cardBorder }]}>
            <View style={[styles.confirmIcon, { backgroundColor: hexAlpha('#f87171', 0.12) }]}>
              <Ionicons name="warning-outline" size={22} color="#f87171" />
            </View>
            <Text style={[styles.confirmTitle, { color: text }]}>Remove memory?</Text>
            <Text style={[styles.confirmSub, { color: textMuted }]}>
              Deletes this polaroid from the wall for both of you. This cannot be undone.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnGhost, { borderColor: cardBorder }]}
                onPress={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                <Text style={[styles.confirmBtnTxt, { color: textMuted }]}>Keep</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: '#dc2626' }]}
                onPress={() => void commitDelete()}
                disabled={deleting}
              >
                <Text style={[styles.confirmBtnTxt, { color: '#fff' }]}>
                  {deleting ? 'Removing…' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 4 },
  actionRailOuter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: ACTION_GAP,
    width: '100%',
    marginBottom: 12,
    zIndex: 70,
  },
  actionBtn: {
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  actionBtnDelete: {
    backgroundColor: 'rgba(26,22,26,0.92)',
    borderColor: 'rgba(248,113,113,0.4)',
  },
  actionBtnDeleteTxt: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#fca5a5',
  },
  actionBtnAddTxt: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#0a0a0c',
  },
  actionBtnDisabled: { opacity: 0.35 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 0 },
  deckWrap: {
    alignSelf: 'center',
    alignItems: 'stretch',
  },
  stackClusterBox: {
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  polaroidStackSlot: {
    position: 'absolute',
  },
  motionFill: { flex: 1, width: '100%', height: '100%' },
  pressFill: { flex: 1, width: '100%', height: '100%' },
  polaroid: {
    backgroundColor: '#fcfbf9',
    borderRadius: 4,
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,20,24,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.38,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  previewPolaroid: {
    position: 'absolute',
    zIndex: 20,
  },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  cardPressInner: { flex: 1, width: '100%', justifyContent: 'flex-start' },
  bigPlus: { fontSize: 48, color: '#a1a1aa', fontWeight: '200' },
  emptyTxt: { fontSize: 12, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', color: '#52525b' },
  emptySub: { fontSize: 11, color: '#71717a', textAlign: 'center', paddingHorizontal: 20 },
  frame: { position: 'relative', borderRadius: 2, overflow: 'hidden', backgroundColor: '#0a0a0c' },
  img: { width: '100%', aspectRatio: 1, resizeMode: 'cover' },
  pin: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,12,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  pinTxt: { fontSize: 11 },
  pinDate: { fontSize: 9, fontWeight: '800', color: '#fafafa', letterSpacing: 1 },
  capRead: {
    marginTop: 6,
    width: '100%',
    alignSelf: 'center',
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 23,
    color: 'rgba(30,30,34,0.88)',
    fontWeight: '700',
    includeFontPadding: false,
  },
  doodleMeta: {
    marginTop: 4,
    width: '100%',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(30,30,34,0.55)',
    letterSpacing: 0.3,
  },
  previewCaption: {
    marginTop: 8,
    width: '100%',
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: 'rgba(30,30,34,0.88)',
    paddingVertical: 2,
    includeFontPadding: false,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 'auto' as const,
    paddingTop: 8,
  },
  previewPill: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: 'rgba(10,10,12,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(10,10,12,0.1)',
    alignItems: 'center',
  },
  previewPillTxt: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#27272a',
  },
  confirmRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmTint: {
    ...StyleSheet.absoluteFillObject,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 8,
    zIndex: 2,
  },
  confirmIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: { fontSize: 16, fontWeight: '900' },
  confirmSub: { fontSize: 11, lineHeight: 16 },
  confirmActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  confirmBtnGhost: { backgroundColor: 'rgba(255,255,255,0.04)' },
  confirmBtnTxt: { fontSize: 12, fontWeight: '800' },
});
