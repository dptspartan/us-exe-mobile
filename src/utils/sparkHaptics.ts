import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

/** Partner "buzz" — sharp attention pattern on the receiver device. */
export async function playBuzzPattern() {
  if (Platform.OS === 'android') {
    Vibration.vibrate([0, 90, 70, 90, 70, 140, 50, 200]);
  } else {
    Vibration.vibrate([0, 100, 80, 100, 80, 180]);
  }

  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 120);
    setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 260);
  } catch {
    /* simulator / unsupported */
  }
}
