import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configureSparkNotificationHandler } from './src/lib/sparkNotifications';
import { AppProvider, useApp } from './src/context/AppContext';
import { MoodProvider } from './src/context/MoodContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';

function Shell() {
  const { loading, isAuthenticated, isPaired } = useApp();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.hint}>Syncing session…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (!isPaired) {
    return (
      <View style={[styles.center, { paddingHorizontal: 28 }]}>
        <Text style={styles.errTitle}>No couple profile</Text>
        <Text style={styles.errBody}>
          This account must appear in your Supabase `couples` table (same as the web app). Pair both partner IDs, then relaunch.
        </Text>
      </View>
    );
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
});
