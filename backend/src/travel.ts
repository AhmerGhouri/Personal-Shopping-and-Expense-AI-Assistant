import { ApiError } from './assistant.ts';
import { SERPAPI_URL } from './shopping.ts';

export interface Flight {
  id: string;
  airline: string;
  airlineLogo?: string;
  flightNumbers: string[];
  from: string;
  to: string;
  /** Local airport times as "YYYY-MM-DD HH:mm". */
  departTime: string;
  arriveTime: string;
  durationMinutes: number;
  stops: number;
  layovers?: string;
  price: number;
  currency: string;
  travelClass?: string;
  /** Google Flights page for this search, where the user picks a seller and books. */
  bookingUrl: string;
}

export type FlightQuery = { from: string; to: string; date: string; adults?: number; travelClass?: 'economy' | 'premium' | 'business' | 'first' };
export type SearchFlights = (query: FlightQuery) => Promise<Flight[]>;

export const TRIP_KINDS = ['business', 'vacation', 'religious', 'family', 'other'] as const;
export type TripKind = typeof TRIP_KINDS[number];

export interface TripPlan {
  title: string;
  kind: TripKind;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budget?: string;
  summary: string;
  days: { date: string; title: string; items: { time?: string; title: string; notes?: string }[] }[];
  checklist: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const CLASS_CODES = { economy: '1', premium: '2', business: '3', first: '4' } as const;
const MAX_FLIGHTS = 6;

/** Real flight prices and schedules from Google Flights via SerpApi. */
export function createFlightSearch(env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch): SearchFlights | undefined {
  const key = env.SERPAPI_KEY?.trim();
  if (!key) return undefined;
  const currency = env.TRAVEL_CURRENCY?.trim().toUpperCase() || ((env.SHOPPING_COUNTRY ?? '').toLowerCase() === 'pk' ? 'PKR' : 'USD');

  return async function searchFlights(query) {
    const from = query.from.trim().toUpperCase();
    const to = query.to.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw new ApiError(400, 'Use 3-letter airport codes, like LHE or JED.');
    if (!isDate(query.date)) throw new ApiError(400, 'Use a travel date like 2026-12-20.');
    const params = new URLSearchParams({
      engine: 'google_flights', departure_id: from, arrival_id: to, outbound_date: query.date, type: '2',
      adults: String(Math.min(Math.max(query.adults ?? 1, 1), 9)), travel_class: CLASS_CODES[query.travelClass ?? 'economy'],
      currency, hl: 'en', api_key: key,
    });
    let body: unknown;
    try {
      const response = await request(`${SERPAPI_URL}?${params}`, { signal: AbortSignal.timeout(30000) });
      body = await response.json().catch(() => undefined);
      if (!response.ok) {
        console.error(`[SerpApi flights] status=${response.status}`);
        throw new ApiError(502, response.status === 401 ? 'Flight search rejected the SERPAPI_KEY. Check it in backend/.env.'
          : response.status === 429 ? 'Flight search limit reached for this month.' : 'Flight search failed. Check the airports and date.');
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, 'Could not reach the flight search service. Check the computer’s internet connection.');
    }
    if (!isObject(body)) return [];
    const metadata = isObject(body.search_metadata) ? body.search_metadata : {};
    const bookingUrl = text(metadata.google_flights_url, 2000) ?? `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${from} to ${to} on ${query.date}`)}`;
    const options = [...(Array.isArray(body.best_flights) ? body.best_flights : []), ...(Array.isArray(body.other_flights) ? body.other_flights : [])];
    const flights: Flight[] = [];
    for (const option of options) {
      if (!isObject(option) || !Array.isArray(option.flights) || !option.flights.length || typeof option.price !== 'number') continue;
      const legs = option.flights.filter(isObject);
      const first = legs[0], last = legs[legs.length - 1];
      const departure = isObject(first?.departure_airport) ? first.departure_airport : {};
      const arrival = isObject(last?.arrival_airport) ? last.arrival_airport : {};
      const departTime = text(departure.time, 20), arriveTime = text(arrival.time, 20);
      if (!departTime || !arriveTime) continue;
      const airlines = [...new Set(legs.map(leg => text(leg.airline, 40)).filter(Boolean))] as string[];
      const layovers = Array.isArray(option.layovers)
        ? option.layovers.filter(isObject).map(stop => `${text(stop.id, 5) ?? '?'} ${Math.round((Number(stop.duration) || 0) / 60)}h`).join(', ')
        : '';
      flights.push({
        id: `f${flights.length + 1}`,
        airline: airlines.join(' + ') || 'Airline',
        ...(airlines.length === 1 && text(first.airline_logo, 300) ? { airlineLogo: text(first.airline_logo, 300) } : {}),
        flightNumbers: legs.map(leg => text(leg.flight_number, 12)).filter(Boolean) as string[],
        from: text(departure.id, 5) ?? from, to: text(arrival.id, 5) ?? to,
        departTime, arriveTime,
        durationMinutes: typeof option.total_duration === 'number' ? option.total_duration : 0,
        stops: legs.length - 1,
        ...(layovers ? { layovers } : {}),
        price: option.price, currency,
        ...(text(first.travel_class, 20) ? { travelClass: text(first.travel_class, 20) } : {}),
        bookingUrl,
      });
      if (flights.length === MAX_FLIGHTS) break;
    }
    return flights;
  };
}

export function describeFlights(flights: Flight[]): string {
  return flights.map(flight => [
    `Card ${flight.id.slice(1)} (id ${flight.id}): ${flight.airline} ${flight.flightNumbers.join('/')}`,
    `${flight.from} ${flight.departTime} -> ${flight.to} ${flight.arriveTime}`,
    `${Math.floor(flight.durationMinutes / 60)}h ${flight.durationMinutes % 60}m`,
    flight.stops ? `${flight.stops} stop(s) via ${flight.layovers ?? '?'}` : 'nonstop',
    `price ${flight.price} ${flight.currency}`,
  ].join(' | ')).join('\n');
}

/** Flights echoed back by the app so the assistant can book what is on screen. */
export function validateFlights(value: unknown): Flight[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) throw new ApiError(400, 'flights must be a list of at most 12 items.');
  return value.map(item => {
    if (!isObject(item) || !text(item.id, 10) || !text(item.airline, 80) || typeof item.price !== 'number' ||
        typeof item.bookingUrl !== 'string' || !/^https:\/\//.test(item.bookingUrl) || !text(item.departTime, 20) || !text(item.arriveTime, 20)) {
      throw new ApiError(400, 'Invalid flight.');
    }
    return item as unknown as Flight;
  });
}

/** Turns the model's plan into a bounded, well-formed trip, or explains what is missing. */
export function normalizeTrip(input: Record<string, unknown>): TripPlan | string {
  const title = text(input.title, 80), destination = text(input.destination, 80);
  if (!title || !destination) return 'A trip needs a title and destination.';
  if (!isDate(input.start_date) || !isDate(input.end_date) || input.end_date < input.start_date) return 'Use valid start_date and end_date (YYYY-MM-DD).';
  const days = (Array.isArray(input.days) ? input.days : []).filter(isObject).slice(0, 30).flatMap(day => {
    const items = (Array.isArray(day.items) ? day.items : []).filter(isObject).slice(0, 12).flatMap(item => {
      const itemTitle = text(item.title, 120);
      return itemTitle ? [{ title: itemTitle, ...(text(item.time, 20) ? { time: text(item.time, 20) } : {}), ...(text(item.notes, 300) ? { notes: text(item.notes, 300) } : {}) }] : [];
    });
    return isDate(day.date) && items.length ? [{ date: day.date, title: text(day.title, 80) ?? day.date, items }] : [];
  });
  if (!days.length) return 'Include at least one day with activities.';
  const kind = TRIP_KINDS.find(value => value === input.kind) ?? 'other';
  const travelers = typeof input.travelers === 'number' && input.travelers >= 1 ? Math.min(Math.round(input.travelers), 50) : 1;
  return {
    title, kind, destination, startDate: input.start_date, endDate: input.end_date, travelers,
    ...(text(input.budget, 120) ? { budget: text(input.budget, 120) } : {}),
    summary: text(input.summary, 600) ?? '',
    days,
    checklist: (Array.isArray(input.checklist) ? input.checklist : []).map(item => text(item, 120)).filter(Boolean).slice(0, 25) as string[],
  };
}

export type TripSummary = { title: string; destination: string; startDate: string; endDate: string };

export function validateTrips(value: unknown): TripSummary[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) throw new ApiError(400, 'trips must be a list of at most 30 items.');
  return value.map(item => {
    if (!isObject(item) || !text(item.title, 80) || !text(item.destination, 80) || !isDate(item.startDate) || !isDate(item.endDate)) {
      throw new ApiError(400, 'Invalid trip.');
    }
    return { title: text(item.title, 80)!, destination: text(item.destination, 80)!, startDate: item.startDate, endDate: item.endDate };
  });
}
