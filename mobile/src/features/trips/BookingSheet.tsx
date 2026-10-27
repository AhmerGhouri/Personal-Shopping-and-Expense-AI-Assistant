import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Flight } from '../../api/assistant';
import { colors } from '../../theme';
import { flightPrice, FlightRoute } from './FlightCards';
import { shortDate } from './trips';

/**
 * Every booking goes through this confirmation. The app never pays: it opens Google Flights,
 * where the user picks the airline or agent, enters passenger details, and pays.
 */
export function BookingSheet({ flight, onClose, onOpened, beforeOpen }: {
  flight: Flight | null; onClose: () => void; onOpened: (flight: Flight) => void; beforeOpen?: () => Promise<boolean>;
}) {
  const [error, setError] = useState('');
  async function open() {
    if (!flight) return;
    try {
      if (beforeOpen && !await beforeOpen()) { setError('Unlock your phone to continue to booking.'); return; }
      await Linking.openURL(flight.bookingUrl);
      setError('');
      onOpened(flight);
      onClose();
    } catch {
      setError('Could not open the booking page. Check that a web browser is installed.');
    }
  }
  return (
    <Modal visible={!!flight} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cancel booking" />
        {flight && (
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.heading}>Book this flight?</Text>
            <View style={styles.card}>
              <Text style={styles.airline}>{flight.airline}</Text>
              <Text style={styles.meta}>{shortDate(flight.departTime)}{flight.flightNumbers.length ? ` · ${flight.flightNumbers.join(', ')}` : ''}</Text>
              <FlightRoute flight={flight} />
              <Text style={styles.price}>{flightPrice(flight)}</Text>
            </View>
            <Text style={styles.note}>
              We’ll open Google Flights for this route and date. Pick this flight, choose the airline or agent, add passenger details and pay there. Prices can change until you pay. Nothing is charged by this app.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Not now</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={open} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Continue to booking</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

/** Shown when the user comes back from booking, so tickets land in Trips and Expenses. */
export function DidBookSheet({ flight, tripTitle, onAnswer }: { flight: Flight | null; tripTitle?: string; onAnswer: (booked: boolean) => void }) {
  return (
    <Modal visible={!!flight} transparent animationType="fade" onRequestClose={() => onAnswer(false)} statusBarTranslucent>
      <View style={[styles.backdrop, styles.centered]}>
        {flight && (
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Did you book it?</Text>
            <Text style={styles.dialogText}>{flight.airline} · {flight.from} → {flight.to} · {shortDate(flight.departTime)}</Text>
            <Text style={styles.dialogPrice}>{flightPrice(flight)}</Text>
            <Text style={styles.dialogHint}>
              We’ll add it to your expenses{tripTitle ? ` and to “${tripTitle}”` : ''}.
            </Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => onAnswer(false)} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Not yet</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => onAnswer(true)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Yes, add it</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,6,14,0.6)' },
  centered: { justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34, borderWidth: 1, borderColor: colors.border },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 16 },
  heading: { color: colors.text, fontSize: 19, fontWeight: '700', marginBottom: 14 },
  card: { backgroundColor: colors.background, borderRadius: 14, padding: 14 },
  airline: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  price: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 12 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 14 },
  error: { color: colors.danger, fontSize: 13, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  secondary: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  primary: { flex: 1.5, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: colors.onAccent, fontWeight: '700', fontSize: 15 },
  dialog: { backgroundColor: colors.surface, borderRadius: 24, padding: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  dialogTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  dialogText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  dialogPrice: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 8 },
  dialogHint: { color: colors.textMuted, fontSize: 12.5, marginTop: 6, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
