import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSparks } from '../../context/SparksContext';

const HEART = '❤️';
const COUNT = 36;
const DURATION_MS = 7200;

type HeartSpec = {
  emoji: string;
  startX: number;
  endX: number;
  size: number;
  delay: number;
  startY: number;
};

function buildSpecs(width: number, height: number): HeartSpec[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const startX = width * (0.02 + Math.random() * 0.96);
    const travel = width * (0.15 + Math.random() * 0.35) * (Math.random() > 0.5 ? 1 : -1);
    return {
      emoji: HEART,
      startX,
      endX: Math.max(8, Math.min(width - 24, startX + travel)),
      size: 14 + Math.random() * 26,
      delay: Math.random() * 1400,
      startY: height * (0.35 + Math.random() * 0.55),
    };
  });
}

function FloatingHeart({
  spec,
  height,
}: {
  spec: HeartSpec;
  height: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      delay: spec.delay,
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: true,
    }).start();
  }, [progress, spec.delay]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -height * 1.05],
  });

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [spec.startX, spec.endX],
  });

  const opacity = progress.interpolate({
    inputRange: [0, 0.06, 0.75, 1],
    outputRange: [0, 1, 1, 0],
  });

  const scale = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.35, 1, 0.85],
  });

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-12deg', '18deg'],
  });

  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.heart,
        {
          top: spec.startY,
          fontSize: spec.size,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }, { rotate }],
        },
      ]}
    >
      {spec.emoji}
    </Animated.Text>
  );
}

export function FloatingHeartsOverlay() {
  const { heartsVisible, heartsBurstId } = useSparks();
  const { width, height } = useWindowDimensions();
  const specs = useMemo(() => buildSpecs(width, height), [heartsBurstId, width, height]);

  if (!heartsVisible) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent presentationStyle="overFullScreen">
      <View style={styles.fill} pointerEvents="none">
        {specs.map((spec, i) => (
          <FloatingHeart key={`${heartsBurstId}-${i}`} spec={spec} height={height} />
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  heart: {
    position: 'absolute',
    left: 0,
  },
});
