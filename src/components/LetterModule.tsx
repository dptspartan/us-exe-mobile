import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LetterTab } from './LetterTab';
import { DoodleTab } from './DoodleTab';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { hexAlpha } from '../utils/theme';

type LetterMode = 'letter' | 'doodle';

export function LetterModule() {
  const vibe = useVibeTheme();
  const { accent, textMuted, card, cardBorder } = vibe;
  const [mode, setMode] = useState<LetterMode>('letter');

  return (
    <View style={styles.wrap}>
      <View style={[styles.seg, { backgroundColor: card, borderColor: cardBorder }]}>
        {(['letter', 'doodle'] as const).map((tab) => {
          const active = mode === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => setMode(tab)}
              style={[
                styles.segBtn,
                active && { backgroundColor: hexAlpha(accent, 0.2), borderColor: hexAlpha(accent, 0.45) },
              ]}
            >
              <Text style={[styles.segTxt, { color: active ? accent : textMuted }]}>
                {tab === 'letter' ? 'Letter' : 'Doodle'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'letter' ? <LetterTab /> : <DoodleTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingTop: 4,
    minHeight: 0,
  },
  seg: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    padding: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
