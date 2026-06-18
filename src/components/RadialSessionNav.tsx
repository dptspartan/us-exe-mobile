import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IoniconName, SessionId } from './sessionTiles';
import { SESSION_TILES } from './sessionTiles';
import { hexAlpha } from '../utils/theme';

const FAB = 56;
const RING = 48;
const INNER = 36;
const LABEL_H = 10;
const FAB_GAP_BOTTOM = 6;
const NAV_SURFACE = 'rgba(8, 8, 12, 0.96)';
const OPEN_MS = 340;
const CLOSE_MS = 260;
const STAGGER_MS = 34;

export function sessionDockOccupiedHeight(_insetsBottom?: number): number {
  return 0;
}

export function stageSafeBottomInset(insetsBottom: number) {
  const aboveFabGap = 12;
  const extraMargin = 10;
  return Math.max(insetsBottom, FAB_GAP_BOTTOM) + FAB + aboveFabGap + extraMargin;
}

type Props = {
  active: SessionId;
  onSelect: (id: SessionId) => void;
  accent: string;
};

export function RadialSessionNav({ active, onSelect, accent }: Props) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const [overlayMounted, setOverlayMounted] = useState(false);
  const closingRef = useRef(false);

  const bottomPad = Math.max(insets.bottom, FAB_GAP_BOTTOM);
  const hubCenterX = W / 2;
  const hubCenterY = H - bottomPad - FAB / 2;

  const backdropOp = useRef(new Animated.Value(0)).current;
  const arcProgress = useRef(SESSION_TILES.map(() => new Animated.Value(0))).current;
  const floatPhase = useRef(new Animated.Value(0)).current;
  const floatLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const nodeW = RING + 6;
  const arcLayout = useMemo(
    () => computeUpperSemicircleSlots(W, hubCenterX, hubCenterY, nodeW, insets.top),
    [W, hubCenterX, hubCenterY, nodeW, insets.top],
  );

  const stopFloat = useCallback(() => {
    floatLoopRef.current?.stop();
    floatLoopRef.current = null;
    floatPhase.stopAnimation();
    floatPhase.setValue(0);
  }, [floatPhase]);

  const startFloat = useCallback(() => {
    stopFloat();
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(floatPhase, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatPhase, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    floatLoopRef.current = bob;
    bob.start();
  }, [floatPhase, stopFloat]);

  const animateOpen = useCallback(() => {
    if (overlayMounted || closingRef.current) return;
    closingRef.current = false;
    backdropOp.setValue(0);
    arcProgress.forEach((p) => p.setValue(0));
    setOverlayMounted(true);

    requestAnimationFrame(() => {
      Animated.timing(backdropOp, {
        toValue: 1,
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      Animated.stagger(
        STAGGER_MS,
        arcProgress.map((p) =>
          Animated.timing(p, {
            toValue: 1,
            duration: OPEN_MS,
            easing: Easing.out(Easing.back(1.06)),
            useNativeDriver: true,
          }),
        ),
      ).start(({ finished }) => {
        if (finished) startFloat();
      });
    });
  }, [arcProgress, backdropOp, overlayMounted, startFloat]);

  const animateClose = useCallback(
    (after?: () => void) => {
      if (!overlayMounted || closingRef.current) {
        after?.();
        return;
      }
      closingRef.current = true;
      stopFloat();

      const reversed = [...arcProgress].reverse();
      Animated.parallel([
        Animated.timing(backdropOp, {
          toValue: 0,
          duration: CLOSE_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        ...reversed.map((p, i) =>
          Animated.timing(p, {
            toValue: 0,
            duration: CLOSE_MS,
            delay: i * 20,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ),
      ]).start(({ finished }) => {
        closingRef.current = false;
        if (finished) {
          setOverlayMounted(false);
          after?.();
        }
      });
    },
    [arcProgress, backdropOp, overlayMounted, stopFloat],
  );

  const activeTile = SESSION_TILES.find((t) => t.id === active) ?? SESSION_TILES[0];

  function pick(id: SessionId) {
    onSelect(id);
    animateClose();
  }

  function toggleMenu() {
    if (overlayMounted) animateClose();
    else animateOpen();
  }

  const collapsedLeft = hubCenterX - nodeW / 2;
  const collapsedTop = hubCenterY - RING / 2;
  const nodeStackH = RING + 5 + LABEL_H;

  const floatY = floatPhase.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -4],
  });

  return (
    <>
      {overlayMounted ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <Animated.View style={[styles.backdrop, { opacity: backdropOp }]} pointerEvents="none" />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => animateClose()}
            accessibilityLabel="Close menu"
          />

          {SESSION_TILES.map((tile, i) => {
            const slot = arcLayout.slots[i];
            const prog = arcProgress[i];
            const selected = tile.id === active;

            const dx = slot.ox - collapsedLeft;
            const dy = slot.oy - collapsedTop;

            const tx = prog.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
            const ty = prog.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
            const scale = prog.interpolate({ inputRange: [0, 1], outputRange: [0.28, 1] });
            const op = prog.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1] });

            const bob = selected
              ? floatY
              : floatPhase.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -2],
                });

            return (
              <Animated.View
                key={tile.id}
                style={[
                  styles.arcItemWrap,
                  {
                    left: collapsedLeft,
                    top: collapsedTop,
                    width: nodeW,
                    height: nodeStackH,
                    opacity: op,
                    transform: [
                      { translateX: tx },
                      { translateY: Animated.add(ty, bob) },
                      { scale },
                    ],
                  },
                ]}
                pointerEvents="box-none"
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={tile.title}
                  onPress={() => pick(tile.id)}
                  style={[styles.nodePress, { width: nodeW }]}
                >
                  <View
                    style={[
                      styles.ringFrame,
                      {
                        borderColor: selected ? accent : 'rgba(255,255,255,0.1)',
                        borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.innerDisc,
                        {
                          backgroundColor: selected ? hexAlpha(accent, 0.18) : NAV_SURFACE,
                        },
                      ]}
                    />
                    <Ionicons
                      name={tile.icon}
                      size={20}
                      color={selected ? accent : 'rgba(244,244,245,0.55)'}
                      style={styles.tileIcon}
                    />
                  </View>
                  <Text style={[styles.tileLbl, selected && { color: accent }]} numberOfLines={1}>
                    {tile.title}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      ) : null}

      <View pointerEvents="box-none" style={[styles.hubDock, { paddingBottom: bottomPad }]}>
        <FabButton
          open={overlayMounted}
          icon={activeTile.icon}
          accent={accent}
          onPress={toggleMenu}
          accessibilityLabel={overlayMounted ? 'Close sessions' : 'Open sessions'}
        />
      </View>
    </>
  );
}

