import { describeProducts, validateProducts, type Product, type SearchProducts } from './shopping.ts';
import { describeExpenses, EXPENSE_CATEGORIES, normalizeCategory, validateExpenses, type Expense } from './expenses.ts';
import {
  describeFlights, normalizeTrip, TRIP_KINDS, validateFlights, validateTrips,
  type Flight, type SearchFlights, type TripPlan, type TripSummary,
} from './travel.ts';

export type { Product } from './shopping.ts';
export type { Flight, TripPlan } from './travel.ts';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatMessage {
  role: 'system' | Message['role'];
  content: string;
}

export type NewExpense = Omit<Expense, 'date'>;

export type AssistantAction =
  | { type: 'buy'; product: Product }
  | { type: 'add_expense'; expense: NewExpense }
  | { type: 'save_trip'; trip: TripPlan }
  | { type: 'book_flight'; flight: Flight };

export interface AssistantResponse {
  transcript: string;
  reply: string;
  products?: Product[];
  flights?: Flight[];
  /** Things the app should do, in order (save an expense, show a purchase confirmation, ...). */
  actions?: AssistantAction[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** Provider-shaped conversation entries, including assistant tool calls and tool results. */
export type ToolChatMessage =
  | ChatMessage
  | { role: 'assistant'; content: string | null; tool_calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
}

export interface AssistantServices {
  transcribe(audio: Buffer): Promise<string>;
  generate(messages: ChatMessage[]): Promise<string>;
  /** Optional tool-calling chat; with searchProducts it enables the shopping assistant. */
  chat?(messages: ToolChatMessage[], tools: ToolDefinition[]): Promise<ChatResult>;
  searchProducts?: SearchProducts;
  /** Where the user shops, e.g. "Pakistan; prices are in Pakistani rupees (Rs)". */
  shoppingRegion?: string;
  searchFlights?: SearchFlights;
}

export type Respond = (input: unknown) => Promise<AssistantResponse>;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const SYSTEM_PROMPT = [
  'You are a personal voice assistant. Give concise, conversational replies.',
  'Answer in the language used by the user. Avoid markdown and long lists.',
  'You have no access to calendars, reminders, messages, device settings, or live information.',
  'Never claim you completed an action or checked current information.',
  'If an action needs an integration, explain that it is not connected yet.',
  'If asked to find or buy products, explain that product search is not set up yet on the backend.',
].join(' ');

export const SHOPPING_PROMPT = [
  'You are a personal voice assistant and shopping helper. Your reply is read aloud, so keep it conversational,',
  'under 90 words, with no markdown, lists, symbols, or URLs. Answer in the language used by the user.',
  'When the user wants to buy, compare, or find a product, call search_products with a focused query (brand, type,',
  'key specs, budget). The app shows the results as numbered cards, so refer to products by their number and name,',
  'recommend the best one for the user’s needs, and say why in one or two sentences (value, rating, specs, store).',
  'Only use prices, stores, and ratings that appear in the search results; never invent them.',
  'If the user asks to buy or order a product that is shown, call buy_product with its id. You cannot pay: the app',
  'opens the store page and the user completes checkout there. Never claim an order was placed.',
  'Search right away whenever you know the product type; pick sensible specs yourself for the stated use and budget',
  '(for example 16GB RAM and an SSD for programming) and set min_price near half the budget to skip low-end items.',
  'Only ask a question when you do not know what kind of product they want.',
  'You also keep the user’s expense tracker. When the user says they spent or paid money, call add_expense once',
  'per item; the app saves it. Answer spending questions (totals, biggest categories, this month) only from the',
  'expense list below, adding the numbers carefully.',
  'You are also a travel planner for business trips, vacations, family visits, and religious journeys such as Umrah',
  'and Hajj. When the user wants a trip planned, call create_trip_plan with a realistic day-by-day itinerary (times,',
  'places, rituals or meetings, rest, local transport), a packing and document checklist (visa, passport, tickets),',
  'and a rough budget; the app saves it in the Trips tab and can add it to the phone calendar. Use the dates the user',
  'gives; if none, pick sensible upcoming dates and say so. ALWAYS put trip itineraries in create_trip_plan, never in',
  'your reply: the reply only gives a two or three sentence spoken summary.',
  'When you plan a trip and search flights together, search flights first and use the recommended flight’s real times in the plan.',
  'For Umrah from Pakistan: enter Ihram (with the niyyah and talbiyah) before crossing the Miqat, so at home, the',
  'airport, or on the plane before Yalamlam or Qarn al-Manazil; on arrival in Makkah perform Umrah right away (Tawaf of Umrah,',
  'two rakat, Zamzam, Sai between Safa and Marwah, then halq or taqsir) and only then leave Ihram. Plan Madinah days',
  'for Masjid an-Nabawi, salam at the Rawdah (permit via the Nusuk app), Quba, and Uhud. Mention the Umrah visa and',
  'Nusuk. For Hajj follow the 8 to 13 Dhul Hijjah sequence (Mina, Arafah, Muzdalifah, Rami, sacrifice, Tawaf al-Ifadah).',
  'For flights call search_flights with IATA airport codes (Lahore LHE, Karachi KHI, Islamabad ISB, Jeddah JED,',
  'Madinah MED, Dubai DXB) and a date; search each direction separately for return trips. Refer to flights by card',
  'number, recommend one (price, duration, stops), and never invent prices or times. When the user wants to book a',
  'shown flight, call book_flight; the app confirms and opens the booking page, where the user picks the seller and',
  'pays. Never claim a ticket is booked.',
  'You cannot read or change reminders, messages, or device settings.',
].join(' ');

const SHOPPING_TOOLS: ToolDefinition[] = [
  {
    name: 'search_products',
    description: 'Search online stores for real products with current prices, stores, and ratings.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product words and specs only, like a store search box, e.g. "laptop core i5 16GB RAM SSD". Never put prices, budgets, or the purpose ("for programming") in it; use min_price/max_price for budgets.' },
        min_price: { type: 'number', description: 'Optional minimum price in the local currency; use it to skip cheap accessories or low-end items.' },
        max_price: { type: 'number', description: 'Optional maximum price in the local currency.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'buy_product',
    description: 'Start buying a product that is currently shown. The app asks the user to confirm, then opens the store page.',
    parameters: {
      type: 'object',
      properties: { product_id: { type: 'string', description: 'The product id, e.g. "p2".' } },
      required: ['product_id'],
    },
  },
  {
    name: 'search_flights',
    description: 'Search real flights with current prices and schedules for one direction on one date.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Departure IATA airport code, e.g. "LHE".' },
        to: { type: 'string', description: 'Arrival IATA airport code, e.g. "JED".' },
        date: { type: 'string', description: 'Departure date, YYYY-MM-DD.' },
        adults: { type: 'number', description: 'Number of adult passengers (default 1).' },
        travel_class: { type: 'string', enum: ['economy', 'premium', 'business', 'first'] },
      },
      required: ['from', 'to', 'date'],
    },
  },
  {
    name: 'book_flight',
    description: 'Start booking a flight that is currently shown. The app asks the user to confirm, then opens the booking page.',
    parameters: {
      type: 'object',
      properties: { flight_id: { type: 'string', description: 'The flight id, e.g. "f2".' } },
      required: ['flight_id'],
    },
  },
  {
    name: 'create_trip_plan',
    description: 'Save a day-by-day trip plan to the user’s Trips tab.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'e.g. "Umrah, December 2026".' },
        kind: { type: 'string', enum: [...TRIP_KINDS] },
        destination: { type: 'string' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD' },
        travelers: { type: 'number' },
        budget: { type: 'string', description: 'Rough total, e.g. "Rs 450,000 for 2 people".' },
        summary: { type: 'string', description: 'Two or three sentences.' },
        days: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              title: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { time: { type: 'string', description: 'e.g. "09:00"' }, title: { type: 'string' }, notes: { type: 'string' } },
                  required: ['title'],
                },
              },
            },
            required: ['date', 'title', 'items'],
          },
        },
        checklist: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'kind', 'destination', 'start_date', 'end_date', 'summary', 'days'],
    },
  },
  {
    name: 'add_expense',
    description: 'Save money the user says they spent to their expense tracker.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short description, e.g. "Groceries at Imtiaz".' },
        amount: { type: 'number', description: 'Amount in the local currency.' },
        category: { type: 'string', enum: [...EXPENSE_CATEGORIES] },
      },
      required: ['title', 'amount', 'category'],
    },
  },
];

