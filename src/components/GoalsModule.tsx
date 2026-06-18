import { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { networkUtility } from '../api/network';
import { useCoupleRealtime } from '../hooks/useCoupleRealtime';
import { useApp } from '../context/AppContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { hexAlpha } from '../utils/theme';

type Todo = { id: string; task: string; is_completed: boolean };

type DiaryRow = Record<string, unknown> & {
  id: string;
  title: string;
  scheduled_date: string;
  location?: string | null;
  is_completed: boolean;
  notes?: { id: string; user_id: string; notes?: string; rating?: number | null }[];
  photos?: {
    id: string;
    photo_wall?: { id: string; storage_path: string; imageUrl?: string; caption?: string };
  }[];
};

const FILTERS = ['all', 'pending', 'completed'] as const;
type DeskTab = 'goals' | 'dates';
type SheetTab = 'notes' | 'memories';

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

function filterLabel(f: (typeof FILTERS)[number], deskTab: DeskTab) {
  if (deskTab === 'dates' && f === 'pending') return 'Upcoming';
  return f;
}

function StarRow({
  value,
  onChange,
  disabled,
  accent,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  accent: string;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Pressable key={s} disabled={disabled} onPress={() => onChange(s)} hitSlop={4}>
          <Text style={{ fontSize: 20, color: s <= value ? accent : hexAlpha('#71717a', 0.55) }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function GoalsModule() {
  const { accent, text, textMuted, textFaint, card, cardBorder, inputBg, palette } = useVibeTheme();
  const { user, coupleId } = useApp();
  const [deskTab, setDeskTab] = useState<DeskTab>('goals');
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
  const [sheetTab, setSheetTab] = useState<SheetTab>('notes');

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

  const listContentStyle = { flexGrow: 1 as const, paddingBottom: 14 };

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
    setSheetTab('notes');
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

  const fieldBorder = hexAlpha(cardBorder, 0.65);

  return (
    <View style={styles.wrap}>
      <View style={styles.content}>
      <View style={[styles.seg, { backgroundColor: card, borderColor: cardBorder }]}>
        {(['goals', 'dates'] as const).map((tab) => {
          const active = deskTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => setDeskTab(tab)}
              style={[
                styles.segBtn,
                active && { backgroundColor: hexAlpha(accent, 0.2), borderColor: hexAlpha(accent, 0.45) },
              ]}
            >
              <Ionicons
                name={tab === 'goals' ? 'checkbox-outline' : 'calendar-outline'}
                size={14}
                color={active ? accent : textMuted}
                style={styles.segIcon}
              />
              <Text style={[styles.segTxt, { color: active ? accent : textMuted }]}>
                {tab === 'goals' ? 'Goals' : 'Dates'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.chip,
                { borderColor: active ? hexAlpha(accent, 0.4) : 'transparent' },
                active && { backgroundColor: hexAlpha(accent, 0.14) },
              ]}
            >
              <Text style={[styles.chipTxt, { color: active ? accent : textMuted }]}>
                {filterLabel(f, deskTab)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {deskTab === 'goals' ? (
        <>
          <View style={[styles.composeRow, { borderBottomColor: fieldBorder }]}>
            <TextInput
              value={task}
              onChangeText={setTask}
              placeholder="New couple goal…"
              placeholderTextColor={textFaint}
              style={[styles.composeIn, { color: text }]}
              onSubmitEditing={() => void addTodo()}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.cta, { backgroundColor: accent }, (!task.trim() || todoBusy) && { opacity: 0.45 }]}
              onPress={addTodo}
              disabled={!task.trim() || todoBusy}
            >
              <Text style={styles.ctaTxt}>{todoBusy ? '…' : 'Add'}</Text>
            </Pressable>
          </View>

          <FlatList
            data={filteredTodos}
            keyExtractor={(it) => it.id}
            style={styles.list}
            contentContainerStyle={listContentStyle}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: textMuted }]}>Queue empty · nice work</Text>
            }
            renderItem={({ item }) => (
              <View style={[styles.goalRow, { borderBottomColor: hexAlpha(cardBorder, 0.45) }]}>
                <Pressable onPress={() => toggleTodo(item)} style={styles.checkbox} hitSlop={6}>
                  <View
                    style={[
                      styles.checkRing,
                      { borderColor: item.is_completed ? accent : textMuted },
                      item.is_completed && { backgroundColor: hexAlpha(accent, 0.25) },
                    ]}
                  >
                    {item.is_completed ? (
                      <Ionicons name="checkmark" size={12} color={accent} />
                    ) : null}
                  </View>
                </Pressable>
                <Text
                  style={[
                    styles.goalTxt,
                    { color: text },
                    item.is_completed && { color: textMuted, textDecorationLine: 'line-through' },
                  ]}
                >
                  {item.task}
                </Text>
                {!item.is_completed ? (
                  <Pressable onPress={() => deleteTodo(item.id)} hitSlop={8} accessibilityLabel="Delete goal">
                    <Ionicons name="close" size={17} color="#fca5a5" />
                  </Pressable>
                ) : (
                  <View style={styles.deleteSpacer} />
                )}
              </View>
            )}
          />
        </>
      ) : (
        <>
          <View style={styles.dateForm}>
            <Text style={[styles.fieldLab, { color: textMuted }]}>Plan a date</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Date title"
              placeholderTextColor={textFaint}
              style={[styles.fieldIn, { color: text, borderBottomColor: fieldBorder }]}
            />
            <View style={styles.dateRowInputs}>
              <TextInput
                value={scheduled}
                onChangeText={setScheduled}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={textFaint}
                style={[styles.fieldIn, styles.dateField, { color: text, borderBottomColor: fieldBorder }]}
              />
              <Pressable
                style={[
                  styles.cta,
                  { backgroundColor: accent },
                  (!title.trim() || !scheduled || dateBusy) && { opacity: 0.45 },
                ]}
                onPress={planDate}
                disabled={!title.trim() || !scheduled || dateBusy}
              >
                <Text style={styles.ctaTxt}>{dateBusy ? '…' : 'Plan'}</Text>
              </Pressable>
            </View>
            <TextInput
              value={loc}
              onChangeText={setLoc}
              placeholder="Location (optional)"
              placeholderTextColor={textFaint}
              style={[styles.fieldIn, { color: text, borderBottomColor: fieldBorder }]}
            />
          </View>

          <FlatList
            data={filteredDates}
            keyExtractor={(it) => it.id}
            style={styles.list}
            contentContainerStyle={listContentStyle}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: textMuted }]}>No dates · plan something sweet</Text>
            }
            renderItem={({ item }) => {
              const statusColor = item.is_completed ? '#22c55e' : isUpcoming(item) ? accent : textMuted;
              return (
                <Pressable
                  style={[styles.dateRow, { borderBottomColor: hexAlpha(cardBorder, 0.45) }]}
                  onPress={() => openDetail(item)}
                >
                  <View style={[styles.datePip, { backgroundColor: hexAlpha(statusColor, 0.85) }]} />
                  <View style={styles.dateMeta}>
                    <Text style={[styles.dateTitle, { color: text }]}>{item.title}</Text>
                    <Text style={[styles.dateSub, { color: textMuted }]}>
                      {formatDisplayDate(item.scheduled_date)}
                      {item.location ? ` · ${item.location}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={textFaint} />
                </Pressable>
              );
            }}
          />
        </>
      )}
      </View>

      <Modal visible={!!sel} animationType="slide" transparent onRequestClose={() => setSel(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSel(null)}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: hexAlpha(palette.base, 0.45) }]} />
          </Pressable>

          <View style={styles.sheetAnchor} pointerEvents="box-none">
            <View
              style={[
                styles.sheet,
                { borderColor: hexAlpha(accent, 0.22), backgroundColor: hexAlpha(palette.deepMine, 0.88) },
              ]}
            >
              <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
              <View
                style={[StyleSheet.absoluteFill, { backgroundColor: hexAlpha(palette.deepMine, 0.55) }]}
              />

              {sel ? (
                <ScrollView
                  style={styles.sheetScroll}
                  contentContainerStyle={styles.sheetPad}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={[styles.sheetHandle, { backgroundColor: hexAlpha(cardBorder, 0.8) }]} />

                  <View style={styles.sheetHeader}>
                    <View style={styles.sheetHeaderMeta}>
                      <Text style={[styles.mTitle, { color: text }]} numberOfLines={2}>
                        {sel.title}
                      </Text>
                      <Text style={[styles.mSub, { color: textMuted }]}>
                        {formatDisplayDate(sel.scheduled_date)}
                      </Text>
                      {sel.location ? (
                        <View style={styles.locRow}>
                          <Ionicons name="location-outline" size={13} color={accent} />
                          <Text style={[styles.mLoc, { color: hexAlpha(accent, 0.9) }]} numberOfLines={1}>
                            {sel.location}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Pressable onPress={() => setSel(null)} hitSlop={12} style={styles.sheetClose}>
                      <Ionicons name="close" size={22} color={textMuted} />
                    </Pressable>
                  </View>

                  <Pressable
                    style={[styles.doneBtn, { borderColor: hexAlpha(cardBorder, 0.7) }]}
                    onPress={() => toggleDone(sel)}
                  >
                    <Text style={[styles.doneTxt, { color: text }]}>
                      {sel.is_completed ? 'Reopen date' : 'Mark finished'}
                    </Text>
                  </Pressable>

                  {sel.is_completed ? (
                    <>
                      <View style={[styles.sheetSeg, { backgroundColor: card, borderColor: cardBorder }]}>
                        {(['notes', 'memories'] as const).map((tab) => {
                          const active = sheetTab === tab;
                          return (
                            <Pressable
                              key={tab}
                              onPress={() => setSheetTab(tab)}
                              style={[
                                styles.sheetSegBtn,
                                active && {
                                  backgroundColor: hexAlpha(accent, 0.2),
                                  borderColor: hexAlpha(accent, 0.45),
                                },
                              ]}
                            >
                              <Ionicons
                                name={tab === 'notes' ? 'document-text-outline' : 'images-outline'}
                                size={14}
                                color={active ? accent : textMuted}
                              />
                              <Text style={[styles.sheetSegTxt, { color: active ? accent : textMuted }]}>
                                {tab === 'notes' ? 'Notes' : 'Memories'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {sheetTab === 'notes' ? (
                        <>
                          {(sel.notes || []).length === 0 ? (
                            <Text style={[styles.hint, { color: textFaint, marginTop: 16 }]}>
                              No notes yet — add one below
                            </Text>
                          ) : (
                            (sel.notes || []).map((n) => (
                              <View
                                key={n.id}
                                style={[
                                  styles.noteCard,
                                  {
                                    borderColor:
                                      n.user_id === user?.id
                                        ? hexAlpha(accent, 0.35)
                                        : hexAlpha(cardBorder, 0.6),
                                  },
                                ]}
                              >
                                <Text style={[styles.noteWho, { color: textMuted }]}>
                                  {n.user_id === user?.id ? 'You' : 'Partner'}
                                </Text>
                                <Text style={[styles.noteBody, { color: text }]}>{n.notes || ''}</Text>
                                {n.rating ? (
                                  <Text style={{ color: accent, marginTop: 6, letterSpacing: 2 }}>
                                    {'★'.repeat(n.rating)}
                                  </Text>
                                ) : null}
                              </View>
                            ))
                          )}

                          <Text style={[styles.section, { color: textMuted }]}>Add note</Text>
                          <TextInput
                            value={noteText}
                            onChangeText={setNoteText}
                            multiline
                            placeholder="How was it?"
                            placeholderTextColor={textFaint}
                            style={[
                              styles.noteIn,
                              {
                                color: text,
                                borderColor: hexAlpha(cardBorder, 0.65),
                                backgroundColor: hexAlpha(inputBg, 0.35),
                              },
                            ]}
                          />
                          <View style={styles.noteActions}>
                            <StarRow
                              value={noteRating}
                              onChange={setNoteRating}
                              disabled={dateBusy}
                              accent={accent}
                            />
                            <Pressable
                              style={[
                                styles.cta,
                                { backgroundColor: accent },
                                (!noteText.trim() || dateBusy) && { opacity: 0.45 },
                              ]}
                              onPress={addDiaryNote}
                              disabled={!noteText.trim() || dateBusy}
                            >
                              <Text style={styles.ctaTxt}>Save</Text>
                            </Pressable>
                          </View>
                        </>
                      ) : (
                        <>
                          <Pressable
                            style={[styles.photoBtn, { borderColor: hexAlpha(accent, 0.35) }]}
                            onPress={pickDiaryPhoto}
                            disabled={photoBusy}
                          >
                            <Ionicons name="image-outline" size={16} color={accent} />
                            <Text style={[styles.photoBtnTxt, { color: accent }]}>
                              {photoBusy ? 'Uploading…' : 'Link polaroid'}
                            </Text>
                          </Pressable>

                          {(sel.photos || []).length === 0 ? (
                            <Text style={[styles.hint, { color: textFaint, marginTop: 14 }]}>
                              No memories linked to this date yet
                            </Text>
                          ) : (
                            <View style={styles.memoryGrid}>
                              {(sel.photos || []).map((ph) => {
                                const url = ph.photo_wall?.imageUrl;
                                if (!url) return null;
                                return (
                                  <View key={ph.id} style={styles.memoryCell}>
                                    <Image source={{ uri: url }} style={styles.memoryImg} resizeMode="cover" />
                                    {ph.photo_wall?.caption ? (
                                      <Text style={[styles.memoryCaption, { color: textMuted }]} numberOfLines={2}>
                                        {ph.photo_wall.caption}
                                      </Text>
                                    ) : null}
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <Text style={[styles.hint, { color: textFaint, marginTop: 20 }]}>
                      Mark this date finished to add notes and memories
                    </Text>
                  )}
                </ScrollView>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingTop: 4,
    minHeight: 0,
  },
  content: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 8,
  },
  seg: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 10,
    padding: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    gap: 6,
  },
  segIcon: { marginTop: 1 },
  segTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipTxt: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  composeIn: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  cta: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  ctaTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#0a0a0c',
  },
  list: { flex: 1 },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: { paddingTop: 2 },
  checkRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalTxt: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  deleteSpacer: { width: 17 },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 11,
    fontWeight: '600',
  },
  dateForm: {
    gap: 4,
    marginBottom: 8,
  },
  fieldLab: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  fieldIn: {
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dateRowInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateField: { flex: 1 },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  datePip: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dateMeta: { flex: 1 },
  dateTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  dateSub: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetAnchor: {
    maxHeight: '88%',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxHeight: '100%',
  },
  sheetScroll: { flexGrow: 0 },
  sheetPad: {
    paddingHorizontal: 22,
    paddingBottom: 28,
    paddingTop: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  sheetHeaderMeta: {
    flex: 1,
    minWidth: 0,
  },
  sheetClose: {
    paddingTop: 2,
    paddingLeft: 4,
  },
  sheetSeg: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
    marginBottom: 4,
    padding: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheetSegBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    gap: 6,
  },
  sheetSegTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  mTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  mSub: {
    marginTop: 4,
    fontSize: 12,
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  mLoc: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  doneBtn: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  doneTxt: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  section: {
    marginTop: 22,
    marginBottom: 8,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  hint: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  noteCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
  },
  noteWho: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  noteBody: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
  },
  noteIn: {
    minHeight: 88,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  starRow: { flexDirection: 'row', gap: 4 },
  photoBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoBtnTxt: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  memoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  memoryCell: {
    width: '47%',
    flexGrow: 1,
    maxWidth: '48%',
  },
  memoryImg: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  memoryCaption: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
});
