import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addToCalendar, localTime } from '../../native/calendar';
import type { Flight } from '../../api/assistant';
import { colors } from '../../theme';
import { flightPrice, FlightRoute } from './FlightCards';
import { dateRange, kindColors, kindLabels, shortDate, type Trip } from './trips';

const DAY_MS = 86400000;

function daysUntil(date: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((localTime(date) - today.getTime()) / DAY_MS);
}

function countdown(trip: Trip) {
  const start = daysUntil(trip.startDate), end = daysUntil(trip.endDate);
  if (end < 0) return 'Completed';
  if (start <= 0) return 'Happening now';
  return start === 1 ? 'Tomorrow' : `In ${start} days`;
}

export function TripsScreen({ trips, openTripId, onOpenTrip, onUpdate, onRemove }: {
  trips: Trip[]; openTripId: string | null; onOpenTrip: (id: string | null) => void;
  onUpdate: (id: string, change: (trip: Trip) => Trip) => void; onRemove: (id: string) => void;
}) {
  const open = trips.find(trip => trip.id === openTripId) ?? null;
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        {!trips.length && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptyText}>
              Ask the assistant to plan one, for example “Plan Umrah for two from Lahore, 10 to 20 December” or “Plan a 3-day business trip to Dubai next week and find flights”.
            </Text>
          </View>
        )}
        {trips.map(trip => (
          <Pressable key={trip.id} accessibilityRole="button" onPress={() => onOpenTrip(trip.id)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <View style={[styles.stripe, { backgroundColor: kindColors[trip.kind] }]} />
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={[styles.kind, { color: kindColors[trip.kind] }]}>{kindLabels[trip.kind].toUpperCase()}</Text>
                <Text style={styles.countdown}>{countdown(trip)}</Text>
              </View>
              <Text style={styles.cardTitle}>{trip.title}</Text>
              <Text style={styles.cardMeta}>{trip.destination} · {dateRange(trip.startDate, trip.endDate)}</Text>
              <Text style={styles.cardMeta}>
                {trip.days.length} days planned{trip.flights.length ? ` · ${trip.flights.length} flight${trip.flights.length > 1 ? 's' : ''} booked` : ''}
                {trip.checklist.length ? ` · ${trip.done.length}/${trip.checklist.length} ready` : ''}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <TripDetail trip={open} onClose={() => onOpenTrip(null)} onUpdate={onUpdate} onRemove={id => { onRemove(id); onOpenTrip(null); }} />
    </View>
  );
}

function TripDetail({ trip, onClose, onUpdate, onRemove }: {
  trip: Trip | null; onClose: () => void; onUpdate: (id: string, change: (trip: Trip) => Trip) => void; onRemove: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState('');
  const close = () => { setConfirmDelete(false); setNotice(''); onClose(); };

  async function calendar(event: Parameters<typeof addToCalendar>[0]) {
    try { await addToCalendar(event); setNotice(''); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not open the calendar.'); }
  }

  function addTrip(current: Trip) {
    void calendar({
      title: current.title, allDay: true, begin: localTime(current.startDate), end: localTime(current.endDate) + DAY_MS,
      location: current.destination,
      description: [current.summary, ...current.days.map(day => `${shortDate(day.date)}: ${day.title}`)].join('\n'),
    });
  }

  function addFlight(flight: Flight) {
    const begin = localTime(flight.departTime.slice(0, 10), flight.departTime.slice(11, 16));
    void calendar({
      title: `Flight ${flight.from} → ${flight.to} (${flight.airline})`, begin, end: begin + flight.durationMinutes * 60000,
      location: `${flight.from} airport`, description: `${flight.flightNumbers.join(', ')}\nTimes are local airport times.`,
    });
  }

  return (
    <Modal visible={!!trip} animationType="slide" onRequestClose={close}>
      {trip && (
        <SafeAreaView style={styles.detail} edges={['top', 'bottom']}>
          <View style={styles.detailHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to trips" onPress={close} hitSlop={10} style={styles.back}>
              <Text style={styles.backText}>‹</Text>
            </Pressable>
            <Text numberOfLines={1} style={styles.detailHeaderTitle}>{trip.title}</Text>
          </View>
          <ScrollView contentContainerStyle={styles.detailContent}>
            <View style={styles.hero}>
              <Text style={[styles.kind, { color: kindColors[trip.kind] }]}>{kindLabels[trip.kind].toUpperCase()} · {countdown(trip).toUpperCase()}</Text>
              <Text style={styles.heroTitle}>{trip.destination}</Text>
              <Text style={styles.heroMeta}>{dateRange(trip.startDate, trip.endDate)} · {trip.travelers} traveler{trip.travelers > 1 ? 's' : ''}</Text>
              {trip.budget ? <Text style={styles.heroMeta}>Budget: {trip.budget}</Text> : null}
              {trip.summary ? <Text style={styles.summary}>{trip.summary}</Text> : null}
              <Pressable accessibilityRole="button" onPress={() => addTrip(trip)} style={({ pressed }) => [styles.calendarButton, pressed && styles.pressed]}>
                <Text style={styles.calendarButtonText}>Add trip to calendar</Text>
              </Pressable>
              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            </View>

            {trip.flights.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Flights</Text>
                {trip.flights.map(flight => (
                  <View key={`${flight.id}-${flight.departTime}`} style={styles.flight}>
                    <Text style={styles.flightAirline}>{flight.airline} · {shortDate(flight.departTime)}</Text>
                    <FlightRoute flight={flight} />
                    <View style={styles.flightFooter}>
                      <Text style={styles.flightPrice}>{flightPrice(flight)}</Text>
                      <Pressable accessibilityRole="button" onPress={() => addFlight(flight)} hitSlop={6}>
                        <Text style={styles.link}>Add to calendar</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Itinerary</Text>
              {trip.days.map((day, index) => (
                <View key={day.date + index} style={styles.day}>
                  <View style={styles.dayRail}>
                    <View style={[styles.dayDot, { backgroundColor: kindColors[trip.kind] }]} />
                    {index < trip.days.length - 1 && <View style={styles.dayLine} />}
                  </View>
                  <View style={styles.dayBody}>
                    <Text style={styles.dayDate}>Day {index + 1} · {shortDate(day.date)}</Text>
                    <Text style={styles.dayTitle}>{day.title}</Text>
                    {day.items.map((item, itemIndex) => (
                      <Pressable key={itemIndex} accessibilityRole="button" accessibilityHint="Adds this to your calendar"
                        onLongPress={() => {
                          const begin = localTime(day.date, item.time);
                          void calendar({ title: item.title, begin, end: begin + 3600000, allDay: !item.time, location: trip.destination, description: item.notes });
                        }}
                        style={styles.item}>
                        <Text style={styles.itemTime}>{item.time ?? '•'}</Text>
                        <View style={styles.itemBody}>
                          <Text style={styles.itemTitle}>{item.title}</Text>
                          {item.notes ? <Text style={styles.itemNotes}>{item.notes}</Text> : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
              <Text style={styles.hint}>Long-press any activity to add it to your calendar.</Text>
            </View>

            {trip.checklist.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Checklist · {trip.done.length}/{trip.checklist.length}</Text>
                {trip.checklist.map(item => {
                  const done = trip.done.includes(item);
                  return (
                    <Pressable key={item} accessibilityRole="checkbox" accessibilityState={{ checked: done }} style={styles.check}
                      onPress={() => onUpdate(trip.id, current => ({ ...current, done: done ? current.done.filter(entry => entry !== item) : [...current.done, item] }))}>
                      <View style={[styles.box, done && styles.boxDone]}>{done && <Text style={styles.tick}>✓</Text>}</View>
                      <Text style={[styles.checkText, done && styles.checkTextDone]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Pressable accessibilityRole="button" onPress={() => confirmDelete ? onRemove(trip.id) : setConfirmDelete(true)}
              style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
              <Text style={styles.deleteText}>{confirmDelete ? 'Tap again to delete this trip' : 'Delete trip'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12 },
  pressed: { opacity: 0.75 },
  empty: { paddingVertical: 48, paddingHorizontal: 12, alignItems: 'center', gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center' },

  card: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  stripe: { width: 5 },
  cardBody: { flex: 1, padding: 16, gap: 3 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  kind: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  countdown: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 4 },
  cardMeta: { color: colors.textMuted, fontSize: 12.5 },

  detail: { flex: 1, backgroundColor: colors.background },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.text, fontSize: 24, lineHeight: 26 },
  detailHeaderTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700' },
  detailContent: { padding: 16, gap: 16, paddingBottom: 40 },
  hero: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.border },
  heroTitle: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 6 },
  heroMeta: { color: colors.textSecondary, fontSize: 13.5, marginTop: 4 },
  summary: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 12 },
  calendarButton: { marginTop: 16, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  calendarButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 14.5 },
  notice: { color: colors.danger, fontSize: 12.5, marginTop: 8 },

  section: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  flight: { backgroundColor: colors.background, borderRadius: 14, padding: 12, marginBottom: 8 },
  flightAirline: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '600' },
  flightFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  flightPrice: { color: colors.text, fontWeight: '800', fontSize: 15 },
  link: { color: colors.accent, fontWeight: '700', fontSize: 13 },

  day: { flexDirection: 'row', gap: 12 },
  dayRail: { alignItems: 'center', width: 14 },
  dayDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  dayLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 4 },
  dayBody: { flex: 1, paddingBottom: 18 },
  dayDate: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  dayTitle: { color: colors.text, fontSize: 15.5, fontWeight: '700', marginTop: 2, marginBottom: 6 },
  item: { flexDirection: 'row', gap: 10, paddingVertical: 5 },
  itemTime: { color: colors.accent, fontSize: 12.5, fontWeight: '700', width: 46 },
  itemBody: { flex: 1 },
  itemTitle: { color: colors.text, fontSize: 14, lineHeight: 19 },
  itemNotes: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 4 },

  check: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxDone: { backgroundColor: colors.success, borderColor: colors.success },
  tick: { color: colors.background, fontSize: 13, fontWeight: '900' },
  checkText: { flex: 1, color: colors.text, fontSize: 14 },
  checkTextDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  delete: { backgroundColor: colors.dangerSoft, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 14.5 },
});