const MAX_TOOL_ROUNDS = 4;

export interface AssistantInput {
  /** Recorded speech, or undefined when the user typed `text`. */
  audio?: Buffer;
  text?: string;
  history: Message[];
  products: Product[];
  expenses: Expense[];
  flights: Flight[];
  trips: TripSummary[];
}

export function validateInput(body: unknown): AssistantInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Expected a JSON object.');
  }
  const { audioBase64, text, history = [], products, expenses, flights, trips } = body as Record<string, unknown>;
  const context = {
    history: validateHistory(history), products: validateProducts(products), expenses: validateExpenses(expenses),
    flights: validateFlights(flights), trips: validateTrips(trips),
  };
  if (typeof text === 'string' && text.trim()) {
    if (text.length > 2000) throw new ApiError(400, 'Messages must be at most 2000 characters.');
    return { text: text.trim(), ...context };
  }
  if (typeof audioBase64 !== 'string' || !audioBase64.length) {
    throw new ApiError(400, 'audioBase64 is required.');
  }
  if (audioBase64.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4) {
    throw new ApiError(413, 'Audio must be smaller than 4 MB.');
  }
  if (audioBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) {
    throw new ApiError(400, 'Audio must be valid base64.');
  }
  const audio = Buffer.from(audioBase64, 'base64');
  if (audio.toString('base64') !== audioBase64 || !audio.length) {
    throw new ApiError(400, 'Audio must be valid base64.');
  }
  if (audio.length > MAX_AUDIO_BYTES) throw new ApiError(413, 'Audio is too large.');
  return { audio, ...context };
}

