import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { networkUtility } from '../api/network';
import { useApp } from '../context/AppContext';

// Shown on top of the Dashboard while the couple's subscription is
// `past_due` but still inside the 7-day grace period (reminder_active).
// Dismissible per app session — reappears on next launch/foreground if the
// underlying payment problem hasn't actually been fixed.
export function ReminderModal() {
  const { reminderActive, gracePeriodEndsAt, refreshAccessStatus } = useApp();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const daysLeft = useMemo(() => {
    if (!gracePeriodEndsAt) return 0;
    const ms = new Date(gracePeriodEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  }, [gracePeriodEndsAt]);

  if (!reminderActive || dismissed) return null;

  async function fixNow() {
    setBusy(true);
    try {
      await networkUtility.reactivateSubscription();
      await refreshAccessStatus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent presentationStyle="overFullScreen">
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <Text style={styles.title}>Payment needs attention</Text>
          <Text style={styles.body}>
            We couldn't process your last payment. You have {daysLeft} day{daysLeft === 1 ? '' : 's'} left before both
            of you lose access.
          </Text>

          <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} disabled={busy} onPress={fixNow}>
            {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.ctaTxt}>Fix payment (dummy)</Text>}
          </Pressable>

          <Pressable onPress={() => setDismissed(true)} style={styles.later} hitSlop={12}>
            <Text style={styles.laterTxt}>Remind me later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  panel: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    padding: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248,113,113,0.3)',
    backgroundColor: 'rgba(18,18,22,0.97)',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#fafafa', textAlign: 'center' },
  body: { marginTop: 12, fontSize: 13, lineHeight: 20, color: '#d4d4d8', textAlign: 'center' },
  cta: {
    marginTop: 22,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#e4e4e7',
  },
  ctaTxt: { fontWeight: '900', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: '#0a0a0c' },
  later: { marginTop: 14, alignItems: 'center', paddingVertical: 6 },
  laterTxt: { color: '#a1a1aa', fontSize: 12, fontWeight: '700' },
});
