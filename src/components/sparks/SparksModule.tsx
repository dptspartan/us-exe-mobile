import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSparks } from '../../context/SparksContext';
import { useVibeTheme } from '../../hooks/useVibeTheme';
import { hexAlpha } from '../../utils/theme';
import type { SparkType } from '../../types/sparks';

type SparkAction = {
  type: SparkType;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  offsetX: number;
  offsetY: number;
  rotate: string;
  gradient: [string, string];
};

const ACTIONS: SparkAction[] = [
  {
    type: 'buzz',
    label: 'Buzz',
    hint: 'gentle shake on their phone',
    icon: 'flash',
    offsetX: -108,
    offsetY: -108,
    rotate: '-8deg',
    gradient: ['#818cf8', '#6366f1'],
  },
  {
    type: 'love_you',
    label: 'Love you',
    hint: 'a soft I love you',
    icon: 'heart',
    offsetX: 104,
    offsetY: -92,
    rotate: '6deg',
    gradient: ['#f472b6', '#ec4899'],
  },
  {
    type: 'need_hugs',
    label: 'Need hugs',
    hint: 'one minute to hug back',
    icon: 'happy',
    offsetX: -58,
    offsetY: 102,
    rotate: '-4deg',
    gradient: ['#fbbf24', '#f59e0b'],
  },
];

type AuraLayer = {
  seed: number;
  size: number;
  opacity: number;
  driftX: number;
  driftY: number;
  scaleRange: [number, number];
  duration: number;
  delay: number;
};

const AURA_LAYERS: AuraLayer[] = [
  { seed: 0, size: 1.55, opacity: 0.12, driftX: 5, driftY: 4, scaleRange: [0.8, 1.18], duration: 5200, delay: 0 },
  { seed: 1, size: 1.12, opacity: 0.1, driftX: 4, driftY: 5, scaleRange: [0.84, 1.14], duration: 4600, delay: 800 },
  { seed: 2, size: 0.78, opacity: 0.08, driftX: 3, driftY: 3, scaleRange: [0.88, 1.1], duration: 4000, delay: 1500 },
];

function useAuraMotion(layer: AuraLayer) {
  const motion = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const main = Animated.loop(
      Animated.sequence([
        Animated.delay(layer.delay),
        Animated.timing(motion, {
          toValue: 1,
          duration: layer.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: layer.duration * 0.88,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const side = Animated.loop(
      Animated.sequence([
        Animated.delay(layer.delay + layer.seed * 220),
        Animated.timing(wobble, {
          toValue: 1,
          duration: layer.duration * 0.72,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(wobble, {
          toValue: 0,
          duration: layer.duration * 0.64,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    main.start();
    side.start();
    return () => {
      main.stop();
      side.stop();
    };
  }, [layer, motion, wobble]);

  const translateX = motion.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, layer.driftX * 0.6, -layer.driftX * 0.4],
  });
  const translateY = motion.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -layer.driftY * 0.4, layer.driftY * 0.5],
  });
  const breatheScale = motion.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [layer.scaleRange[0], layer.scaleRange[1], layer.scaleRange[0]],
  });
  const pulseScale = wobble.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.97, 1.03, 0.97],
  });
  const scale = Animated.multiply(breatheScale, pulseScale);
  const opacity = motion.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [layer.opacity * 0.82, layer.opacity, layer.opacity * 0.82],
  });

  return { translateX, translateY, scale, opacity };
}

function BreathingAura({
  color,
  layer,
}: {
  color: string;
  layer: AuraLayer;
}) {
  const { translateX, translateY, scale, opacity } = useAuraMotion(layer);
  const base = AURA_BASE * layer.size;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.auraBlob,
        {
          width: base,
          height: base * (0.88 + layer.seed * 0.08),
          marginLeft: -base / 2,
          marginTop: -(base * (0.88 + layer.seed * 0.08)) / 2,
          backgroundColor: color,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    />
  );
}

const AURA_BASE = 320;

export function SparksModule() {
  const { sending, sendSparkAction } = useSparks();
  const { accent, text, textMuted, palette } = useVibeTheme();
  const [lastSent, setLastSent] = useState<SparkType | null>(null);

  async function tap(type: SparkType) {
    await sendSparkAction(type);
    setLastSent(type);
    setTimeout(() => setLastSent(null), 1800);
  }

  return (
    <View style={styles.root}>
      <View style={styles.pond}>
        <View style={styles.auraHub} pointerEvents="none">
          <BreathingAura color={hexAlpha(palette.glowPartner, 1)} layer={AURA_LAYERS[0]} />
          <BreathingAura color={hexAlpha(accent, 1)} layer={AURA_LAYERS[1]} />
          <BreathingAura color={hexAlpha(palette.glowPartner, 1)} layer={AURA_LAYERS[2]} />
        </View>

        <View style={styles.sparkCluster}>
          {ACTIONS.map((action) => {
            const sent = lastSent === action.type;
            return (
              <Pressable
                key={action.type}
                disabled={sending}
                onPress={() => void tap(action.type)}
                style={({ pressed }) => [
                  styles.blobPress,
                  {
                    transform: [
                      { translateX: action.offsetX },
                      { translateY: action.offsetY },
                      { rotate: action.rotate },
                      ...(pressed ? [{ scale: 0.96 }] : []),
                    ],
                  },
                  pressed && styles.blobPressed,
                ]}
              >
              <LinearGradient
                colors={action.gradient}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.blob}
              >
                {sending && lastSent === null ? null : sent ? (
                  <Text style={styles.sentMark}>✓</Text>
                ) : (
                  <Ionicons name={action.icon} size={26} color="#0a0a0c" />
                )}
              </LinearGradient>
              <Text style={[styles.blobLabel, { color: text }]}>{action.label}</Text>
              <Text style={[styles.blobHint, { color: textMuted }]}>{action.hint}</Text>
            </Pressable>
          );
        })}
        </View>

        {sending && (
          <View style={styles.sendingPill}>
            <ActivityIndicator size="small" color={accent} />
            <Text style={[styles.sendingTxt, { color: textMuted }]}>reaching them…</Text>
          </View>
        )}
      </View>

      <Text style={[styles.footer, { color: textMuted }]}>
        Sparks travel in real time — hugs wait one minute for a reply.
      </Text>
    </View>
  );
}

const BLOB = 88;

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 6 },
  pond: {
    flex: 1,
    minHeight: 320,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  auraHub: {
    position: 'absolute',
    top: '44%',
    left: '50%',
    width: 0,
    height: 0,
    zIndex: 0,
  },
  auraBlob: {
    position: 'absolute',
    borderRadius: 999,
  },
  sparkCluster: {
    position: 'absolute',
    top: '38%',
    left: '50%',
    width: 0,
    height: 0,
    zIndex: 2,
  },
  blobPress: {
    position: 'absolute',
    alignItems: 'center',
    maxWidth: 130,
    marginLeft: -BLOB / 2,
  },
  blobPressed: { opacity: 0.9 },
  blob: {
    width: BLOB,
    height: BLOB,
    borderRadius: BLOB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  sentMark: { fontSize: 28, fontWeight: '900', color: '#0a0a0c' },
  blobLabel: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  blobHint: {
    marginTop: 2,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
    maxWidth: 120,
  },
  sendingPill: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  sendingTxt: { fontSize: 11, fontWeight: '600' },
  footer: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingBottom: 8,
    fontStyle: 'italic',
  },
});
