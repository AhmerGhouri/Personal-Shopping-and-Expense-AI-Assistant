import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { wakeWord, type WakeWordStatus } from '../../native/wakeWord';

/**
 * Background "Gigi" detection. The detector only listens while the app is in the background,
 * so it never fights the app's own recorder for the microphone.
 */
export function useWakeWord({ onWake }: { onWake: () => void }) {
  const [status, setStatus] = useState<WakeWordStatus | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  const refresh = useCallback(async () => {
    if (!wakeWord.available) return;
    setStatus(await wakeWord.getStatus());
    setLocked(await wakeWord.isLocked());
  }, []);

  const checkWake = useCallback(async () => {
    if (await wakeWord.consumeWake()) onWakeRef.current();
  }, []);

  useEffect(() => {
    if (!wakeWord.available) return;
    void refresh();
    void checkWake();
    const events = wakeWord.onEvent(event => {
      if (event.type === 'error') setError(event.message ?? 'The wake word stopped working.');
      void refresh();
    });
    const appState = AppState.addEventListener('change', next => {
      if (next === 'active') {
        wakeWord.pause();
        void refresh();
        void checkWake();
      } else if (next === 'background') {
        wakeWord.resume();
      }
    });
    return () => { events?.remove(); appState.remove(); };
  }, [refresh, checkWake]);

  /** Detection runs fully offline on the phone (Vosk), so there is nothing to download or configure. */
  const enable = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const microphone = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (microphone !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Allow microphone access so the assistant can hear its name.');
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      await wakeWord.start();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not turn on the wake word.');
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    await wakeWord.stop();
    await refresh();
  }, [refresh]);

  /** Asks for PIN/fingerprint when the app is showing over the lock screen. */
  const unlock = useCallback(async () => {
    const result = await wakeWord.unlock();
    setLocked(await wakeWord.isLocked());
    return result;
  }, []);

  return { available: wakeWord.available, status, locked, busy, error, enable, disable, refresh, unlock };
}
