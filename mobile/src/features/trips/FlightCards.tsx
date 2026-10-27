import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Flight } from '../../api/assistant';
import { formatMoney } from '../expenses/expenses';
import { colors } from '../../theme';
import { shortDate } from './trips';

export function clock(time: string) { return time.slice(11, 16); }
export function duration(minutes: number) { return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`; }
export function flightPrice(flight: Flight) {
  return flight.currency === 'PKR' ? formatMoney(flight.price) : `${flight.currency} ${flight.price.toLocaleString()}`;
}
/** Days between departure and arrival dates, shown like "+1". */
function dayShift(flight: Flight) {
  const days = Math.round((Date.parse(flight.arriveTime.slice(0, 10)) - Date.parse(flight.departTime.slice(0, 10))) / 86400000);
  return days > 0 ? ` +${days}` : '';
}

function badges(flights: Flight[]) {
  const result = new Map<string, string[]>(flights.map(flight => [flight.id, []]));
  if (flights.length > 1) {
    result.get(flights.reduce((best, flight) => flight.price < best.price ? flight : best).id)!.push('Cheapest');
    result.get(flights.reduce((best, flight) => flight.durationMinutes < best.durationMinutes ? flight : best).id)!.push('Fastest');
  }
  return result;
}

export function FlightRoute({ flight }: { flight: Flight }) {
  return (
    <View style={styles.route}>
      <View>
        <Text style={styles.time}>{clock(flight.departTime)}</Text>
        <Text style={styles.airport}>{flight.from}</Text>
      </View>
      <View style={styles.middle}>
        <Text style={styles.duration}>{duration(flight.durationMinutes)}</Text>
        <View style={styles.line}><View style={styles.dot} />{flight.stops > 0 && <View style={[styles.dot, styles.stopDot]} />}<View style={styles.dot} /></View>
        <Text style={styles.stops}>{flight.stops ? `${flight.stops} stop${flight.stops > 1 ? 's' : ''}${flight.layovers ? ` · ${flight.layovers}` : ''}` : 'Nonstop'}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.time}>{clock(flight.arriveTime)}<Text style={styles.shift}>{dayShift(flight)}</Text></Text>
        <Text style={styles.airport}>{flight.to}</Text>
      </View>
    </View>
  );
}

export function FlightCards({ flights, onBook }: { flights: Flight[]; onBook: (flight: Flight) => void }) {
  const labels = badges(flights);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.row}>
      {flights.map((flight, index) => (
        <View key={flight.id} style={styles.card}>
          <View style={styles.header}>
            <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
            {flight.airlineLogo ? <Image source={{ uri: flight.airlineLogo }} style={styles.logo} resizeMode="contain" /> : null}
            <Text numberOfLines={1} style={styles.airline}>{flight.airline}</Text>
          </View>
          <Text style={styles.date}>{shortDate(flight.departTime)}{flight.flightNumbers.length ? ` · ${flight.flightNumbers.join(', ')}` : ''}</Text>
          <FlightRoute flight={flight} />
          {!!labels.get(flight.id)?.length && (
            <View style={styles.badges}>
              {labels.get(flight.id)!.map(label => <View key={label} style={styles.badge}><Text style={styles.badgeText}>{label}</Text></View>)}
            </View>
          )}
          <View style={styles.footer}>
            <View>
              <Text style={styles.price}>{flightPrice(flight)}</Text>
              <Text style={styles.priceNote}>{flight.travelClass ?? 'Economy'} · total</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Book ${flight.airline} flight`} onPress={() => onBook(flight)}
              style={({ pressed }) => [styles.book, pressed && styles.pressed]}>
              <Text style={styles.bookText}>Book</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { marginHorizontal: -16, marginTop: 10 },
  row: { paddingHorizontal: 16, gap: 10 },
  card: { width: 268, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  number: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  logo: { width: 22, height: 22, borderRadius: 4, backgroundColor: '#FFFFFF' },
  airline: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  date: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  route: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  time: { color: colors.text, fontSize: 19, fontWeight: '800' },
  shift: { color: colors.warning, fontSize: 11, fontWeight: '700' },
  airport: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 1 },
  middle: { flex: 1, alignItems: 'center' },
  right: { alignItems: 'flex-end' },
  duration: { color: colors.textSecondary, fontSize: 11 },
  line: { alignSelf: 'stretch', height: 2, backgroundColor: colors.border, marginVertical: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  stopDot: { backgroundColor: colors.warning },
  stops: { color: colors.textMuted, fontSize: 11 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 10 },
  badge: { backgroundColor: '#15392B', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: colors.success, fontSize: 10.5, fontWeight: '700' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  price: { color: colors.text, fontSize: 17, fontWeight: '800' },
  priceNote: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  book: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 20 },
  bookText: { color: colors.onAccent, fontWeight: '700', fontSize: 13 },
  pressed: { opacity: 0.75 },
});
