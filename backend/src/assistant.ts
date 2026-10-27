import { describeProducts, validateProducts, type Product, type SearchProducts } from './shopping.ts';
import { describeExpenses, EXPENSE_CATEGORIES, normalizeCategory, validateExpenses, type Expense } from './expenses.ts';

export type { Product } from './shopping.ts';

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
  | { type: 'add_expense'; expense: NewExpense };

export interface AssistantResponse {
  transcript: string;
  reply: string;
  products?: Product[];
  action?: AssistantAction;
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
  'You have no access to calendars, reminders, messages, or device settings.',
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

const MAX_TOOL_ROUNDS = 3;

export interface AssistantInput {
  /** Recorded speech, or undefined when the user typed `text`. */
  audio?: Buffer;
  text?: string;
  history: Message[];
  products: Product[];
  expenses: Expense[];
}

export function validateInput(body: unknown): AssistantInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Expected a JSON object.');
  }
  const { audioBase64, text, history = [], products, expenses } = body as Record<string, unknown>;
  if (typeof text === 'string' && text.trim()) {
    if (text.length > 2000) throw new ApiError(400, 'Messages must be at most 2000 characters.');
    return { text: text.trim(), history: validateHistory(history), products: validateProducts(products), expenses: validateExpenses(expenses) };
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
  return { audio, history: validateHistory(history), products: validateProducts(products), expenses: validateExpenses(expenses) };
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
  services: Pick<AssistantServices, 'searchProducts' | 'shoppingRegion'> & Required<Pick<AssistantServices, 'chat'>>,
  input: AssistantInput, transcript: string,
): Promise<Omit<AssistantResponse, 'transcript'>> {
  const shown = input.products;
  const tools = SHOPPING_TOOLS.filter(tool => services.searchProducts || (tool.name !== 'search_products' && tool.name !== 'buy_product'));
  const context = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    services.searchProducts
      ? `The user shops in ${services.shoppingRegion ?? 'their local region'}.`
      : 'Product search is not set up on the backend yet; say so if the user wants to shop.',
    shown.length ? `Products currently shown to the user:\n${describeProducts(shown)}` : '',
    `Expense list (date | category | title | amount):\n${describeExpenses(input.expenses)}`,
  ].filter(Boolean).join('\n\n');
  const messages: ToolChatMessage[] = [
    { role: 'system', content: `${SHOPPING_PROMPT}\n\n${context}` },
    ...input.history,
    { role: 'user', content: transcript },
  ];
  let products: Product[] | undefined;
  let action: AssistantAction | undefined;
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // The last round withholds tools so the model must answer in words.
    const result = await services.chat(messages, round < MAX_TOOL_ROUNDS ? tools : []);
    if (!result.toolCalls.length) {
      const reply = result.content.trim();
      if (!reply) throw new ApiError(502, 'The model returned an empty reply. Please try again.');
      return { reply: reply.slice(0, 2000), ...(products ? { products } : {}), ...(action ? { action } : {}) };
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
          action = { type: 'buy', product };
          output = `The app now shows a confirmation; if the user confirms, it opens ${product.store} for checkout. Tell them to confirm on screen. Do not say the page is already open. No order has been placed.`;
        } else output = 'That product id is not on screen. Ask the user which product they mean.';
      } else if (call.name === 'add_expense' && typeof args.title === 'string' && args.title.trim() && positive(args.amount)) {
        action = { type: 'add_expense', expense: { title: args.title.trim().slice(0, 120), amount: positive(args.amount)!, category: normalizeCategory(args.category) } };
        output = 'Saved to the expense tracker. Confirm it to the user in one short sentence.';
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
