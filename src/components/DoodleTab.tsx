import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Canvas, Path, Skia, useCanvasRef } from '@shopify/react-native-skia';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { networkUtility } from '../api/network';
import { useDoodleCanvas } from '../hooks/useDoodleCanvas';
import { useApp } from '../context/AppContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { hexAlpha } from '../utils/theme';
import { strokeToPixelPath } from '../utils/doodleMerge';
import type { DoodleStroke } from '../types/doodle';
import { DoodleGallerySheet } from './DoodleGallerySheet';

/** Fixed width:height — same proportions on every device. */
const CANVAS_ASPECT = 4 / 5;
const FAB_SIZE = 46;
const BRUSH_SIZES = [3, 5, 8, 12];
const INSET = 10;
const ORB_GAP = 4;
const ORB_SIZE = 26;

function strokeToPath(stroke: DoodleStroke, canvasW: number, canvasH: number) {
  const { points, width } = strokeToPixelPath(stroke, canvasW, canvasH);
  const path = Skia.Path.Make();
  if (points.length === 0) return { path, width };
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    path.lineTo(points[i].x, points[i].y);
  }
  return { path, width };
}

function fitAspectBox(areaW: number, areaH: number, aspect: number) {
  if (areaW <= 0 || areaH <= 0) return { width: 0, height: 0 };
  let height = areaH;
  let width = height * aspect;
  if (width > areaW) {
    width = areaW;
    height = width / aspect;
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}

export function DoodleTab() {
  const vibe = useVibeTheme();
  const { accent, text, textMuted, cardBorder, inputBg, palette } = vibe;
  const { user, coupleId } = useApp();

  const canvasRef = useCanvasRef();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [slotSize, setSlotSize] = useState({ width: 0, height: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const {
    strokes,
    loading,
    color,
    setColor,
    brushWidth,
    setBrushWidth,
    colors,
    startStroke,
    extendStroke,
    endStroke,
    clearCanvas,
    undoLastStroke,
    canUndo,
    setCanvasSize: setHookCanvasSize,
  } = useDoodleCanvas(coupleId, user?.id ?? null);

  const canvasDimensions = useMemo(
    () => fitAspectBox(slotSize.width, slotSize.height, CANVAS_ASPECT),
    [slotSize],
  );

  useEffect(() => {
    if (canvasDimensions.width > 0 && canvasDimensions.height > 0) {
      setCanvasSize(canvasDimensions);
      setHookCanvasSize(canvasDimensions.width, canvasDimensions.height);
    }
  }, [canvasDimensions, setHookCanvasSize]);

  const onSlotLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSlotSize({ width, height });
  }, []);

  const overlayActive = saveOpen || clearOpen;
  const canvasReady = canvasSize.width > 0 && canvasSize.height > 0;
  const sheetBg = hexAlpha(palette.deepMine, 0.96);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!overlayActive && !pickerOpen)
        .onStart((e) => {
          runOnJS(startStroke)(e.x, e.y);
        })
        .onUpdate((e) => {
          runOnJS(extendStroke)(e.x, e.y);
        })
        .onEnd(() => {
          runOnJS(endStroke)();
        }),
    [startStroke, extendStroke, endStroke, overlayActive, pickerOpen],
  );

  const openSave = useCallback(() => {
    if (strokes.length === 0) return;
    setPickerOpen(false);
    setCaption('');
    setClearOpen(false);
    setSaveOpen(true);
  }, [strokes.length]);

  const openClear = useCallback(() => {
    if (strokes.length === 0) return;
    setPickerOpen(false);
    setSaveOpen(false);
    setClearOpen(true);
  }, [strokes.length]);

  const closeOverlays = useCallback(() => {
    if (saving) return;
    setSaveOpen(false);
    setClearOpen(false);
  }, [saving]);

  const commitClear = useCallback(async () => {
    setClearOpen(false);
    await clearCanvas();
  }, [clearCanvas]);

  const commitSave = useCallback(async () => {
    if (!coupleId || !user?.id || saving) return;
    const snapshot = canvasRef.current?.makeImageSnapshot();
    if (!snapshot) return;
    setSaving(true);
    try {
      const bytes = snapshot.encodeToBytes();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await networkUtility.saveDoodleSnapshot(coupleId, user.id, buffer, caption.trim());
      setSaveOpen(false);
      setCaption('');
    } catch (err) {
      console.error('Failed to save doodle:', err);
    } finally {
      setSaving(false);
    }
  }, [coupleId, user?.id, saving, caption, canvasRef]);

  const pickColor = useCallback(
    (c: string) => {
      setColor(c);
    },
    [setColor],
  );

  const pickSize = useCallback(
    (w: number) => {
      setBrushWidth(w);
    },
    [setBrushWidth],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={[styles.hint, { color: textMuted }]} numberOfLines={1}>
          Shared canvas
        </Text>
        <View style={styles.topActions}>
          <Pressable
            onPress={undoLastStroke}
            disabled={overlayActive || !canUndo}
            hitSlop={8}
            accessibilityLabel="Undo last stroke"
            style={[styles.iconBtn, (overlayActive || !canUndo) && styles.iconBtnDisabled]}
          >
            <Ionicons name="arrow-undo-outline" size={18} color={textMuted} />
          </Pressable>
          <Pressable
            onPress={openClear}
            disabled={overlayActive || strokes.length === 0}
            hitSlop={8}
            style={[styles.iconBtn, (overlayActive || strokes.length === 0) && styles.iconBtnDisabled]}
          >
            <Ionicons name="trash-outline" size={18} color="#f87171" />
          </Pressable>
          <Pressable
            onPress={openSave}
            disabled={overlayActive || strokes.length === 0}
            hitSlop={8}
            style={[styles.iconBtn, (overlayActive || strokes.length === 0) && styles.iconBtnDisabled]}
          >
            <Ionicons name="save-outline" size={18} color={accent} />
          </Pressable>
        </View>
      </View>

      <View style={styles.canvasSlot} onLayout={onSlotLayout}>
        <View
          style={[
            styles.canvasFrame,
            {
              width: canvasDimensions.width,
              height: canvasDimensions.height,
              borderColor: cardBorder,
            },
          ]}
        >
          <View style={styles.canvasInner}>
            {loading || !canvasReady ? (
              <ActivityIndicator color={accent} style={StyleSheet.absoluteFill} />
            ) : (
              <GestureDetector gesture={pan}>
                <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
                  {strokes.map((stroke) => {
                    const { path, width } = strokeToPath(stroke, canvasSize.width, canvasSize.height);
                    return (
                      <Path
                        key={stroke.id}
                        path={path}
                        color={stroke.color}
                        style="stroke"
                        strokeWidth={width}
                        strokeCap="round"
                        strokeJoin="round"
                      />
                    );
                  })}
                </Canvas>
              </GestureDetector>
            )}

            {strokes.length === 0 && canvasReady && !overlayActive ? (
              <View style={styles.canvasEmpty} pointerEvents="none">
                <Ionicons name="brush-outline" size={26} color={hexAlpha(textMuted, 0.45)} />
                <Text style={[styles.canvasEmptyTxt, { color: textMuted }]}>Draw together</Text>
              </View>
            ) : null}

            {overlayActive ? (
              <View style={styles.overlay}>
                <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={[styles.overlayTint, { backgroundColor: hexAlpha(palette.base, 0.55) }]} />

                {saveOpen ? (
                  <View style={[styles.overlayCard, { backgroundColor: sheetBg, borderColor: cardBorder }]}>
                    <View style={[styles.overlayIcon, { backgroundColor: hexAlpha(accent, 0.15) }]}>
                      <Ionicons name="image-outline" size={22} color={accent} />
                    </View>
                    <Text style={[styles.overlayTitle, { color: text }]}>Save to polaroid wall</Text>
                    <Text style={[styles.overlaySub, { color: textMuted }]}>
                      Optional caption for the Wall
                    </Text>
                    <TextInput
                      value={caption}
                      onChangeText={setCaption}
                      placeholder="A little note…"
                      placeholderTextColor={textMuted}
                      maxLength={42}
                      autoFocus
                      style={[
                        styles.captionInput,
                        { color: text, backgroundColor: inputBg, borderColor: cardBorder },
                      ]}
                    />
                    <View style={styles.overlayActions}>
                      <Pressable
                        style={[styles.overlayBtn, styles.overlayBtnGhost, { borderColor: cardBorder }]}
                        onPress={closeOverlays}
                        disabled={saving}
                      >
                        <Text style={[styles.overlayBtnTxt, { color: textMuted }]}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.overlayBtn, { backgroundColor: accent }]}
                        onPress={() => void commitSave()}
                        disabled={saving}
                      >
                        <Text style={[styles.overlayBtnTxt, { color: '#0a0a0c' }]}>
                          {saving ? 'Saving…' : 'Save'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {clearOpen ? (
                  <View style={[styles.overlayCard, { backgroundColor: sheetBg, borderColor: cardBorder }]}>
                    <View style={[styles.overlayIcon, { backgroundColor: hexAlpha('#f87171', 0.12) }]}>
                      <Ionicons name="warning-outline" size={22} color="#f87171" />
                    </View>
                    <Text style={[styles.overlayTitle, { color: text }]}>Clear shared canvas?</Text>
                    <Text style={[styles.overlaySub, { color: textMuted }]}>
                      Removes all strokes for both of you. Saved polaroids stay.
                    </Text>
                    <View style={styles.overlayActions}>
                      <Pressable
                        style={[styles.overlayBtn, styles.overlayBtnGhost, { borderColor: cardBorder }]}
                        onPress={closeOverlays}
                      >
                        <Text style={[styles.overlayBtnTxt, { color: textMuted }]}>Keep</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.overlayBtn, { backgroundColor: '#dc2626' }]}
                        onPress={() => void commitClear()}
                      >
                        <Text style={[styles.overlayBtnTxt, { color: '#fff' }]}>Clear</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {pickerOpen && !overlayActive ? (
              <Pressable style={styles.pickerDismiss} onPress={() => setPickerOpen(false)} />
            ) : null}

            <View style={styles.inCanvasPicker} pointerEvents="box-none">
              {pickerOpen && !overlayActive ? (
                <View style={[styles.pickerColumn, { gap: ORB_GAP, marginBottom: ORB_GAP }]}>
                  {[...BRUSH_SIZES].reverse().map((w) => (
                    <Pressable
                      key={`size-${w}`}
                      onPress={() => pickSize(w)}
                      style={[
                        styles.pickerOrb,
                        {
                          width: ORB_SIZE,
                          height: ORB_SIZE,
                          borderRadius: ORB_SIZE / 2,
                          borderColor: brushWidth === w ? accent : cardBorder,
                          backgroundColor: hexAlpha(palette.deepMine, 0.94),
                        },
                      ]}
                    >
                      <View
                        style={{
                          width: w + 2,
                          height: w + 2,
                          borderRadius: 99,
                          backgroundColor: color,
                        }}
                      />
                    </Pressable>
                  ))}
                  <View style={[styles.pickerDivider, { backgroundColor: hexAlpha(accent, 0.35) }]} />
                  {[...colors].reverse().map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => pickColor(c)}
                      style={[
                        styles.pickerOrb,
                        styles.colorOrb,
                        {
                          width: ORB_SIZE,
                          height: ORB_SIZE,
                          borderRadius: ORB_SIZE / 2,
                          backgroundColor: c,
                          borderColor: color === c ? accent : 'rgba(255,255,255,0.2)',
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Brush and color"
                onPress={() => setPickerOpen((v) => !v)}
                disabled={overlayActive}
                style={[
                  styles.brushFab,
                  {
                    borderColor: pickerOpen ? accent : hexAlpha(cardBorder, 0.85),
                    backgroundColor: hexAlpha(palette.deepMine, 0.88),
                  },
                  overlayActive && styles.iconBtnDisabled,
                ]}
              >
                <View
                  style={[
                    styles.brushFabDot,
                    { backgroundColor: color, width: brushWidth + 10, height: brushWidth + 10 },
                  ]}
                />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open saved doodles"
              onPress={() => {
                setPickerOpen(false);
                setGalleryOpen(true);
              }}
              disabled={overlayActive}
              style={[
                styles.historyFab,
                { backgroundColor: hexAlpha(palette.deepMine, 0.88), borderColor: hexAlpha(accent, 0.45) },
                overlayActive && styles.iconBtnDisabled,
              ]}
            >
              <Ionicons name="time-outline" size={20} color={accent} />
            </Pressable>
          </View>
        </View>
      </View>

      <DoodleGallerySheet visible={galleryOpen} onClose={() => setGalleryOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingRight: 4,
  },
  hint: { fontSize: 11, flex: 1, letterSpacing: 0.3 },
  topActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: { opacity: 0.3 },
  canvasSlot: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasFrame: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    backgroundColor: '#1a1a1e',
  },
  canvasInner: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  canvasEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  canvasEmptyTxt: { fontSize: 11, fontWeight: '600' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  overlayTint: { ...StyleSheet.absoluteFillObject },
  overlayCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 8,
    zIndex: 2,
  },
  overlayIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayTitle: { fontSize: 16, fontWeight: '900' },
  overlaySub: { fontSize: 11, lineHeight: 16 },
  captionInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    fontSize: 14,
    marginTop: 4,
  },
  overlayActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  overlayBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  overlayBtnGhost: { backgroundColor: 'rgba(255,255,255,0.04)' },
  overlayBtnTxt: { fontSize: 12, fontWeight: '800' },
  brushFab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  brushFabDot: { borderRadius: 99 },
  inCanvasPicker: {
    position: 'absolute',
    left: INSET,
    bottom: INSET,
    alignItems: 'center',
    zIndex: 6,
  },
  historyFab: {
    position: 'absolute',
    top: INSET,
    right: INSET,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 6,
  },
  pickerColumn: {
    alignItems: 'center',
  },
  pickerOrb: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  colorOrb: {
    borderWidth: 1.5,
  },
  pickerDivider: {
    width: 3,
    height: 3,
    borderRadius: 2,
    marginVertical: 1,
  },
  pickerDismiss: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
});
