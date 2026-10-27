import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { wakeWord, type SettingsPage } from '../../native/wakeWord';
import { colors } from '../../theme';
import type { useWakeWord } from './useWakeWord';

type WakeWordState = ReturnType<typeof useWakeWord>;

function Check({ ok, title, detail, page }: { ok: boolean; title: string; detail: string; page?: SettingsPage }) {
  return (
    <View style={styles.check}>
      <View style={[styles.checkDot, { backgroundColor: ok ? colors.success : colors.warning }]} />
      <View style={styles.checkBody}>
        <Text style={styles.checkTitle}>{title}</Text>
        <Text style={styles.checkDetail}>{detail}</Text>
      </View>
      {!ok && page && (
        <Pressable accessibilityRole="button" onPress={() => wakeWord.openSettings(page)} style={({ pressed }) => [styles.fix, pressed && styles.pressed]}>
          <Text style={styles.fixText}>Allow</Text>
        </Pressable>
      )}
    </View>
  );
}

export function WakeWordSheet({ visible, onClose, state }: { visible: boolean; onClose: () => void; state: WakeWordState }) {
  const status = state.status;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent onShow={() => void state.refresh()}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close wake word settings" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView>
            <View style={styles.titleRow}>
              <View style={styles.titleText}>
                <Text style={styles.title}>Wake word</Text>
                <Text style={styles.subtitle}>Say “Gigi” anytime, even with the screen locked, and the assistant opens and listens.</Text>
              </View>
              {state.busy
                ? <ActivityIndicator color={colors.accent} />
                : <Switch value={!!status?.enabled} onValueChange={on => void (on ? state.enable() : state.disable())}
                    trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.text} accessibilityLabel="Wake word on or off" />}
            </View>

            {state.error || status?.lastError
              ? <Text style={styles.error}>{state.error || status?.lastError}</Text>
              : null}
            {status?.enabled && !status.listening && !status.lastError && (
              <Text style={styles.note}>Paused while the app is open. It starts listening when you leave the app or lock the phone.</Text>
            )}

            {status && (
              <View style={styles.checks}>
                <Check ok={status.microphone} title="Microphone" detail="Needed to hear the wake word." page="app" />
                <Check ok={status.notifications} title="Notifications" detail="Android requires a “listening” notification." page="app" />
                <Check ok={status.fullScreen} title="Open on the lock screen" detail="Lets the assistant pop up when the phone is locked." page="fullScreen" />
                <Check ok={status.overlay} title="Display over other apps" detail="Lets it open while you use other apps." page="overlay" />
                <Check ok={false} title="Battery (recommended)" detail="Set this app to “Unrestricted” so Android doesn’t stop listening." page="battery" />
              </View>
            )}

            <Text style={styles.privacy}>
              Listening happens on your phone. Nothing is sent until you say the wake word. Unlocking still needs your fingerprint or PIN; buying and viewing expenses ask for it.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,6,14,0.6)' },
  sheet: { maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34, borderWidth: 1, borderColor: colors.border },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  titleText: { flex: 1 },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: 12 },
  note: { color: colors.warning, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  checks: { marginTop: 18, borderRadius: 14, backgroundColor: colors.background, paddingHorizontal: 14 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  checkDot: { width: 10, height: 10, borderRadius: 5 },
  checkBody: { flex: 1 },
  checkTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  checkDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  fix: { backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  fixText: { color: colors.accent, fontSize: 12.5, fontWeight: '700' },
  privacy: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 16 },
  pressed: { opacity: 0.75 },
});
