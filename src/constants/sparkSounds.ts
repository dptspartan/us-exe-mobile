import type { SparkType } from '../types/sparks';

/** Filenames bundled via expo-notifications plugin `sounds` (must match exactly). */
export const SPARK_SOUND_FILES = {
  buzz: 'buzz.wav',
  love_you: 'love_you.wav',
  need_hugs: 'need_hugs.wav',
} as const;

export function sparkNotificationSound(type: SparkType): string {
  if (type === 'buzz') return SPARK_SOUND_FILES.buzz;
  if (type === 'love_you') return SPARK_SOUND_FILES.love_you;
  if (type === 'need_hugs') return SPARK_SOUND_FILES.need_hugs;
  if (type === 'hug_returned') return SPARK_SOUND_FILES.love_you;
  return 'default';
}
