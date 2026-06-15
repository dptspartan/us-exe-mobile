import { useMemo } from 'react';
import { useMood } from '../context/MoodContext';
import { buildVibeTheme, type VibeTheme } from '../utils/theme';

export function useVibeTheme(): VibeTheme {
  const { mine, theirs } = useMood();
  return useMemo(() => buildVibeTheme(mine, theirs), [mine, theirs]);
}
