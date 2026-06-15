import React, { createContext, useCallback, useContext, useState } from 'react';
import { networkUtility } from '../api/network';
import { useCoupleRealtime } from '../hooks/useCoupleRealtime';
import { useApp } from './AppContext';

type MoodContextValue = {
  mine: string;
  theirs: string;
  updateMood: (m: string) => Promise<void>;
  saving: boolean;
  reloadMoods: () => Promise<void>;
};

const MoodContext = createContext<MoodContextValue | null>(null);

export function MoodProvider({ children }: { children: React.ReactNode }) {
  const { user, coupleId, partnerId } = useApp();
  const [mine, setMine] = useState('Neutral');
  const [theirs, setTheirs] = useState('Neutral');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!coupleId) return;
    try {
      const moods = await networkUtility.getMoods(coupleId);
      const rowMine = moods.find((m: { user_id: string }) => m.user_id === user?.id);
      const rowTheirs = moods.find((m: { user_id: string }) => m.user_id === partnerId);
      setMine(rowMine?.mood_type || 'Neutral');
      setTheirs(rowTheirs?.mood_type || 'Neutral');
    } catch (e) {
      console.error(e);
    }
  }, [coupleId, user?.id, partnerId]);

  const { reload } = useCoupleRealtime(coupleId, 'moods', load, {
    userIdField: 'user_id',
    currentUserId: user?.id,
  });

  const updateMood = async (newMood: string) => {
    if (!coupleId || !user?.id || saving) return;
    setSaving(true);
    const prev = mine;
    setMine(newMood);
    try {
      await networkUtility.updateMood(coupleId, user.id, newMood);
    } catch {
      setMine(prev);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <MoodContext.Provider
      value={{ mine, theirs, updateMood, saving, reloadMoods: reload }}
    >
      {children}
    </MoodContext.Provider>
  );
}

export function useMood() {
  const ctx = useContext(MoodContext);
  if (!ctx) throw new Error('useMood must be inside MoodProvider');
  return ctx;
}
