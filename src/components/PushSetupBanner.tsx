import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { EXPO_CREDENTIALS_URL } from '../constants/env';
import {
  getPushRegistrationState,
  registerForRemotePush,
  subscribePushRegistration,
} from '../lib/pushTokens';

type Props = {
  userId: string;
};

export function PushSetupBanner({ userId }: Props) {
  const [state, setState] = useState(getPushRegistrationState);

  useEffect(() => subscribePushRegistration(setState), []);

  if (state.status === 'saved' || state.status === 'idle' || state.status === 'registering') {
    return null;
  }

  const showExpoLink =
    state.status === 'token_failed' || state.status === 'no_project_id';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Partner alerts not set up</Text>
      <Text style={styles.body}>{state.message}</Text>
      <View style={styles.actions}>
        <Pressable
          style={styles.btn}
          onPress={() => void registerForRemotePush(userId)}
        >
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
        {showExpoLink && EXPO_CREDENTIALS_URL ? (
          <Pressable
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => void Linking.openURL(EXPO_CREDENTIALS_URL)}
          >
            <Text style={styles.btnTextSecondary}>Expo Android credentials</Text>
          </Pressable>
        ) : state.status === 'permission_denied' ? (
          <Pressable
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => void Linking.openSettings()}
          >
            <Text style={styles.btnTextSecondary}>Open Settings</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(127, 29, 29, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fecaca',
    marginBottom: 4,
  },
  body: {
    fontSize: 12,
    lineHeight: 18,
    color: '#fca5a5',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#be123c',
  },
  btnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  btnTextSecondary: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fda4af',
  },
});
