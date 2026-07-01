import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configureSparkNotificationHandler } from './src/lib/sparkNotifications';
import { AppProvider, useApp } from './src/context/AppContext';
import { MoodProvider } from './src/context/MoodContext';
import { useInviteDeepLink } from './src/hooks/useInviteDeepLink';
import { AuthGateScreen } from './src/screens/AuthGateScreen';
import { SetPasswordScreen } from './src/screens/SetPasswordScreen';
import { WaitingForPartnerScreen } from './src/screens/WaitingForPartnerScreen';
import { AccessBlockedScreen } from './src/screens/AccessBlockedScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';

function Shell() {
  const { loading, isAuthenticated, isPaired, onboardingStatus, accessStatusLoading, accessAllowed } = useApp();
  const inviteLink = useInviteDeepLink();

  if (inviteLink.status === 'verifying') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.hint}>Opening your invite…</Text>
      </View>
    );
  }

  if (inviteLink.status === 'error') {
    return (
      <View style={[styles.center, { paddingHorizontal: 28 }]}>
        <Text style={styles.errTitle}>Invite link problem</Text>
        <Text style={styles.errBody}>{inviteLink.error}</Text>
        <Text onPress={inviteLink.dismiss} style={styles.errRetry}>
          Dismiss
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.hint}>Syncing session…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthGateScreen />;
  }

  // Authenticated but no couple row matches yet: either a brand-new invited
  // user who hasn't set a password/finished setup, or (rare) a genuinely
  // orphaned account. SetPasswordScreen handles both, since it's derived
  // purely from live session + couple state — no flag needs to survive an
  // app restart mid-invite-flow.
  if (!isPaired) {
    return <SetPasswordScreen />;
  }

  if (onboardingStatus && onboardingStatus !== 'active') {
    return <WaitingForPartnerScreen />;
  }

  if (accessStatusLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  if (!accessAllowed) {
    return <AccessBlockedScreen />;
  }

  return <DashboardScreen />;
}

export default function App() {
  useEffect(() => {
    configureSparkNotificationHandler();
  }, []);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AppProvider>
          <MoodProvider>
            <StatusBar style="light" />
            <Shell />
          </MoodProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0a0a0c' },
  center: { flex: 1, backgroundColor: '#0a0a0c', justifyContent: 'center', alignItems: 'center' },
  hint: { marginTop: 14, fontSize: 12, color: '#71717a', fontWeight: '600' },
  errTitle: { fontSize: 18, fontWeight: '900', color: '#fafafa', marginBottom: 12, textAlign: 'center' },
  errBody: { fontSize: 14, lineHeight: 22, color: '#a1a1aa', textAlign: 'center' },
  errRetry: { marginTop: 20, fontSize: 13, fontWeight: '800', color: '#ec4899' },
});