function computeUpperSemicircleSlots(
  W: number,
  hubCx: number,
  hubCy: number,
  nodeW: number,
  insetTop: number,
): { slots: { ox: number; oy: number }[] } {
  const n = SESSION_TILES.length;
  const horizontalPad = 11;
  const Rcap = Math.max(88, hubCx - horizontalPad - nodeW / 2);
  const dTheta = n <= 1 ? Math.PI : Math.PI / (n - 1);
  const minChord = nodeW * 1.02;
  const Rchord = minChord / (2 * Math.sin(dTheta / 2));
  const Rbase = Math.max(Rchord, 100);
  const R = Math.min(Rcap, Rbase * 1.12 + 14);
  const slots: { ox: number; oy: number }[] = [];

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const theta = Math.PI - t * Math.PI;
    slots.push({
      ox: hubCx + R * Math.cos(theta) - nodeW / 2,
      oy: hubCy - R * Math.sin(theta) - RING / 2,
    });
  }

  const minY = Math.max(insetTop + 20, 36);
  for (let j = 0; j < slots.length; j++) {
    slots[j].ox = Math.min(W - nodeW - horizontalPad, Math.max(horizontalPad, slots[j].ox));
    slots[j].oy = Math.max(minY, slots[j].oy);
  }
  return { slots };
}

function FabButton({
  open,
  icon,
  accent,
  onPress,
  accessibilityLabel,
}: {
  open?: boolean;
  icon?: IoniconName;
  accent: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}>
      <View
        style={[
          styles.fabPlate,
          { borderColor: hexAlpha(accent, open ? 0.75 : 0.35), backgroundColor: NAV_SURFACE },
        ]}
      >
        {open ? (
          <Ionicons name="close" size={22} color={accent} />
        ) : (
          <Ionicons name={icon ?? 'apps-outline'} size={24} color={accent} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 45,
  },
  hubDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 55,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  fabPlate: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    borderWidth: StyleSheet.hairlineWidth + 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 4, 8, 0.82)',
  },
  arcItemWrap: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 40,
  },
  nodePress: {
    alignItems: 'center',
    width: RING + 14,
  },
  ringFrame: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerDisc: {
    position: 'absolute',
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
    alignSelf: 'center',
    zIndex: 1,
  },
  tileIcon: {
    zIndex: 2,
  },
  tileLbl: {
    marginTop: 3,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(244,244,245,0.45)',
    textAlign: 'center',
    maxWidth: RING + 16,
    height: LABEL_H,
  },
});
