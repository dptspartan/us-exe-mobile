export const MOOD_OPTIONS = [
  'Happy',
  'Loving',
  'Neutral',
  'Tired',
  'Sad',
  'Sick',
  'Overwhelmed',
  'Angry',
] as const;

export type MoodName = (typeof MOOD_OPTIONS)[number];

export const moodEmoji: Record<string, string> = {
  Happy: '☀️',
  Loving: '💗',
  Neutral: '🌙',
  Tired: '😴',
  Sad: '🌧️',
  Sick: '🤒',
  Overwhelmed: '🌀',
  Angry: '⚡',
};
