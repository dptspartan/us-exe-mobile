import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { networkUtility } from '../api/network';
import { useApp } from '../context/AppContext';
import { useMood } from '../context/MoodContext';
import { SettingsScreen } from './SettingsScreen';
import { ReminderModal } from '../components/ReminderModal';
import { SparksProvider } from '../context/SparksContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { usePushDeepLink } from '../hooks/usePushDeepLink';
import { hexAlpha } from '../utils/theme';
import { VibeBackground } from '../components/VibeBackground';
import { RadialSessionNav, stageSafeBottomInset } from '../components/RadialSessionNav';
import { SessionStage } from '../components/SessionStage';
import { SESSION_STAGE_PADDING_X, type SessionId } from '../components/sessionTiles';
import { MoodPickerOrb } from '../components/MoodPickerOrb';
import { StickyNotesTray } from '../components/StickyNotesTray';
import { GoalsModule } from '../components/GoalsModule';
import { MemoriesModule } from '../components/MemoriesModule';
import { NotesComposerModule } from '../components/NotesComposerModule';
import { JamModule } from '../components/JamModule';
import { LetterModule } from '../components/LetterModule';
import { SparksModule } from '../components/sparks/SparksModule';
import { HugRequestModal } from '../components/sparks/HugRequestModal';
import { FloatingHeartsOverlay } from '../components/sparks/FloatingHeartsOverlay';
import { initNotificationBehavior } from '../lib/notifications';
import {
  configureSparkNotificationHandler,
  ensureSparksNotificationChannels,
} from '../lib/sparkNotifications';
import { PushSetupBanner } from '../components/PushSetupBanner';

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, coupleId } = useApp();
  const { mine, theirs } = useMood();
  const vibe = useVibeTheme();
  const { accent, text, cardBorder } = vibe;

  const [session, setSession] = useState<SessionId>('desk');
  const [names, setNames] = useState({ myName: 'You', partnerName: 'Partner' });
  const [settingsVisible, setSettingsVisible] = useState(false);

  const openSparks = useCallback((id: SessionId) => setSession(id), []);
  usePushDeepLink(openSparks);

  useEffect(() => {
    configureSparkNotificationHandler();
    void initNotificationBehavior();
    void ensureSparksNotificationChannels();
  }, []);

  useEffect(() => {
    if (!coupleId || !user?.id) return;
    void (async () => {
      const n = await networkUtility.getNamesFromCouple(coupleId, user.id);
      if (typeof n === 'object' && n !== null && 'partnerName' in n && 'myName' in n) {
        const o = n as { partnerName?: string; myName?: string };
        setNames({ myName: o.myName ?? 'You', partnerName: o.partnerName ?? 'Partner' });
      }
    })();
  }, [coupleId, user?.id]);

  function renderModule(id: SessionId) {
    switch (id) {
      case 'desk':
        return <GoalsModule />;
      case 'memories':
        return <MemoriesModule />;
      case 'notes':
        return <NotesComposerModule />;
      case 'jam':
        return <JamModule />;
      case 'letter':
        return <LetterModule />;
      case 'sparks':
        return <SparksModule />;
      default:
        return <GoalsModule />;
    }
  }

  async function signOut() {
    await networkUtility.signOut();
  }

  return (
    <SparksProvider partnerName={names.partnerName}>
      <View style={styles.root}>
        <VibeBackground myMood={mine} partnerMood={theirs} />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={[styles.header, { borderBottomColor: cardBorder }]}>
            <View style={styles.headerTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.title, { color: text }]} numberOfLines={2}>
                  {names.myName}
                  <Text style={[styles.amp, { color: hexAlpha(text, 0.32) }]}> & </Text>
                  {names.partnerName}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSettingsVisible(true)}
                style={styles.gear}
                hitSlop={10}
              >
                <Ionicons name="settings-outline" size={16} color={hexAlpha(text, 0.75)} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={signOut} style={styles.bye}>
                <Text style={styles.byeTxt}>Bye</Text>
              </Pressable>
            </View>
            <MoodPickerOrb />
          </View>

          {user?.id ? <PushSetupBanner userId={user.id} /> : null}

          <View
            style={[
              styles.stage,
              {
                paddingBottom: stageSafeBottomInset(insets.bottom),
                paddingHorizontal: SESSION_STAGE_PADDING_X[session],
              },
            ]}
          >
            <SessionStage session={session}>{renderModule}</SessionStage>
          </View>
        </SafeAreaView>

        <RadialSessionNav active={session} onSelect={setSession} accent={accent} />
        <FloatingHeartsOverlay />
        <HugRequestModal />
        <StickyNotesTray partnerName={names.partnerName} />
        <ReminderModal />
        <SettingsScreen visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      </View>
    </SparksProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0c', position: 'relative' },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  amp: { fontWeight: '300', fontStyle: 'italic', fontSize: 16, textTransform: 'none' },
  gear: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  bye: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248,113,113,0.35)',
    backgroundColor: 'rgba(248,113,113,0.06)',
    alignSelf: 'center',
  },
  byeTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', color: '#fca5a5' },
  stage: { flex: 1, paddingTop: 8 },
});
