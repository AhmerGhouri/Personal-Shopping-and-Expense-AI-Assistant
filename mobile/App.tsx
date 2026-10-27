import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator, Animated, AppState, Easing, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useVoiceAssistant, type VoiceStatus } from './src/features/voice/useVoiceAssistant';
import { useServerConnection, type ConnectionState } from './src/features/connection/useServerConnection';
import { checkHealth, type Flight, type Product } from './src/api/assistant';
import { isValidServerUrl, normalizeServerUrl } from './src/settings/serverUrl';
import { colors } from './src/theme';
import { ProductCards } from './src/features/shopping/ProductCards';
import { DidBuySheet, PurchaseSheet } from './src/features/shopping/PurchaseSheet';
import { ExpensesScreen } from './src/features/expenses/ExpensesScreen';
import { useWakeWord } from './src/features/wakeword/useWakeWord';
import { WakeWordSheet } from './src/features/wakeword/WakeWordSheet';
import { useTrips } from './src/features/trips/trips';
import { TripsScreen } from './src/features/trips/TripsScreen';
import { FlightCards } from './src/features/trips/FlightCards';
import { BookingSheet, DidBookSheet } from './src/features/trips/BookingSheet';
import { asCategory, formatMoney, parsePrice, useExpenses } from './src/features/expenses/expenses';


const statusLabels: Record<VoiceStatus, string> = {
  idle: 'Tap the microphone or type a message',
  preparing: 'Opening microphone…',
  listening: 'Listening… tap again to send',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap to stop',
};

const examples = [
  'I want a laptop for programming, budget 150,000',
  'Plan Umrah for two from Lahore, 10 to 20 December, and find flights',
  'I spent 2,500 on groceries today',
];
const tabs = { assistant: 'Assistant', trips: 'Trips', expenses: 'Expenses' } as const;
const subtitles = { assistant: 'Shop, plan trips, track every rupee', trips: 'Your travel plans', expenses: 'Your spending history' } as const;

const connectionLabels: Record<ConnectionState, string> = { checking: 'Connecting', online: 'Online', offline: 'Offline' };
const connectionColors: Record<ConnectionState, string> = { checking: colors.warning, online: colors.success, offline: colors.danger };

function MicIcon({ color, small }: { color: string; small?: boolean }) {
  return (
    <View style={[styles.micIcon, small && styles.micIconSmall]}>
      <View style={[styles.micHead, { backgroundColor: color }]} />
      <View style={[styles.micCup, { borderColor: color }]} />
      <View style={[styles.micStem, { backgroundColor: color }]} />
    </View>
  );
}

