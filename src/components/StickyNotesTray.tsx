import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { networkUtility } from '../api/network';
import { useCoupleRealtime } from '../hooks/useCoupleRealtime';
import { useApp } from '../context/AppContext';
import { notifyPartnerStickyNote, initNotificationBehavior } from '../lib/notifications';

type Row = { id: string; content?: string };

type Props = { partnerName: string };

export function StickyNotesTray({ partnerName }: Props) {
  const { user, coupleId } = useApp();
  const [notes, setNotes] = useState<Row[]>([]);
  const seen = useRef(new Set<string>());
  const firstHydrate = useRef(true);

  useEffect(() => {
    void initNotificationBehavior();
  }, []);

  const load = useCallback(async () => {
    if (!coupleId || !user?.id) return;
    const fetched = (await networkUtility.getActiveIncomingNotes(coupleId, user.id)) || [];
    const next = fetched as Row[];

    setNotes((prev) => {
      if (firstHydrate.current) {
        firstHydrate.current = false;
        next.forEach((r) => seen.current.add(r.id));
        return next;
      }

      const prevIds = new Set(prev.map((n) => n.id));
      for (const r of next) {
        const isNew = !prevIds.has(r.id);
        if (!seen.current.has(r.id)) seen.current.add(r.id);
        if (isNew && AppState.currentState !== 'active') {
          void notifyPartnerStickyNote(partnerName);
        }
      }
      return next;
    });
  }, [coupleId, user?.id, partnerName]);


  useCoupleRealtime(coupleId, 'sticky_notes', load, {
    userIdField: 'author_id',
    currentUserId: user?.id,
  });

  async function dismiss(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await networkUtility.clearStickyNote(id);
  }

  const top = notes[0];

  if (!top) return null;

  return (
    <Modal visible transparent animationType="fade" presentationStyle="overFullScreen">
      <View style={styles.scrim}>
        <ScrollView style={styles.card} contentContainerStyle={styles.pad}>
          <View style={styles.row}>
            <Text style={styles.badge}>Partner note 📌</Text>
            <View style={styles.dot} />
          </View>
          <Text style={styles.copy}>{top.content ?? ''}</Text>
          <Pressable style={styles.btn} accessibilityRole="button" onPress={() => dismiss(top.id)}>
            <Text style={styles.btnTxt}>Dismiss</Text>
          </Pressable>

          {notes.length > 1 ? (
            <Text style={styles.more}>+ {notes.length - 1} more after this</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(10,11,14,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 26,
  },
  card: {
    maxHeight: '70%',
    width: '100%',
    borderRadius: 22,
    backgroundColor: 'rgba(34,34,40,0.98)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  pad: { padding: 24, gap: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    paddingBottom: 10,
    marginBottom: 4,
  },
  badge: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: '#f472b6',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(244,114,182,0.35)' },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(244,244,245,0.92)',
    fontWeight: '600',
  },
  btn: {
    alignSelf: 'flex-end',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(52,52,58,1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  btnTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.9)',
  },
  more: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
});
