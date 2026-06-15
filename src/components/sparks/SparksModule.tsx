import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
  blob: { top?: number; left?: number; right?: number; bottom?: number; rotate: string };
  gradient: [string, string];
};

const ACTIONS: SparkAction[] = [
  {
    type: 'buzz',
    label: 'Buzz',
    hint: 'gentle shake on their phone',
    icon: 'flash',
    blob: { top: 8, left: 4, rotate: '-8deg' },
    gradient: ['#818cf8', '#6366f1'],
  },
  {
    type: 'love_you',
    label: 'Love you',
    hint: 'a soft I love you',
    icon: 'heart',
    blob: { top: 52, right: 8, rotate: '6deg' },
    gradient: ['#f472b6', '#ec4899'],
  },
  {
    type: 'need_hugs',
    label: 'Need hugs',
    hint: 'one minute to hug back',
    icon: 'happy',
    blob: { bottom: 24, left: 18, rotate: '-4deg' },
    gradient: ['#fbbf24', '#f59e0b'],
  },
];

export function SparksModule() {
  const { sending, sendSparkAction, partnerName } = useSparks();
  const { accent, accentPartner, text, textMuted, palette } = useVibeTheme();
  const [lastSent, setLastSent] = useState<SparkType | null>(null);

  async function tap(type: SparkType) {
    await sendSparkAction(type);
    setLastSent(type);
    setTimeout(() => setLastSent(null), 1800);
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: hexAlpha(accentPartner, 0.85) }]}>Our Sparks</Text>
        <Text style={[styles.whisper, { color: textMuted }]}>
          Little signals for {partnerName}
        </Text>
      </View>

      <View style={styles.pond}>
        <View
          style={[styles.aura, { backgroundColor: hexAlpha(palette.glowPartner, 0.12) }]}
          pointerEvents="none"
        />
        <View
          style={[styles.auraInner, { backgroundColor: hexAlpha(accent, 0.08) }]}
          pointerEvents="none"
        />

        {ACTIONS.map((action) => {
          const sent = lastSent === action.type;
          return (
            <Pressable
              key={action.type}
              disabled={sending}
              onPress={() => void tap(action.type)}
              style={({ pressed }) => [
                styles.blobPress,
                action.blob,
                { transform: [{ rotate: action.blob.rotate }] },
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
  header: { paddingHorizontal: 6, marginBottom: 8 },
  kicker: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontStyle: 'italic',
  },
  whisper: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  pond: {
    flex: 1,
    minHeight: 320,
    position: 'relative',
    marginTop: 12,
  },
  aura: {
    position: 'absolute',
    top: '18%',
    left: '8%',
    right: '8%',
    height: '55%',
    borderRadius: 999,
  },
  auraInner: {
    position: 'absolute',
    top: '32%',
    left: '22%',
    right: '22%',
    height: '32%',
    borderRadius: 999,
  },
  blobPress: {
    position: 'absolute',
    alignItems: 'center',
    maxWidth: 130,
  },
  blobPressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
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
    paddingHorizontal: 12,
    paddingBottom: 8,
    fontStyle: 'italic',
  },
});
