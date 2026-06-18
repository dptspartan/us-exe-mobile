import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { cacheDirectory, downloadAsync } from 'expo-file-system/legacy';
import { networkUtility } from '../api/network';
import { useApp } from '../context/AppContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { hexAlpha } from '../utils/theme';
import type { SavedDoodle } from '../types/doodle';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function DoodleGallerySheet({ visible, onClose }: Props) {
  const { accent, text, textMuted, palette } = useVibeTheme();
  const { user, coupleId } = useApp();
  const [doodles, setDoodles] = useState<SavedDoodle[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewer, setViewer] = useState<SavedDoodle | null>(null);
  const [names, setNames] = useState({ myName: 'You', partnerName: 'Partner' });

  const sheetBg = hexAlpha(palette.deepMine, 0.98);
  const rowBg = hexAlpha(palette.base, 0.55);

  const load = useCallback(async () => {
    if (!coupleId) return;
    setLoading(true);
    try {
      const [rows, n] = await Promise.all([
        networkUtility.getSavedDoodles(coupleId),
        user?.id ? networkUtility.getNamesFromCouple(coupleId, user.id) : null,
      ]);
      setDoodles(rows as SavedDoodle[]);
      if (n && typeof n === 'object') {
        setNames({ myName: n.myName || 'You', partnerName: n.partnerName || 'Partner' });
      }
    } finally {
      setLoading(false);
    }
  }, [coupleId, user?.id]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const saverLabel = useCallback(
    (uploadedBy: string) =>
      networkUtility.resolveSaverName(coupleId!, user!.id, uploadedBy, names),
    [coupleId, user, names],
  );

  const downloadDoodle = useCallback(async (item: SavedDoodle) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo library access to save doodles.');
        return;
      }
      const dest = `${cacheDirectory}doodle-${item.id}.png`;
      await downloadAsync(item.imageUrl, dest);
      await MediaLibrary.saveToLibraryAsync(dest);
      Alert.alert('Saved', 'Doodle saved to your photo library.');
    } catch (err) {
      console.error('Download failed:', err);
      Alert.alert('Download failed', 'Could not save the doodle.');
    }
  }, []);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.backdropTint, { backgroundColor: hexAlpha(palette.base, 0.5) }]} />
        </Pressable>

        <View style={styles.sheetAnchor} pointerEvents="box-none">
          <View style={[styles.sheet, { backgroundColor: sheetBg, borderColor: hexAlpha(accent, 0.2) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: text }]}>Saved doodles</Text>
              <Text style={[styles.subtitle, { color: textMuted }]}>
                Snapshots from your shared canvas
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={[styles.closeBtn, { backgroundColor: hexAlpha(palette.base, 0.6) }]}
            >
              <Ionicons name="close" size={20} color={textMuted} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator color={accent} />
            </View>
          ) : doodles.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: hexAlpha(accent, 0.25), backgroundColor: rowBg }]}>
              <View style={[styles.emptyIcon, { backgroundColor: hexAlpha(accent, 0.12) }]}>
                <Ionicons name="color-palette-outline" size={32} color={accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: text }]}>No doodles saved yet</Text>
              <Text style={[styles.emptySub, { color: textMuted }]}>
                Tap Save on the canvas to pin a doodle to your polaroid wall. They'll show up here too.
              </Text>
            </View>
          ) : (
            <FlatList
              data={doodles}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.row, { borderColor: hexAlpha(accent, 0.15), backgroundColor: rowBg }]}
                  onPress={() => setViewer(item)}
                >
                  <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
                  <View style={styles.meta}>
                    <Text style={[styles.caption, { color: text }]} numberOfLines={1}>
                      {item.caption || 'Untitled doodle'}
                    </Text>
                    <Text style={[styles.rowSub, { color: textMuted }]}>
                      {formatDate(item.created_at)}
                    </Text>
                    <Text style={[styles.rowSub, { color: hexAlpha(textMuted, 0.85) }]}>
                      Saved by {user ? saverLabel(item.uploaded_by) : '…'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void downloadDoodle(item)}
                    hitSlop={8}
                    style={[styles.dlBtn, { borderColor: hexAlpha(accent, 0.35), backgroundColor: hexAlpha(accent, 0.1) }]}
                  >
                    <Ionicons name="download-outline" size={18} color={accent} />
                  </Pressable>
                </Pressable>
              )}
            />
          )}
        </View>
      </View>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewer(null)}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          {viewer ? (
            <Pressable
              style={[styles.viewerCard, { backgroundColor: sheetBg, borderColor: hexAlpha(accent, 0.2) }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Image source={{ uri: viewer.imageUrl }} style={styles.viewerImg} resizeMode="contain" />
              <Text style={[styles.viewerCaption, { color: text }]}>
                {viewer.caption || 'Untitled doodle'}
              </Text>
              <Text style={[styles.viewerMeta, { color: textMuted }]}>
                Saved by {user ? saverLabel(viewer.uploaded_by) : '…'} · {formatDate(viewer.created_at)}
              </Text>
              <Pressable
                style={[styles.viewerDl, { backgroundColor: accent }]}
                onPress={() => void downloadDoodle(viewer)}
              >
                <Text style={styles.viewerDlTxt}>Download</Text>
              </Pressable>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropTint: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetAnchor: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '74%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 12,
    marginBottom: 4,
  },
  title: { fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  subtitle: { fontSize: 11, marginTop: 4 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBlock: { paddingVertical: 48, alignItems: 'center' },
  emptyCard: {
    marginHorizontal: 4,
    marginBottom: 12,
    padding: 28,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 10,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptySub: { fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 280 },
  list: { paddingBottom: 8, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  thumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: '#222' },
  meta: { flex: 1, gap: 3 },
  caption: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 11 },
  dlBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  viewerCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  viewerImg: { width: '100%', height: 300, borderRadius: 12, backgroundColor: '#111' },
  viewerCaption: { fontSize: 15, fontWeight: '700' },
  viewerMeta: { fontSize: 12 },
  viewerDl: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  viewerDlTxt: { color: '#0a0a0c', fontWeight: '800', fontSize: 13 },
});
