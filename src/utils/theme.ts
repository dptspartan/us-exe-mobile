import { moodEmoji } from './moods';

/** Per-mood colors for gradients (matches web semantics). */
export const moodColors: Record<
  string,
  { glow: string; deep: string; accent: string }
> = {
  Happy: { glow: '#fbbf24', deep: '#1e1b4b', accent: '#ec4899' },
  Loving: { glow: '#f472b6', deep: '#2a1020', accent: '#f472b6' },
  Neutral: { glow: '#94a3b8', deep: '#121214', accent: '#ec4899' },
  Tired: { glow: '#818cf8', deep: '#14141a', accent: '#818cf8' },
  Sad: { glow: '#64748b', deep: '#0f1419', accent: '#64748b' },
  Sick: { glow: '#34d399', deep: '#0c1a14', accent: '#f59e0b' },
  Overwhelmed: { glow: '#a855f7', deep: '#180f18', accent: '#a855f7' },
  Angry: { glow: '#ef4444', deep: '#1a0a0a', accent: '#ef4444' },
};

const fallback = moodColors.Neutral;

export function pickMoodPalette(mood: string) {
  return moodColors[mood] || fallback;
}

export interface VibePalette {
  base: string;
  accentMine: string;
  accentPartner: string;
  glowMine: string;
  glowPartner: string;
  deepMine: string;
  deepPartner: string;
}

export function getVibePalette(myMood: string, partnerMood: string): VibePalette {
  const a = pickMoodPalette(myMood || 'Neutral');
  const b = pickMoodPalette(partnerMood || 'Neutral');
  return {
    base: '#0a0a0c',
    accentMine: a.accent,
    accentPartner: b.accent,
    glowMine: a.glow,
    glowPartner: b.glow,
    deepMine: a.deep,
    deepPartner: b.deep,
  };
}

/** Semantic tokens aligned with web `--vibe-*` CSS variables. */
export interface VibeTheme {
  palette: VibePalette;
  accent: string;
  accentPartner: string;
  text: string;
  textMuted: string;
  textFaint: string;
  card: string;
  cardBorder: string;
  inputBg: string;
}

export function buildVibeTheme(myMood: string, partnerMood: string): VibeTheme {
  const palette = getVibePalette(myMood, partnerMood);
  return {
    palette,
    accent: palette.accentMine,
    accentPartner: palette.accentPartner,
    text: '#f4f4f5',
    textMuted: '#a1a1aa',
    textFaint: 'rgba(244,244,245,0.45)',
    card: 'rgba(255, 255, 255, 0.06)',
    cardBorder: 'rgba(255, 255, 255, 0.1)',
    inputBg: 'rgba(10, 12, 22, 0.35)',
  };
}

export function hexAlpha(hex: string, alpha: number) {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  if (hex.startsWith('#') && hex.length === 7) return `${hex}${a}`;
  return hex;
}

export function moodPairLabel(myMood: string, partnerMood: string) {
  return `${moodEmoji[myMood] || '🌙'} ${myMood} · ${moodEmoji[partnerMood] || '🌙'} ${partnerMood}`;
}
