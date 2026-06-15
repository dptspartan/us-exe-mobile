import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSparks } from '../../context/SparksContext';
import { useVibeTheme } from '../../hooks/useVibeTheme';
import { hexAlpha } from '../../utils/theme';

export function HugRequestModal() {
  const insets = useSafeAreaInsets();
  const { pendingHug, partnerName, sendHugBack, hugSending, dismissHug } = useSparks();
  const { accentPartner, palette, text, textMuted } = useVibeTheme();

  if (!pendingHug) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent presentationStyle="overFullScreen">
      <View style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <LinearGradient
          colors={[hexAlpha(palette.deepPartner, 0.88), hexAlpha('#0a0a0c', 0.94)]}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.panel, { borderColor: hexAlpha(accentPartner, 0.35) }]}>
          <View style={[styles.panelGlow, { backgroundColor: hexAlpha(accentPartner, 0.12) }]} />

          <View style={styles.panelInner}>
            <Text style={[styles.eyebrow, { color: textMuted }]}>right now</Text>
            <Text style={[styles.title, { color: text }]}>
              {partnerName} needs a hug!
            </Text>
            <Text style={[styles.sub, { color: textMuted }]}>
              Send one back before the moment fades.
            </Text>

            <Pressable
              disabled={hugSending}
              onPress={() => void sendHugBack()}
              style={({ pressed }) => [styles.ctaOuter, pressed && styles.ctaPressed]}
            >
              <LinearGradient
                colors={[accentPartner, hexAlpha(accentPartner, 0.75)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cta}
              >
                <Text style={styles.ctaTxt}>
                  {hugSending ? 'Sending…' : 'Send hug back'}
                </Text>
              </LinearGradient>
            </Pressable>

            <Pressable onPress={dismissHug} style={styles.later} hitSlop={14}>
              <Text style={[styles.laterTxt, { color: textMuted }]}>Not right now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    backgroundColor: 'rgba(12, 12, 18, 0.92)',
  },
  panelGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  panelInner: {
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 30,
    paddingHorizontal: 4,
  },
  sub: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  ctaOuter: {
    marginTop: 28,
    width: '100%',
    alignSelf: 'stretch',
  },
  cta: {
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  ctaTxt: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0a0a0c',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  later: { marginTop: 22, paddingVertical: 12, paddingHorizontal: 16 },
  laterTxt: { fontSize: 13, fontWeight: '600' },
});
