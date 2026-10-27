import { useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { createSound } from 'react-native-nitro-sound';
import { speech, type SpeechEvent } from '../../native/speech';
import { Dirs } from 'react-native-file-access';
import {
  deleteRecording, sendRecording, sendText,
  type AskContext, type AssistantResponse, type ExpenseSummary, type Flight, type Message, type Product, type TripPlan, type TripSummary,
} from '../../api/assistant';
import { config } from '../../config';

/** A conversation entry; assistant entries can carry the product cards they showed. */
export type ChatEntry = Message & { products?: Product[]; flights?: Flight[]; savedTrip?: { id: string; title: string } };

export type VoiceStatus = 'idle' | 'preparing' | 'listening' | 'thinking' | 'speaking';

type Options = {
  serverUrl: string;
  /** Recent expenses, so the assistant can answer "how much did I spend…". */
  expenses: ExpenseSummary[];
  trips: TripSummary[];
  onAddExpense: (expense: { title: string; amount: number; category: string }) => void;
  /** Saves a plan and returns its id so the chat can link to it. */
  onSaveTrip: (trip: TripPlan) => string;
};

export function useVoiceAssistant({ serverUrl, expenses, trips, onAddExpense, onSaveTrip }: Options) {
  const [recorder] = useState(() => createSound());
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [durationMillis, setDurationMillis] = useState(0);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [pendingPurchase, setPendingPurchase] = useState<Product | null>(null);
  const [pendingBooking, setPendingBooking] = useState<Flight | null>(null);
  const [error, setError] = useState('');
  const [demo, setDemo] = useState(false);
  const mounted = useRef(true);
  const locked = useRef(false);
  const listening = useRef(false);
  const recordingUri = useRef<string | null>(null);
  const speechId = useRef<string | number | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const finishRef = useRef<() => Promise<void>>(async () => {});
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;
  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;
  const onAddExpenseRef = useRef(onAddExpense);
  onAddExpenseRef.current = onAddExpense;
  const tripsRef = useRef(trips);
  tripsRef.current = trips;
  const onSaveTripRef = useRef(onSaveTrip);
  onSaveTripRef.current = onSaveTrip;

  function askContext(entries: ChatEntry[]): AskContext {
    return {
      history: entries.map(({ role, content }) => ({ role, content })),
      products: [...entries].reverse().find(message => message.products?.length)?.products ?? [],
      flights: [...entries].reverse().find(message => message.flights?.length)?.flights ?? [],
      expenses: expensesRef.current,
      trips: tripsRef.current,
    };
  }

  /** Runs the assistant's actions and returns the chat entry for its reply. */
  function applyActions(result: AssistantResponse): ChatEntry {
    let savedTrip: ChatEntry['savedTrip'];
    for (const action of result.actions ?? []) {
      if (action.type === 'buy') setPendingPurchase(action.product);
      else if (action.type === 'book_flight') setPendingBooking(action.flight);
      else if (action.type === 'add_expense') onAddExpenseRef.current(action.expense);
      else if (action.type === 'save_trip') savedTrip = { id: onSaveTripRef.current(action.trip), title: action.trip.title };
    }
    setDemo(result.demo);
    return { role: 'assistant', content: result.reply, products: result.products, flights: result.flights, savedTrip };
  }

  // Hands-free mode (after the wake word): send automatically once the user stops talking.
  const handsFree = useRef(false);
  const heardSpeech = useRef(false);
  const quietSince = useRef<number | null>(null);

  function clearTimer() { if (timer.current) clearTimeout(timer.current); timer.current = null; }

  useEffect(() => {
    mounted.current = true;
    recorder.addRecordBackListener(event => {
      if (!mounted.current) return;
      setDurationMillis(event.currentPosition);
      if (!handsFree.current || !listening.current || event.currentMetering === undefined) return;
      // Levels are in dBFS: speech is usually louder than -32, a quiet room below -42.
      if (event.currentMetering > -32) { heardSpeech.current = true; quietSince.current = null; return; }
      if (event.currentMetering > -42) return;
      const now = Date.now();
      quietSince.current ??= now;
      const silentFor = now - quietSince.current;
      if ((heardSpeech.current && silentFor > 1500) || (!heardSpeech.current && event.currentPosition > 8000)) {
        handsFree.current = false;
        void finishRef.current();
      }
    });
    const speechEnded = (event: SpeechEvent) => {
      if (mounted.current && event.utteranceId === speechId.current) {
        speechId.current = null;
        setStatus('idle');
      }
    };
    const speechFailed = (event: SpeechEvent) => {
      if (event.utteranceId !== speechId.current) return;
      speechEnded(event);
      if (mounted.current) setError('The reply is below, but speech playback failed. Check your installed voices.');
    };
    const finishedSubscription = speech.onFinish(speechEnded);
    const errorSubscription = speech.onError(speechFailed);

    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') return;
      generation.current++;
      clearTimer();
      controller.current?.abort();
      speechId.current = null;
      void speech.stop().catch(() => {});
      if (listening.current) {
        listening.current = false;
        locked.current = true;
        void recorder.stopRecorder().catch(() => '').then(async uri => {
          const path = uri || recordingUri.current;
          if (path) await deleteRecording(path);
          recordingUri.current = null;
        }).finally(() => { locked.current = false; });
      }
      if (mounted.current) setStatus('idle');
    });
    return () => {
      mounted.current = false;
      generation.current++;
      clearTimer();
      controller.current?.abort();
      speechId.current = null;
      void speech.stop().catch(() => {});
      recorder.removeRecordBackListener();
      void recorder.stopRecorder().catch(() => '').then(async uri => {
        if (uri || recordingUri.current) await deleteRecording(uri || recordingUri.current!);
      }).finally(() => recorder.dispose());
      finishedSubscription?.remove();
      errorSubscription?.remove();
      subscription.remove();
    };
  }, [recorder]);

  async function startRecording(options: { handsFree?: boolean } = {}) {
    if (locked.current || listening.current) return;
    locked.current = true;
    setError('');
    setStatus('preparing');
    try {
      speechId.current = null;
      await speech.stop().catch(() => {});
      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Microphone access is off. Allow it in Settings > Apps > Voice Assistant > Permissions.');
      }
      if (AppState.currentState !== 'active' || !mounted.current) { setStatus('idle'); return; }
      // iOS microphone permission is requested by the native recorder.
      const current = ++generation.current;
      const extension = Platform.OS === 'android' ? 'mp4' : 'm4a';
      const path = `${Dirs.CacheDir}/question-${Date.now()}.${extension}`;
      recordingUri.current = path;
      handsFree.current = !!options.handsFree;
      heardSpeech.current = false;
      quietSince.current = null;
      const uri = await recorder.startRecorder(path, { AudioChannels: 1, AudioSamplingRate: 16000, AudioEncodingBitRate: 64000 }, !!options.handsFree);
      recordingUri.current = uri;
      if (!mounted.current || AppState.currentState !== 'active') {
        await recorder.stopRecorder();
        await deleteRecording(uri);
        recordingUri.current = null;
        if (mounted.current) setStatus('idle');
        return;
      }
      // An iOS permission dialog can emit an inactive event before recording starts.
      generation.current = Math.max(generation.current, current);
      listening.current = true;
      setDurationMillis(0);
      setStatus('listening');
      timer.current = setTimeout(() => { void finishRef.current(); }, 30000);
    } catch (cause) {
      if (recordingUri.current) await deleteRecording(recordingUri.current);
      recordingUri.current = null;
      if (mounted.current) { setError(cause instanceof Error ? cause.message : 'Could not record.'); setStatus('idle'); }
    } finally { locked.current = false; }
  }

  async function finishRecording() {
    if (locked.current || !listening.current) return;
    locked.current = true;
    listening.current = false;
    clearTimer();
    const current = generation.current;
    let uri = recordingUri.current;
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 100000);
    setStatus('thinking');
    try {
      uri = (await recorder.stopRecorder()) || uri;
      recordingUri.current = null;
      if (!uri) throw new Error('No recording was saved. Please try again.');
      if (abort.signal.aborted) return;
      const result = await sendRecording(serverUrlRef.current, uri, askContext(messages), abort.signal);
      if (!mounted.current || generation.current !== current) return;
      const reply = applyActions(result);
      setMessages(previous => [...previous, { role: 'user', content: result.transcript }, reply]);
      try {
        if (!mounted.current || generation.current !== current) return;
        setStatus('speaking');
        const identifier = await speech.speak(result.reply, config.speechLanguage);
        if (mounted.current && generation.current === current) speechId.current = identifier;
        else await speech.stop();
      } catch {
        if (mounted.current && generation.current === current) {
          setStatus('idle');
          setError('The reply is below. Install a text-to-speech engine and a voice for the selected language to hear it.');
        }
      }
    } catch (cause) {
      if (mounted.current && generation.current === current) {
        setError(abort.signal.aborted ? 'The request timed out. Please try again.' : cause instanceof Error ? cause.message : 'Could not connect to the assistant.');
        setStatus('idle');
      }
    } finally {
      clearTimeout(timeout);
      if (uri) await deleteRecording(uri);
      if (controller.current === abort) controller.current = null;
      locked.current = false;
    }
  }
  finishRef.current = finishRecording;

  /** Typed chat. Replies are shown but not spoken. Returns false so the caller can keep the draft. */
  async function sendTypedMessage(text: string): Promise<boolean> {
    const message = text.trim();
    if (!message || locked.current || listening.current) return false;
    locked.current = true;
    const current = ++generation.current;
    speechId.current = null;
    await speech.stop().catch(() => {});
    const before = messages;
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 60000);
    setError('');
    setMessages([...before, { role: 'user', content: message }]);
    setStatus('thinking');
    try {
      const result = await sendText(serverUrlRef.current, message, askContext(before), abort.signal);
      if (!mounted.current || generation.current !== current) return true;
      setMessages([...before, { role: 'user', content: message }, applyActions(result)]);
      setStatus('idle');
      return true;
    } catch (cause) {
      if (!mounted.current || generation.current !== current) return false;
      setMessages(before);
      setError(abort.signal.aborted ? 'The request timed out. Please try again.' : cause instanceof Error ? cause.message : 'Could not connect to the assistant.');
      setStatus('idle');
      return false;
    } finally {
      clearTimeout(timeout);
      if (controller.current === abort) controller.current = null;
      locked.current = false;
    }
  }

  async function stopSpeaking() {
    generation.current++;
    speechId.current = null;
    await speech.stop().catch(() => {});
    setStatus('idle');
  }

  function newConversation() { setMessages([]); setError(''); setDemo(false); setPendingPurchase(null); setPendingBooking(null); }
  return {
    status, durationMillis, messages, error, demo, startRecording, finishRecording, stopSpeaking, newConversation, sendTypedMessage,
    pendingPurchase, requestPurchase: setPendingPurchase, cancelPurchase: () => setPendingPurchase(null),
    pendingBooking, requestBooking: setPendingBooking, cancelBooking: () => setPendingBooking(null),
  };
}