function MicButton({ status, onPress, disabled }: { status: VoiceStatus; onPress: () => void; disabled: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const listening = status === 'listening';
  useEffect(() => {
    if (!listening) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  const background = listening ? colors.danger : status === 'speaking' ? colors.surfaceRaised : colors.accent;
  const label = listening ? 'Stop recording and send' : status === 'speaking' ? 'Stop speaking' : 'Start recording';
  return (
    <View style={styles.micWrap}>
      {listening && <Animated.View pointerEvents="none" style={[styles.pulse, {
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
      }]} />}
      <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
        style={({ pressed }) => [styles.mic, { backgroundColor: background }, pressed && styles.pressed, disabled && styles.disabled]}>
        {status === 'thinking' || status === 'preparing'
          ? <ActivityIndicator color={colors.text} size="large" />
          : listening ? <View style={styles.stopSquare} />
          : status === 'speaking' ? <View style={[styles.stopSquare, { backgroundColor: colors.text }]} />
          : <MicIcon color={colors.onAccent} />}
      </Pressable>
    </View>
  );
}

function ServerSheet({ visible, serverUrl, onClose, onSave }: {
  visible: boolean; serverUrl: string; onClose: () => void; onSave: (url: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(serverUrl);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => { if (visible) { setDraft(serverUrl); setResult(null); } }, [visible, serverUrl]);

  const normalized = normalizeServerUrl(draft);
  const valid = isValidServerUrl(normalized);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const health = await checkHealth(normalized);
      setResult({ ok: true, text: `Connected${health.mode === 'demo' ? ' (demo mode)' : ''}.` });
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : 'Could not connect.' });
    } finally { setTesting(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close server settings" />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Server connection</Text>
          <Text style={styles.sheetText}>Enter the address shown in the backend window as “Phone URL”.</Text>
          <TextInput value={draft} onChangeText={text => { setDraft(text); setResult(null); }} autoCapitalize="none" autoCorrect={false}
            keyboardType="url" placeholder="http://192.168.1.9:8000" placeholderTextColor={colors.textMuted} style={styles.input}
            accessibilityLabel="Server address" />
          {result && <Text style={[styles.sheetResult, { color: result.ok ? colors.success : colors.danger }]}>{result.text}</Text>}
          <View style={styles.sheetActions}>
            <Pressable accessibilityRole="button" disabled={!valid || testing} onPress={test}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, (!valid || testing) && styles.disabled]}>
              {testing ? <ActivityIndicator color={colors.text} /> : <Text style={styles.secondaryButtonText}>Test</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={!valid} onPress={() => { void onSave(normalized); onClose(); }}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, !valid && styles.disabled]}>
              <Text style={styles.primaryButtonText}>Save</Text>
            </Pressable>
          </View>
          <View style={styles.tips}>
            <Text style={styles.tipsTitle}>If it won’t connect</Text>
            <Text style={styles.tip}>• Keep the phone and computer on the same Wi-Fi (not guest Wi-Fi).</Text>
            <Text style={styles.tip}>• Start the backend with HOST=0.0.0.0 in backend/.env.</Text>
            <Text style={styles.tip}>• Allow Node.js through Windows Firewall, or set the Wi-Fi to a Private network.</Text>
            <Text style={styles.tip}>• Open {normalized || 'the address'}/health in the phone’s browser to test.</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type Tab = keyof typeof tabs;

function AssistantScreen() {
  const connection = useServerConnection();
  const expenses = useExpenses();
  const expenseSummary = useMemo(() => expenses.expenses.slice(0, 150).map(expense => ({
    title: expense.title, amount: expense.amount, category: expense.category, date: expense.date.slice(0, 10),
  })), [expenses.expenses]);
  const trips = useTrips();
  const tripSummary = useMemo(() => trips.trips.map(({ title, destination, startDate, endDate }) => ({ title, destination, startDate, endDate })), [trips.trips]);
  const voice = useVoiceAssistant({
    serverUrl: connection.serverUrl,
    expenses: expenseSummary,
    trips: tripSummary,
    onAddExpense: expense => expenses.add({ ...expense, category: asCategory(expense.category), source: 'assistant' }),
    onSaveTrip: trips.add,
  });
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [booking, setBooking] = useState<{ flight: Flight; awaitingReturn: boolean } | null>(null);
  const { status, messages, error, demo } = voice;
  const [tab, setTab] = useState<Tab>('assistant');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wakeOpen, setWakeOpen] = useState(false);
  const wake = useWakeWord({
    // Opened by "Gigi": go straight to listening, and send when the user stops talking.
    onWake: () => {
      setTab('assistant');
      if (voice.status === 'idle' || voice.status === 'speaking') void voice.startRecording({ handsFree: true });
    },
  });
  const [draft, setDraft] = useState('');
  const [checkout, setCheckout] = useState<{ product: Product; awaitingReturn: boolean } | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const busy = status === 'preparing' || status === 'thinking';
  const seconds = Math.floor(voice.durationMillis / 1000);
  const typing = draft.trim().length > 0 && status === 'idle';

  // A failed request is the best signal that the server went away; refresh the header pill.
  useEffect(() => { if (error) void connection.recheck(); }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  // After the store opens in the browser, ask on return whether the purchase went through.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active') return;
      setCheckout(current => current && { ...current, awaitingReturn: false });
      setBooking(current => current && { ...current, awaitingReturn: false });
    });
    return () => subscription.remove();
  }, []);

  function answerCheckout(bought: boolean) {
    if (bought && checkout) {
      const { product } = checkout;
      expenses.add({
        title: product.title, amount: product.priceValue ?? parsePrice(product.price) ?? 0, category: 'Shopping', source: 'purchase',
        store: product.store, link: product.link, thumbnail: product.thumbnail,
      });
    }
    setCheckout(null);
  }

  function answerBooking(booked: boolean) {
    if (booked && booking) {
      const { flight } = booking;
      expenses.add({
        title: `Flight ${flight.from} → ${flight.to} (${flight.airline})`, amount: flight.price, category: 'Travel', source: 'booking',
        store: flight.airline, link: flight.bookingUrl, thumbnail: flight.airlineLogo,
      });
      const trip = trips.forFlight(flight);
      if (trip) trips.update(trip.id, current => ({ ...current, flights: [...current.flights, flight] }));
    }
    setBooking(null);
  }

  async function send() {
    const text = draft;
    setDraft('');
    if (!await voice.sendTypedMessage(text)) setDraft(current => current || text);
  }

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.logo}><Text style={styles.logoText}>A</Text></View>
          <View>
            <Text style={styles.title}>{tabs[tab]}</Text>
            <Text style={styles.subtitle}>{subtitles[tab]}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Server ${connectionLabels[connection.state]}. Open server settings`}
            onPress={() => setSettingsOpen(true)} hitSlop={8} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
            <View style={[styles.dot, { backgroundColor: connectionColors[connection.state] }]} />
            <Text style={styles.pillText}>{connectionLabels[connection.state]}</Text>
          </Pressable>
          {wake.available && (
            <Pressable accessibilityRole="button" accessibilityLabel="Wake word settings" onPress={() => setWakeOpen(true)} hitSlop={8}
              style={({ pressed }) => [styles.iconButton, wake.status?.enabled && styles.iconButtonOn, pressed && styles.pressed]}>
              <MicIcon color={wake.status?.enabled ? colors.onAccent : colors.text} small />
            </Pressable>
          )}
          {tab === 'assistant' && (
            <Pressable accessibilityRole="button" accessibilityLabel="New conversation" disabled={status !== 'idle' || !messages.length}
              onPress={voice.newConversation} hitSlop={8}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, (status !== 'idle' || !messages.length) && styles.disabled]}>
              <Text style={styles.iconButtonText}>＋</Text>
            </Pressable>
          )}
        </View>
      </View>

      {connection.state === 'offline' && (
        <Pressable accessibilityRole="button" onPress={() => setSettingsOpen(true)} style={styles.banner}>
          <Text style={styles.bannerTitle}>Can’t reach your assistant server</Text>
          <Text style={styles.bannerText}>{connection.serverUrl} isn’t responding. Tap to check the address and troubleshooting tips.</Text>
        </Pressable>
      )}

      {tab === 'expenses' && wake.locked ? (
        // Shown over the lock screen after "Gigi": spending history stays private until unlocked.
        <View style={styles.lockedView}>
          <Text style={styles.emptyTitle}>Unlock to see your expenses</Text>
          <Text style={styles.emptyText}>Your spending history stays private while the phone is locked.</Text>
          <Pressable accessibilityRole="button" onPress={() => void wake.unlock()} style={({ pressed }) => [styles.unlockButton, pressed && styles.pressed]}>
            <Text style={styles.unlockText}>Unlock</Text>
          </Pressable>
        </View>
      ) : tab === 'trips' ? (
        <TripsScreen trips={trips.trips} openTripId={openTripId} onOpenTrip={setOpenTripId} onUpdate={trips.update} onRemove={trips.remove} />
      ) : tab === 'expenses' ? (
        <ExpensesScreen expenses={expenses.expenses} onAdd={expenses.add} onRemove={expenses.remove} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {demo && <View style={styles.demo}><Text style={styles.demoText}>Demo mode · replies are examples, not real answers</Text></View>}
          <ScrollView ref={scroll} style={styles.conversation} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
            {!messages.length ? (
              <View style={styles.empty}>
                <View style={styles.orbOuter}><View style={styles.orbInner}><MicIcon color={colors.accent} /></View></View>
                <Text style={styles.emptyTitle}>What are you shopping for?</Text>
                <Text style={styles.emptyText}>I’ll find real products on Daraz, compare prices and sellers, recommend the best one, and track what you spend. Speak or type, for example:</Text>
                <View style={styles.examples}>
                  {examples.map(example => (
                    <Pressable key={example} accessibilityRole="button" disabled={busy} onPress={() => setDraft(example)}
                      style={({ pressed }) => [styles.example, pressed && styles.pressed]}>
                      <Text style={styles.exampleText}>“{example}”</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : messages.map((message, index) => {
              const mine = message.role === 'user';
              return (
                <View key={index}>
                  <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
                    {!mine && <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>}
                    <View style={[styles.bubble, mine ? styles.userBubble : styles.assistantBubble]}>
                      <Text selectable style={[styles.body, mine && styles.userBody]}>{message.content}</Text>
                    </View>
                  </View>
                  {message.products?.length ? <ProductCards products={message.products} onBuy={voice.requestPurchase} /> : null}
                  {message.flights?.length ? <FlightCards flights={message.flights} onBook={voice.requestBooking} /> : null}
                  {message.savedTrip ? (
                    <Pressable accessibilityRole="button" onPress={() => { setTab('trips'); setOpenTripId(message.savedTrip!.id); }}
                      style={({ pressed }) => [styles.tripChip, pressed && styles.pressed]}>
                      <Text style={styles.tripChipLabel}>SAVED TO TRIPS</Text>
                      <Text style={styles.tripChipTitle}>{message.savedTrip.title}</Text>
                      <Text style={styles.tripChipLink}>View itinerary ›</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {status === 'thinking' && (
              <View style={[styles.row, styles.rowTheirs]}>
                <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
                <View style={[styles.bubble, styles.assistantBubble, styles.typing]}>
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                  <Text style={styles.typingText}>Thinking…</Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.dock}>
            {error ? (
              <View accessibilityRole="alert" style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {status !== 'idle' && status !== 'thinking' && (
              <Text accessibilityLiveRegion="polite" style={styles.status}>
                {status === 'listening' ? `Listening · 0:${String(seconds).padStart(2, '0')} / 0:30 · tap to send` : statusLabels[status]}
              </Text>
            )}
            <View style={styles.composer}>
              <TextInput value={draft} onChangeText={setDraft} placeholder={status === 'listening' ? 'Listening…' : 'Type a message…'}
                placeholderTextColor={colors.textMuted} style={styles.composerInput} multiline maxLength={2000}
                editable={status === 'idle' || status === 'speaking'} accessibilityLabel="Message" />
              {typing ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Send message" onPress={send}
                  style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}>
                  <Text style={styles.sendIcon}>↑</Text>
                </Pressable>
              ) : (
                <MicButton status={status} disabled={busy} onPress={() => {
                  if (status === 'listening') void voice.finishRecording();
                  else if (status === 'speaking') void voice.stopSpeaking();
                  else void voice.startRecording();
                }} />
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <View style={styles.tabBar}>
        {(Object.keys(tabs) as Tab[]).map(item => (
          <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={styles.tab}>
            <View style={[styles.tabIndicator, tab === item && styles.tabIndicatorActive]} />
            <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{tabs[item]}</Text>
          </Pressable>
        ))}
      </View>

      <PurchaseSheet product={voice.pendingPurchase} onClose={voice.cancelPurchase} beforeOpen={wake.unlock}
        onOpened={product => setCheckout({ product, awaitingReturn: true })} />
      <BookingSheet flight={voice.pendingBooking} onClose={voice.cancelBooking} beforeOpen={wake.unlock}
        onOpened={flight => setBooking({ flight, awaitingReturn: true })} />
      <DidBookSheet flight={booking && !booking.awaitingReturn ? booking.flight : null}
        tripTitle={booking ? trips.forFlight(booking.flight)?.title : undefined} onAnswer={answerBooking} />
      <DidBuySheet product={checkout && !checkout.awaitingReturn ? checkout.product : null}
        price={checkout ? formatMoney(checkout.product.priceValue ?? parsePrice(checkout.product.price) ?? 0) : ''} onAnswer={answerCheckout} />
      <WakeWordSheet visible={wakeOpen} onClose={() => setWakeOpen(false)} state={wake} />
      <ServerSheet visible={settingsOpen} serverUrl={connection.serverUrl} onClose={() => setSettingsOpen(false)} onSave={connection.update} />
    </SafeAreaView>
  );
}

export default function App() { return <SafeAreaProvider><AssistantScreen /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, alignSelf: 'stretch' },
  composerInput: { flex: 1, minHeight: 52, maxHeight: 120, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 26, paddingHorizontal: 18, paddingTop: 15, paddingBottom: 15, color: colors.text, fontSize: 15 },
  sendButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  sendIcon: { color: colors.onAccent, fontSize: 24, fontWeight: '800', lineHeight: 26 },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.background },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 10 },
  tabIndicator: { height: 3, width: 36, borderRadius: 2, backgroundColor: 'transparent', marginBottom: 8 },
  tabIndicatorActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: colors.text },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  logo: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: colors.onAccent, fontSize: 20, fontWeight: '800' },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tripChip: { marginTop: 10, marginLeft: 36, alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: colors.success, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, maxWidth: '82%' },
  tripChipLabel: { color: colors.success, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },
  tripChipTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 3 },
  tripChipLink: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: 6 },
  iconButtonOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  micIconSmall: { transform: [{ scale: 0.6 }] },
  lockedView: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  unlockButton: { marginTop: 12, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 36 },
  unlockText: { color: colors.onAccent, fontWeight: '700', fontSize: 15 },
  iconButtonText: { color: colors.text, fontSize: 18, lineHeight: 20 },

  banner: { marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: '#5A2632' },
  bannerTitle: { color: colors.danger, fontWeight: '700', fontSize: 14, marginBottom: 4 },
  bannerText: { color: '#F3C3C9', fontSize: 13, lineHeight: 19 },
  demo: { marginHorizontal: 16, marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#33291A' },
  demoText: { color: colors.warning, fontSize: 12, textAlign: 'center' },

  conversation: { flex: 1 },
  messages: { padding: 16, gap: 12, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 24 },
  orbOuter: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 22, opacity: 0.95 },
  orbInner: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, marginBottom: 18 },
  examples: { gap: 10, alignSelf: 'stretch' },
  example: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16 },
  exampleText: { color: colors.textSecondary, fontSize: 14 },

  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  bubble: { borderRadius: 20, paddingVertical: 11, paddingHorizontal: 15, maxWidth: '82%' },
  userBubble: { backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  assistantBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  userBody: { color: colors.onAccent },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { color: colors.textSecondary, fontSize: 14 },

  dock: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.background },
  errorBox: { alignSelf: 'stretch', backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12 },
  errorText: { color: '#FFC2C8', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  micWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: colors.danger },
  mic: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  stopSquare: { width: 18, height: 18, borderRadius: 4, backgroundColor: '#FFFFFF' },
  micIcon: { alignItems: 'center', width: 28, height: 34 },
  micHead: { width: 12, height: 19, borderRadius: 6 },
  micCup: { position: 'absolute', top: 8, width: 22, height: 17, borderWidth: 2.5, borderTopWidth: 0, borderBottomLeftRadius: 11, borderBottomRightRadius: 11 },
  micStem: { position: 'absolute', bottom: 2, width: 2.5, height: 7, borderRadius: 1 },
  status: { color: colors.textSecondary, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  privacy: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },

  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,6,14,0.6)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34, borderWidth: 1, borderColor: colors.border },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 16 },
  sheetTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  sheetText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 14 },
  input: { backgroundColor: colors.background, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  sheetResult: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryButton: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 15 },
  secondaryButton: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  tips: { marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: colors.background, gap: 6 },
  tipsTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  tip: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
});
