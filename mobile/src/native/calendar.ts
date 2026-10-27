import { Linking, NativeModules, Platform } from 'react-native';

type CalendarEvent = { title: string; begin: number; end: number; allDay?: boolean; location?: string; description?: string };
const native = Platform.OS === 'android' ? NativeModules.TripCalendar as { addEvent(event: CalendarEvent): Promise<boolean> } | undefined : undefined;

function googleDate(ms: number, allDay?: boolean) {
  const iso = new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return allDay ? iso.slice(0, 8) : iso;
}

/** Opens the calendar app pre-filled; the user saves the event there. Falls back to Google Calendar on the web. */
export async function addToCalendar(event: CalendarEvent): Promise<void> {
  if (native) { await native.addEvent(event); return; }
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: event.title, dates: `${googleDate(event.begin, event.allDay)}/${googleDate(event.end, event.allDay)}`,
    ...(event.location ? { location: event.location } : {}), ...(event.description ? { details: event.description } : {}),
  });
  await Linking.openURL(`https://calendar.google.com/calendar/render?${params}`);
}

/** "2026-12-10" + optional "09:30" (local time) to epoch ms. */
export function localTime(date: string, time?: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const match = time?.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  let hours = match ? Number(match[1]) : 0;
  if (match?.[3]) hours = (hours % 12) + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  return new Date(year, month - 1, day, hours, match ? Number(match[2]) : 0).getTime();
}
