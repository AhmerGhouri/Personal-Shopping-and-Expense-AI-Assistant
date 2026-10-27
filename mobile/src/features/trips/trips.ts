import { useCallback, useEffect, useRef, useState } from 'react';
import { Dirs, FileSystem } from 'react-native-file-access';
import type { Flight, TripKind, TripPlan } from '../../api/assistant';

export type Trip = TripPlan & {
  id: string;
  createdAt: string;
  /** Checklist items the user ticked off. */
  done: string[];
  /** Flights the user confirmed they booked for this trip. */
  flights: Flight[];
};

export const kindLabels: Record<TripKind, string> = {
  business: 'Business', vacation: 'Vacation', religious: 'Religious', family: 'Family', other: 'Trip',
};
export const kindColors: Record<TripKind, string> = {
  business: '#5CC8FF', vacation: '#FF9F6B', religious: '#4ADE9A', family: '#C58CFF', other: '#8E9AB0',
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDate(date: string) {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return `${day} ${SHORT_MONTHS[month - 1]} ${year}`;
}
export function dateRange(start: string, end: string) {
  return start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`;
}

const tripsPath = `${Dirs.DocumentDir}/trips.json`;

/** Trip plans are stored only on this phone, like expenses. */
export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const latest = useRef<Trip[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (await FileSystem.exists(tripsPath)) {
          const saved = JSON.parse(await FileSystem.readFile(tripsPath));
          if (Array.isArray(saved) && active) { latest.current = saved; setTrips(saved); }
        }
      } catch { /* A damaged file starts a fresh list rather than crashing the app. */ }
    })();
    return () => { active = false; };
  }, []);

  const persist = useCallback((next: Trip[]) => {
    latest.current = next;
    setTrips(next);
    void FileSystem.writeFile(tripsPath, JSON.stringify(next)).catch(() => {});
  }, []);

  const add = useCallback((plan: TripPlan) => {
    const trip: Trip = { ...plan, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), done: [], flights: [] };
    persist([trip, ...latest.current].sort((a, b) => a.startDate.localeCompare(b.startDate)));
    return trip.id;
  }, [persist]);

  const update = useCallback((id: string, change: (trip: Trip) => Trip) => {
    persist(latest.current.map(trip => trip.id === id ? change(trip) : trip));
  }, [persist]);

  const remove = useCallback((id: string) => persist(latest.current.filter(trip => trip.id !== id)), [persist]);

  /** The saved trip a flight belongs to: the one whose dates include the departure day. */
  const forFlight = useCallback((flight: Flight) => {
    const day = flight.departTime.slice(0, 10);
    return latest.current.find(trip => day >= trip.startDate && day <= trip.endDate);
  }, []);

  return { trips, add, update, remove, forFlight };
}
