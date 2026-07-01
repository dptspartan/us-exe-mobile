import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  ownerName: string;
  partnerName: string;
  onBackToLogin: () => void;
};

export function OnboardingSuccessScreen({ ownerName, partnerName, onBackToLogin }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.emoji}>💌</Text>
        <Text style={styles.title}>Check your inboxes</Text>
        <Text style={styles.body}>
          We just emailed {ownerName} and {partnerName} a link to set up your passwords. Open it on your phone to
          finish setting up your account.
        </Text>
        <Text style={styles.hint}>Didn't get it? Check spam, or open the link on the device you want to use.</Text>

        <Pressable onPress={onBackToLogin} style={styles.btn}>
          <Text style={styles.btnTxt}>Back to login</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#0f0f11' },
  card: {
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(24,24,28,0.75)',
  },
  emoji: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '900', color: '#fafafa', textAlign: 'center' },
  body: { marginTop: 14, fontSize: 14, lineHeight: 21, color: '#d4d4d8', textAlign: 'center' },
  hint: { marginTop: 14, fontSize: 11, lineHeight: 17, color: '#71717a', textAlign: 'center' },
  btn: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: '#e4e4e7',
  },
  btnTxt: { fontWeight: '900', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#0a0a0c' },
});
