import { FileSystem } from 'react-native-file-access';

export type Message = { role: 'user' | 'assistant'; content: string };
export type Product = {
  id: string; title: string; price: string; priceValue?: number; store: string; link: string;
  thumbnail?: string; rating?: number; reviews?: number; delivery?: string;
};
export type Flight = {
  id: string; airline: string; airlineLogo?: string; flightNumbers: string[]; from: string; to: string;
  /** Local airport times, "YYYY-MM-DD HH:mm". */
  departTime: string; arriveTime: string; durationMinutes: number; stops: number; layovers?: string;
  price: number; currency: string; travelClass?: string; bookingUrl: string;
};
export type TripKind = 'business' | 'vacation' | 'religious' | 'family' | 'other';
export type TripPlan = {
  title: string; kind: TripKind; destination: string; startDate: string; endDate: string; travelers: number;
  budget?: string; summary: string; checklist: string[];
  days: { date: string; title: string; items: { time?: string; title: string; notes?: string }[] }[];
};
export type AssistantAction =
  | { type: 'buy'; product: Product }
  | { type: 'add_expense'; expense: { title: string; amount: number; category: string } }
  | { type: 'save_trip'; trip: TripPlan }
  | { type: 'book_flight'; flight: Flight };
export type AssistantResponse = {
  transcript: string; reply: string; demo: boolean; products?: Product[]; flights?: Flight[]; actions?: AssistantAction[];
};
export type HealthResult = { mode: 'groq' | 'demo' };

function filePath(uri: string) { return uri.replace(/^file:\/\//, ''); }

export function unreachableMessage(serverUrl: string) {
  return `Can't reach the assistant server at ${serverUrl}. Check that the backend is running, `
    + 'your phone is on the same Wi-Fi as the computer, and Windows Firewall allows Node.js.';
}

/**
 * Fails fast when the computer cannot be reached. Without this, a firewall that silently
 * drops packets leaves the request hanging until the long upload timeout.
 */
export async function checkHealth(serverUrl: string, timeoutMs = 5000): Promise<HealthResult> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(`${serverUrl}/health`, { signal: abort.signal, headers: { 'Cache-Control': 'no-store' } });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.status !== 'ok') throw new Error('bad-health');
    return { mode: body.mode === 'demo' ? 'demo' : 'groq' };
  } catch {
    throw new Error(unreachableMessage(serverUrl));
  } finally {
    clearTimeout(timeout);
  }
}

/** Context the assistant needs: recent turns, products on screen, and the expense log. */
export type AskContext = { history: Message[]; products: Product[]; flights: Flight[]; expenses: ExpenseSummary[]; trips: TripSummary[] };
export type TripSummary = { title: string; destination: string; startDate: string; endDate: string };
export type ExpenseSummary = { title: string; amount: number; category: string; date: string };

export async function sendRecording(serverUrl: string, uri: string, context: AskContext, signal: AbortSignal): Promise<AssistantResponse> {
  const path = filePath(uri);
  const file = await FileSystem.stat(path);
  if (file.size > 4 * 1024 * 1024) throw new Error('The recording is too large. Please try a shorter question.');
  await checkHealth(serverUrl);
  const audioBase64 = await FileSystem.readFile(path, 'base64');
  return ask(serverUrl, { audioBase64 }, context, signal);
}

export async function sendText(serverUrl: string, text: string, context: AskContext, signal: AbortSignal): Promise<AssistantResponse> {
  await checkHealth(serverUrl);
  return ask(serverUrl, { text }, context, signal);
}

async function ask(serverUrl: string, input: { audioBase64: string } | { text: string }, context: AskContext, signal: AbortSignal): Promise<AssistantResponse> {
  const history = context.history.slice(-8);
  while (history.reduce((length, message) => length + message.content.length, 0) > 16000) history.splice(0, 2);
  let response: Response;
  try {
    response = await fetch(`${serverUrl}/v1/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input, history, products: context.products, flights: context.flights,
        expenses: context.expenses.slice(0, 150), trips: context.trips.slice(0, 30),
      }),
      signal,
    });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new Error(unreachableMessage(serverUrl));
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `The assistant could not answer (HTTP ${response.status}).`);
  if (typeof body.transcript !== 'string' || typeof body.reply !== 'string' || typeof body.demo !== 'boolean') {
    throw new Error('Unexpected response from the backend.');
  }
  return body;
}

export async function deleteRecording(uri: string) {
  try { const path = filePath(uri); if (await FileSystem.exists(path)) await FileSystem.unlink(path); } catch { /* Cache cleanup is best effort. */ }
}
