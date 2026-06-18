import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { SessionId } from './sessionTiles';

const EXIT_MS = 160;
const ENTER_MS = 280;

type Props = {
  session: SessionId;
  children: (session: SessionId) => ReactNode;
};

export function SessionStage({ session, children }: Props) {
  const [visible, setVisible] = useState(session);
  const [mounted, setMounted] = useState<Set<SessionId>>(() => new Set([session]));
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const queued = useRef<SessionId | null>(null);

  useEffect(() => {
    setMounted((prev) => {
      if (prev.has(session)) return prev;
      const next = new Set(prev);
      next.add(session);
      return next;
    });
  }, [session]);

  useEffect(() => {
    if (session === visible) return;

    function finishEnter(next: SessionId) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ENTER_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: ENTER_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        busy.current = false;
        const pending = queued.current;
        queued.current = null;
        if (pending && pending !== next) {
          transitionTo(pending);
        }
      });
    }

    function transitionTo(next: SessionId) {
      if (busy.current) {
        queued.current = next;
        return;
      }
      busy.current = true;

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: EXIT_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 10,
          duration: EXIT_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) {
          busy.current = false;
          return;
        }
        setVisible(next);
        opacity.setValue(0);
        translateY.setValue(-12);
        requestAnimationFrame(() => finishEnter(next));
      });
    }

    transitionTo(session);
  }, [session, visible, opacity, translateY]);

  return (
    <View style={styles.stage}>
      {Array.from(mounted).map((id) => {
        const active = id === visible;
        return (
          <View
            key={id}
            style={[styles.layer, !active && styles.layerHidden]}
            pointerEvents={active ? 'auto' : 'none'}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
          >
            {active ? (
              <Animated.View style={[styles.content, { opacity, transform: [{ translateY }] }]}>
                {children(id)}
              </Animated.View>
            ) : (
              <View style={styles.content}>{children(id)}</View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  layerHidden: {
    opacity: 0,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
});