function validateHistory(history: unknown): Message[] {
  if (!Array.isArray(history) || history.length > 8 || history.length % 2 !== 0) {
    throw new ApiError(400, 'History must contain at most four complete conversation turns.');
  }
  let total = 0;
  const messages: Message[] = history.map((item: unknown, index: number) => {
    const message = item as Partial<Message> | null;
    if (!message || message.role !== (index % 2 === 0 ? 'user' : 'assistant') ||
        typeof message.content !== 'string' || !message.content.trim() || message.content.length > 4000) {
      throw new ApiError(400, 'History must alternate user and assistant text, at most 4000 characters each.');
    }
    total += message.content.length;
    return { role: message.role, content: message.content.trim() };
  });
  if (total > 16000) throw new ApiError(400, 'Conversation context is too long. Start a new conversation.');
  return messages;
}

function parseArguments(call: ToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(call.arguments || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

async function runTools(
  services: Pick<AssistantServices, 'searchProducts' | 'shoppingRegion' | 'searchFlights'> & Required<Pick<AssistantServices, 'chat'>>,
  input: AssistantInput, transcript: string,
): Promise<Omit<AssistantResponse, 'transcript'>> {
  const shown = input.products;
  const shownFlights = input.flights;
  const tools = SHOPPING_TOOLS.filter(tool =>
    (services.searchProducts || (tool.name !== 'search_products' && tool.name !== 'buy_product')) &&
    (services.searchFlights || (tool.name !== 'search_flights' && tool.name !== 'book_flight')));
  const context = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    services.searchProducts
      ? `The user shops in ${services.shoppingRegion ?? 'their local region'}.`
      : 'Product search is not set up on the backend yet; say so if the user wants to shop.',
    services.searchFlights ? '' : 'Flight search is not set up on the backend (SERPAPI_KEY); you can still plan trips.',
    shown.length ? `Products currently shown to the user:\n${describeProducts(shown)}` : '',
    shownFlights.length ? `Flights currently shown to the user:\n${describeFlights(shownFlights)}` : '',
    input.trips.length ? `Saved trips:\n${input.trips.map(trip => `${trip.title} | ${trip.destination} | ${trip.startDate} to ${trip.endDate}`).join('\n')}` : '',
    `Expense list (date | category | title | amount):\n${describeExpenses(input.expenses)}`,
  ].filter(Boolean).join('\n\n');
  const messages: ToolChatMessage[] = [
    { role: 'system', content: `${SHOPPING_PROMPT}\n\n${context}` },
    ...input.history,
    { role: 'user', content: transcript },
  ];
  let products: Product[] | undefined;
  let flights: Flight[] | undefined;
  const actions: AssistantAction[] = [];
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // The last round withholds tools so the model must answer in words.
    const result = await services.chat(messages, round < MAX_TOOL_ROUNDS ? tools : []);
    if (!result.toolCalls.length) {
      const reply = result.content.trim();
      if (!reply) throw new ApiError(502, 'The model returned an empty reply. Please try again.');
      return { reply: reply.slice(0, 2000), ...(products ? { products } : {}), ...(flights ? { flights } : {}), ...(actions.length ? { actions } : {}) };
    }
    messages.push({
      role: 'assistant', content: result.content || null,
      tool_calls: result.toolCalls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })),
    });
    for (const call of result.toolCalls) {
      const args = parseArguments(call);
      let output: string;
      if (call.name === 'search_products' && services.searchProducts && typeof args.query === 'string' && args.query.trim()) {
        const maxPrice = positive(args.max_price);
        // A budget means the user wants something good near it, not toys and accessories far below it.
        const minPrice = positive(args.min_price) ?? (maxPrice ? Math.round(maxPrice * 0.4) : undefined);
        products = await services.searchProducts(args.query.trim(), { minPrice, maxPrice });
        output = products.length
          ? `Results shown to the user as cards:\n${describeProducts(products)}`
          : 'No products found. Suggest a broader search or a different budget.';
      } else if (call.name === 'buy_product' && services.searchProducts) {
        const product = [...(products ?? []), ...shown].find(item => item.id === args.product_id);
        if (product) {
          actions.push({ type: 'buy', product });
          output = `The app now shows a confirmation; if the user confirms, it opens ${product.store} for checkout. Tell them to confirm on screen. Do not say the page is already open. No order has been placed.`;
        } else output = 'That product id is not on screen. Ask the user which product they mean.';
      } else if (call.name === 'add_expense' && typeof args.title === 'string' && args.title.trim() && positive(args.amount)) {
        actions.push({ type: 'add_expense', expense: { title: args.title.trim().slice(0, 120), amount: positive(args.amount)!, category: normalizeCategory(args.category) } });
        output = 'Saved to the expense tracker. Confirm it to the user in one short sentence.';
      } else if (call.name === 'search_flights' && services.searchFlights && typeof args.from === 'string' && typeof args.to === 'string' && typeof args.date === 'string') {
        const travelClass = (['economy', 'premium', 'business', 'first'] as const).find(value => value === args.travel_class);
        try {
          flights = await services.searchFlights({ from: args.from.trim().toUpperCase(), to: args.to.trim().toUpperCase(), date: args.date, adults: positive(args.adults), travelClass });
          output = flights.length ? `Flights shown to the user as cards:\n${describeFlights(flights)}` : 'No flights found for that route and date. Suggest nearby dates or airports.';
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 400) throw error;
          output = error.message;
        }
      } else if (call.name === 'book_flight' && services.searchFlights) {
        const flight = [...(flights ?? []), ...shownFlights].find(item => item.id === args.flight_id);
        if (flight) {
          actions.push({ type: 'book_flight', flight });
          output = 'The app now shows a confirmation; if the user confirms, it opens the booking page where they choose the seller and pay. Tell them to confirm on screen. No ticket has been booked.';
        } else output = 'That flight id is not on screen. Ask the user which flight they mean.';
      } else if (call.name === 'create_trip_plan') {
        const trip = normalizeTrip(args);
        if (typeof trip === 'string') output = `Not saved: ${trip} Call create_trip_plan again with the fix.`;
        else {
          actions.push({ type: 'save_trip', trip });
          output = `Saved "${trip.title}" (${trip.days.length} days) to the Trips tab. Summarise the plan briefly and offer to search flights or add it to the calendar.`;
        }
      } else output = 'Unknown tool or missing arguments.';
      messages.push({ role: 'tool', tool_call_id: call.id, content: output });
    }
  }
  throw new ApiError(502, 'The assistant could not finish this request. Please try again.');
}

export function createAssistant(services: AssistantServices): Respond {
  const { transcribe, generate, chat } = services;
  return async function respond(body: unknown): Promise<AssistantResponse> {
    const input = validateInput(body);
    const transcript = input.text ?? (await transcribe(input.audio!)).trim();
    if (!transcript) throw new ApiError(422, 'No speech was detected. Please try again.');
    if (transcript.length > 4000) throw new ApiError(422, 'Please use a shorter recording.');
    if (chat) return { transcript, ...await runTools({ ...services, chat }, input, transcript) };
    const reply = (await generate([
      { role: 'system', content: SYSTEM_PROMPT },
      ...input.history,
      { role: 'user', content: transcript },
    ])).trim();
    if (!reply) throw new ApiError(502, 'The model returned an empty reply. Please try again.');
    return { transcript, reply: reply.slice(0, 2000) };
  };
}
