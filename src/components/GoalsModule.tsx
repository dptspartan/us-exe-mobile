import { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { networkUtility } from '../api/network';
import { useCoupleRealtime } from '../hooks/useCoupleRealtime';
import { useApp } from '../context/AppContext';
import { useVibeTheme } from '../hooks/useVibeTheme';

type Todo = { id: string; task: string; is_completed: boolean };

type DiaryRow = Record<string, unknown> & {
  id: string;
  title: string;
  scheduled_date: string;
  location?: string | null;
  is_completed: boolean;
  notes?: { id: string; user_id: string; notes?: string; rating?: number | null }[];
  photos?: { id: string; photo_wall?: { id: string; storage_path: string; imageUrl?: string } }[];
};

const FILTERS = ['all', 'pending', 'completed'] as const;

function formatDisplayDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isUpcoming(d: DiaryRow) {
  if (d.is_completed) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scheduled = new Date(`${d.scheduled_date}T12:00:00`);
  return scheduled >= today;
}

function StarRow({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Pressable key={s} disabled={disabled} onPress={() => onChange(s)}>
          <Text style={{ fontSize: 18, color: s <= value ? '#f472b6' : '#3f3f46' }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function GoalsModule() {
  const { accent, text, textMuted, inputBg, cardBorder } = useVibeTheme();
  const { user, coupleId } = useApp();
  const [deskTab, setDeskTab] = useState<'goals' | 'dates'>('goals');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('pending');

  const [todos, setTodos] = useState<Todo[]>([]);
  const [task, setTask] = useState('');
  const [todoBusy, setTodoBusy] = useState(false);

  const loadTodos = useCallback(async () => {
    if (!coupleId) return;
    const rows = await networkUtility.getTodos(coupleId);
    setTodos((rows || []) as Todo[]);
  }, [coupleId]);
  const { reload: reloadTodos } = useCoupleRealtime(coupleId, 'todos', loadTodos);

  const [dates, setDates] = useState<DiaryRow[]>([]);
  const [sel, setSel] = useState<DiaryRow | null>(null);
  const loadDates = useCallback(async () => {
    if (!coupleId) return;
    try {
      const rows = await networkUtility.getDiaryDates(coupleId);
      setDates((rows || []) as DiaryRow[]);
    } catch (e) {
      console.error(e);
    }
  }, [coupleId]);
  useCoupleRealtime(coupleId, 'date_diary', loadDates);

  const [title, setTitle] = useState('');
  const [scheduled, setScheduled] = useState('');
  const [loc, setLoc] = useState('');
  const [dateBusy, setDateBusy] = useState(false);

  const [noteText, setNoteText] = useState('');
  const [noteRating, setNoteRating] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);

  const filteredTodos = todos.filter((t) => {
    if (filter === 'pending') return !t.is_completed;
    if (filter === 'completed') return t.is_completed;
    return true;
  });

  const filteredDates = dates.filter((d) => {
    if (filter === 'completed') return d.is_completed;
    if (filter === 'pending') return isUpcoming(d);
    return true;
  });

  async function addTodo() {
    const trimmed = task.trim();
    if (!trimmed || !coupleId || todoBusy) return;
    setTodoBusy(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic = { id: tempId, task: trimmed, is_completed: false, couple_id: coupleId };
    setTodos((p) => [optimistic as Todo, ...p]);
    setTask('');
    try {
      const created = (await networkUtility.createTodo(coupleId, trimmed)) as Todo;
      setTodos((p) => p.map((row) => (row.id === tempId ? created : row)));
    } catch {
      setTodos((p) => p.filter((row) => row.id !== tempId));
      reloadTodos();
    } finally {
      setTodoBusy(false);
    }
  }

  async function toggleTodo(row: Todo) {
    const next = !row.is_completed;
    setTodos((p) => p.map((t) => (t.id === row.id ? { ...t, is_completed: next } : t)));
    try {
      await networkUtility.toggleTodo(row.id, next);
    } catch {
      reloadTodos();
    }
  }

  async function deleteTodo(id: string) {
    if (String(id).startsWith('temp-')) return;
    setTodos((p) => p.filter((t) => t.id !== id));
    try {
      await networkUtility.deleteTodo(id, coupleId);
    } catch {
      reloadTodos();
    }
  }

  async function planDate() {
    if (!title.trim() || !scheduled || !coupleId || dateBusy) return;
    setDateBusy(true);
    try {
      await networkUtility.createDiaryDate(coupleId, {
        title: title.trim(),
        scheduled_date: scheduled,
        location: loc.trim() || '',
      });
      setTitle('');
      setScheduled('');
      setLoc('');
      await loadDates();
    } finally {
      setDateBusy(false);
    }
  }

  async function openDetail(d: DiaryRow) {
    setSel(d);
    setNoteText('');
    setNoteRating(0);
  }

  async function toggleDone(d: DiaryRow) {
    const next = !d.is_completed;
    setDates((p) => p.map((row) => (row.id === d.id ? { ...row, is_completed: next } : row)));
    if (sel?.id === d.id) setSel({ ...sel, is_completed: next });
    try {
      await networkUtility.toggleDateCompletion(d.id, next, coupleId);
    } catch {
      loadDates();
    }
  }

  async function addDiaryNote() {
    if (!sel || !user?.id || !noteText.trim()) return;
    setDateBusy(true);
    try {
      await (
        networkUtility.appendDiaryNote as (
          a: string,
          b: string,
          c: string,
          d: number | null | undefined,
          e: string | null | undefined
        ) => Promise<unknown>
      )(sel.id, user.id, noteText, noteRating > 0 ? noteRating : null, coupleId);
      setNoteText('');
      setNoteRating(0);
      await loadDates();
      const fresh = await networkUtility.getDiaryDates(coupleId);
      const found = ((fresh || []) as DiaryRow[]).find((x) => x.id === sel.id);
      if (found) setSel(found);
    } finally {
      setDateBusy(false);
    }
  }

  async function pickDiaryPhoto() {
    if (!sel?.is_completed || !coupleId || !user?.id || photoBusy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    setPhotoBusy(true);
    try {
      await networkUtility.uploadPhotoToDiaryDate(coupleId, user.id, sel.id, res.assets[0], sel.title);
      await loadDates();
      const fresh = await networkUtility.getDiaryDates(coupleId);
      const found = ((fresh || []) as DiaryRow[]).find((x) => x.id === sel.id);
      if (found) setSel(found);
    } catch (e) {
      console.error(e);
    } finally {
      setPhotoBusy(false);
    }
  }

  /** Small inner pad only — dashboard stage already reserves bottom safe + FAB space */
  const listContentStyle = { flexGrow: 1 as const, paddingBottom: 14 };

  return (
    <View style={styles.shell}>
      <View style={styles.toolbar}>
        <Pressable style={[styles.tab, deskTab === 'goals' && { borderColor: accent }]} onPress={() => setDeskTab('goals')}>
          <Text style={[styles.tabTxt, deskTab === 'goals' && { color: accent }]}>Goals</Text>
        </Pressable>
        <Pressable style={[styles.tab, deskTab === 'dates' && { borderColor: accent }]} onPress={() => setDeskTab('dates')}>
          <Text style={[styles.tabTxt, deskTab === 'dates' && { color: accent }]}>Dates</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && { backgroundColor: accent + '44' }]}>
            <Text style={[styles.chipTxt, filter === f && { color: text }]}>
              {deskTab === 'dates' && f === 'pending' ? 'Upcoming' : f}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        {deskTab === 'goals' ? (
          <>
            <View style={styles.addRow}>
              <TextInput
                value={task}
                onChangeText={setTask}
                placeholder="New couple goal…"
                placeholderTextColor="#71717a"
                style={styles.addIn}
              />
              <Pressable style={[styles.addBtn, { backgroundColor: accent }]} onPress={addTodo} disabled={!task.trim() || todoBusy}>
                <Text style={styles.addBtnTxt}>Add</Text>
              </Pressable>
            </View>
            <FlatList
              data={filteredTodos}
              keyExtractor={(it) => it.id}
              style={{ flex: 1 }}
              contentContainerStyle={listContentStyle}
              ListEmptyComponent={<Text style={styles.empty}>Queue empty · nice work</Text>}
              renderItem={({ item }) => (
                <View style={styles.goalRow}>
                  <Pressable onPress={() => toggleTodo(item)} style={styles.checkbox}>
                    <View style={[styles.dot, item.is_completed && { backgroundColor: accent, borderColor: accent }]} />
                  </Pressable>
                  <Text style={[styles.goalTxt, item.is_completed && styles.goalDone]}>{item.task}</Text>
                  <Pressable onPress={() => deleteTodo(item.id)}>
                    <Text style={styles.kill}>✕</Text>
                  </Pressable>
                </View>
              )}
            />
          </>
        ) : (
          <>
            <View style={styles.formBox}>
              <TextInput value={title} onChangeText={setTitle} placeholder="Date title" placeholderTextColor="#71717a" style={styles.field} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput value={scheduled} onChangeText={setScheduled} placeholder="YYYY-MM-DD" placeholderTextColor="#71717a" style={[styles.field, { flex: 1 }]} />
                <Pressable style={[styles.addBtn, { backgroundColor: accent }]} onPress={planDate} disabled={!title.trim() || !scheduled || dateBusy}>
                  <Text style={styles.addBtnTxt}>Plan</Text>
                </Pressable>
              </View>
              <TextInput value={loc} onChangeText={setLoc} placeholder="Location (optional)" placeholderTextColor="#71717a" style={styles.field} />
            </View>
            <FlatList
              data={filteredDates}
              keyExtractor={(it) => it.id}
              style={{ flex: 1 }}
              contentContainerStyle={listContentStyle}
              ListEmptyComponent={<Text style={styles.empty}>No dates · plan magic</Text>}
              renderItem={({ item }) => (
                <Pressable style={styles.dateRow} onPress={() => openDetail(item)}>
                  <View style={[styles.bullet, item.is_completed ? { backgroundColor: '#22c55e' } : isUpcoming(item) ? { backgroundColor: accent } : { backgroundColor: '#52525b' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dateTitle}>{item.title}</Text>
                    <Text style={styles.dateSub}>{formatDisplayDate(item.scheduled_date)}</Text>
                  </View>
                  <Text style={styles.chev}>→</Text>
                </Pressable>
              )}
            />
          </>
        )}
      </View>

      <Modal visible={!!sel} animationType="slide" transparent onRequestClose={() => setSel(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            {sel ? (
              <>
                <Pressable onPress={() => setSel(null)}>
                  <Text style={styles.back}>← Back</Text>
                </Pressable>
                <Text style={styles.mTitle}>{sel.title}</Text>
                <Text style={styles.mSub}>{formatDisplayDate(sel.scheduled_date)}</Text>
                {sel.location ? <Text style={styles.mLoc}>📍 {sel.location}</Text> : null}
                <Pressable style={styles.doneBtn} onPress={() => toggleDone(sel)}>
                  <Text style={styles.doneTxt}>{sel.is_completed ? 'Reopen' : 'Mark finished'}</Text>
                </Pressable>

                <Text style={styles.section}>Reflections</Text>
                {(sel.notes || []).map((n) => (
                  <View key={n.id} style={[styles.noteCard, n.user_id === user?.id ? { borderColor: accent + '55' } : {}]}>
                    <Text style={styles.noteWho}>{n.user_id === user?.id ? 'You' : 'Partner'}</Text>
                    <Text style={styles.noteBody}>{n.notes || ''}</Text>
                    {n.rating ? <Text style={{ color: accent }}>{'★'.repeat(n.rating)}</Text> : null}
                  </View>
                ))}

                <Text style={styles.section}>Add note</Text>
                <TextInput
                  value={noteText}
                  onChangeText={setNoteText}
                  multiline
                  placeholder="How was it?"
                  placeholderTextColor="#71717a"
                  style={styles.noteIn}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <StarRow value={noteRating} onChange={setNoteRating} disabled={dateBusy} />
                  <Pressable style={[styles.addBtn, { backgroundColor: accent }]} onPress={addDiaryNote} disabled={!noteText.trim() || dateBusy}>
                    <Text style={styles.addBtnTxt}>Save</Text>
                  </Pressable>
                </View>

                {sel.is_completed ? (
                  <>
                    <Text style={[styles.section, { marginTop: 16 }]}>Date photos</Text>
                    <Pressable style={styles.photoBtn} onPress={pickDiaryPhoto} disabled={photoBusy}>
                      <Text style={styles.photoBtnTxt}>{photoBusy ? 'Uploading…' : '＋ Link polaroid'}</Text>
                    </Pressable>
                    {(sel.photos || []).map((ph) => (
                      <Text key={ph.id} style={styles.photoLine}>
                        · {ph.photo_wall?.imageUrl ? 'Memory linked' : 'Photo'}
                      </Text>
                    ))}
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(16,16,20,0.78)' },
  toolbar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase', color: '#71717a' },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.04)' },
  chipTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', color: '#71717a' },
  body: { flex: 1, paddingHorizontal: 12, paddingBottom: 0 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  addIn: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#3f3f46', color: '#fafafa', paddingVertical: 8, fontSize: 14 },
  addBtn: { justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12 },
  addBtnTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', color: '#0a0a0c' },
  goalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.04)' },
  checkbox: { paddingTop: 4 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#52525b' },
  goalTxt: { flex: 1, color: '#e4e4e7', fontSize: 14, fontWeight: '600' },
  goalDone: { textDecorationLine: 'line-through', color: '#71717a' },
  kill: { color: '#71717a', paddingHorizontal: 6, fontSize: 16 },
  empty: { textAlign: 'center', color: '#52525b', marginTop: 28, fontSize: 12 },
  formBox: { gap: 8, marginBottom: 10 },
  field: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 8, color: '#fafafa', backgroundColor: 'rgba(10,12,22,0.35)', fontSize: 13 },
  dateRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.04)' },
  bullet: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  dateTitle: { fontSize: 14, fontWeight: '700', color: '#fafafa' },
  dateSub: { marginTop: 2, fontSize: 11, color: '#71717a' },
  chev: { color: '#52525b', fontSize: 18 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#141418', padding: 22, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '88%' },
  back: { color: '#f472b6', fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 10 },
  mTitle: { fontSize: 20, fontWeight: '900', color: '#fafafa', textTransform: 'uppercase' },
  mSub: { marginTop: 4, fontSize: 12, color: '#a1a1aa' },
  mLoc: { marginTop: 6, fontSize: 12, color: '#f472b6bb' },
  doneBtn: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  doneTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 2, color: '#e4e4e7', textTransform: 'uppercase' },
  section: { marginTop: 18, fontSize: 10, fontWeight: '900', letterSpacing: 3, color: '#71717a', textTransform: 'uppercase' },
  noteCard: { marginTop: 8, padding: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)' },
  noteWho: { fontSize: 9, fontWeight: '900', letterSpacing: 2, color: '#a1a1aa', textTransform: 'uppercase' },
  noteBody: { marginTop: 6, fontSize: 13, color: '#e4e4e7', lineHeight: 20 },
  noteIn: { marginTop: 8, minHeight: 80, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)', padding: 12, color: '#fafafa', textAlignVertical: 'top' },
  photoBtn: { marginTop: 10, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(244,114,182,0.35)', alignItems: 'center' },
  photoBtnTxt: { fontSize: 12, fontWeight: '800', color: '#f472b6' },
  photoLine: { marginTop: 6, fontSize: 12, color: '#a1a1aa' },
});
