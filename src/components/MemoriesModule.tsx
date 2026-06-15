import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { networkUtility } from '../api/network';
import { useCoupleRealtime } from '../hooks/useCoupleRealtime';
import { useApp } from '../context/AppContext';
import { useVibeTheme } from '../hooks/useVibeTheme';

type Photo = { id: string; imageUrl: string; caption?: string; storage_path: string };

const FAB_SIZE = 58;
/** Extra lift so controls sit visibly above stacked polaroid bottom curve */
const BOTTOM_BTN_INSET = 14;

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
  const { accent, text, textMuted } = useVibeTheme();
  const { width: screenW } = useWindowDimensions();
  const { user, coupleId } = useApp();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tags, setTags] = useState<Record<string, { title: string; scheduled_date: string }>>({});
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState(false);
  const [caption, setCaption] = useState('');
  const [picked, setPicked] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);

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
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(nextRise, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
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

  async function wipe(p: Photo) {
    Alert.alert('Remove memory?', 'Deletes the file and row on the server.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const ok = await networkUtility.wipePhotoFromServer(p.id, p.storage_path, coupleId);
          if (ok) {
            setPhotos((prev) => prev.filter((x) => x.id !== p.id));
            setActive(0);
          }
        },
      },
    ]);
  }

  const clusterBleedX = 52;
  const clusterBleedStackY = 100;
  const clusterW = polaroidSizing.W + clusterBleedX;
  const stackClusterH = polaroidSizing.H + clusterBleedStackY;
  const previewClusterMinH = polaroidSizing.H + 268;
  const stackCardLeft = Math.round((clusterW - polaroidSizing.W) / 2);
  const stackCardTop = Math.round((stackClusterH - polaroidSizing.H) / 2);

  /** Used in render tree so native driver binds during animation */
  const slideXI = slideAway.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -Math.round(Math.min(polaroidSizing.W * 0.34, 96))],
  });

  const nPhotos = photos.length;
  const nextIdx = nPhotos ? (active + 1) % nPhotos : 0;
  const incomingLayoutMemo = useMemo(() => stackParts(nextIdx, nPhotos || 1, active, polaroidSizing.W), [nextIdx, nPhotos, active, polaroidSizing.W]);
  const riseYI =
    nPhotos > 1
      ? nextRise.interpolate({
          inputRange: [0, 1],
          outputRange: [incomingLayoutMemo.ty - 52, incomingLayoutMemo.ty],
        })
      : null;

  const topPhoto = photos.length ? photos[Math.min(active, photos.length - 1)] : null;

  return (
    <View style={[styles.wrap, { paddingBottom: FAB_SIZE + BOTTOM_BTN_INSET + 10 }]}>
      <Text style={[styles.title, { color: text }]}>Polaroid stack</Text>
      <Text style={[styles.sub, { color: textMuted }]}>Tap the top polaroid · it slides aside as the next one rises onto the pile</Text>

      <View style={styles.stage}>
        <View
          pointerEvents="box-none"
          style={[
            styles.stackClusterBox,
            preview && picked
              ? { width: clusterW, minHeight: previewClusterMinH }
              : { width: clusterW, height: stackClusterH },
          ]}
        >
          {preview && picked ? (
            <View style={[styles.polaroid, { width: polaroidSizing.W, minHeight: polaroidSizing.H, alignSelf: 'center' }]}>
              <Image source={{ uri: picked.uri }} style={styles.img} />
              <Text style={styles.captionHint}>Caption</Text>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Felt-pen caption…"
                placeholderTextColor="#a1a1aa"
                style={styles.captionInput}
                maxLength={42}
              />
              <View style={styles.row}>
                <Pressable
                  style={styles.pill}
                  onPress={() => {
                    setPreview(false);
                    setPicked(null);
                    setCaption('');
                  }}
                >
                  <Text style={styles.pillTxt}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.pill, { backgroundColor: accent }]} onPress={commitUpload} disabled={busy}>
                  <Text style={[styles.pillTxt, { color: '#0a0a0c' }]}>{busy ? 'Saving…' : 'Upload'}</Text>
                </Pressable>
              </View>
            </View>
          ) : photos.length === 0 ? (
            <Pressable
              style={[styles.polaroid, styles.empty, { width: polaroidSizing.W, height: polaroidSizing.H, alignSelf: 'center' }]}
              onPress={pickImage}
            >
              <Text style={styles.bigPlus}>＋</Text>
              <Text style={styles.emptyTxt}>No memories yet</Text>
              <Text style={styles.emptySub}>Tap polaroid or the + button to add</Text>
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
                  </View>
                </View>
              );

              /** Motion wrapper: outgoing top slips left on X; incoming (next index) lifts on Y toward stack slot */
              let wrapped: React.ReactElement = innerCard;
              if (isIncoming && riseYI) {
                wrapped = (
                  <Animated.View style={[styles.motionFill, { transform: [{ translateY: riseYI }] }]}>{innerCard}</Animated.View>
                );
              }
              if (onTop) {
                wrapped = <Animated.View style={[styles.motionFill, { transform: [{ translateX: slideXI }] }]}>{wrapped}</Animated.View>;
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

      {!preview && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete current photo"
            disabled={photos.length === 0}
            onPress={() => {
              if (topPhoto) void wipe(topPhoto);
            }}
            style={[
              styles.deleteFab,
              { bottom: BOTTOM_BTN_INSET, opacity: photos.length === 0 ? 0.35 : 1 },
            ]}
          >
            <Text style={styles.deleteFabGlyph}>✕</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            onPress={pickImage}
            style={[styles.addFab, { backgroundColor: accent, bottom: BOTTOM_BTN_INSET }]}
          >
            <Text style={styles.addFabGlyph}>＋</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 4 },
  title: { fontSize: 15, fontWeight: '900', letterSpacing: 4, textTransform: 'uppercase', color: '#fafafa' },
  sub: { marginTop: 6, fontSize: 11, color: '#71717a', marginBottom: 12 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 0 },
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
    flex: 1,
    width: '100%',
    height: '100%',
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,20,24,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.38,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
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
  captionHint: { marginTop: 8, fontSize: 11, fontWeight: '800', color: '#52525b', letterSpacing: 2, textTransform: 'uppercase' },
  captionInput: {
    marginTop: 6,
    fontSize: 15,
    color: '#27272a',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d4d4d8',
    paddingVertical: 4,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'space-between' },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(10,10,12,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(10,10,12,0.12)',
    alignItems: 'center',
  },
  pillTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', color: '#27272a' },

  deleteFab: {
    position: 'absolute',
    left: 18,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: 'rgba(26,22,26,0.92)',
    borderWidth: StyleSheet.hairlineWidth + 1,
    borderColor: 'rgba(248,113,113,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  deleteFabGlyph: {
    fontSize: 22,
    fontWeight: '300',
    color: '#fca5a5',
    marginTop: -2,
  },
  addFab: {
    position: 'absolute',
    right: 18,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 14,
  },
  addFabGlyph: {
    fontSize: 28,
    fontWeight: '500',
    color: '#0a0a0c',
    marginTop: -3,
    includeFontPadding: false,
  },
});
