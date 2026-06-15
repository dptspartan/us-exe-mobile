import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { getVibePalette, hexAlpha } from '../utils/theme';

export function VibeBackground({
  myMood,
  partnerMood,
}: {
  myMood: string;
  partnerMood: string;
}) {
  const p = getVibePalette(myMood, partnerMood);
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[p.deepMine, p.base, p.deepPartner]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[hexAlpha(p.glowMine, 0.35), 'transparent']}
        start={{ x: 0.05, y: 0.05 }}
        end={{ x: 0.9, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', hexAlpha(p.glowPartner, 0.38)]}
        start={{ x: 0.1, y: 0.55 }}
        end={{ x: 0.95, y: 0.98 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
