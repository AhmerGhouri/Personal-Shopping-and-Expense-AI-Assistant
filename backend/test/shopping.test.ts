import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createAssistant, validateInput, type ChatResult, type ToolChatMessage, type ToolDefinition } from '../src/assistant.ts';
import { createProductSearch, SERPAPI_URL, validateProducts, type Product } from '../src/shopping.ts';

const audioBase64 = Buffer.from('recorded-audio-fixture').toString('base64');
const laptop: Product = { id: 'p1', title: 'Acer Swift Go 14', price: '$699.99', priceValue: 699.99, store: 'Best Buy', link: 'https://www.bestbuy.com/site/123', rating: 4.6, reviews: 812 };

test('product search is disabled without a SerpApi key', () => {
  assert.equal(createProductSearch({}), undefined);
});

test('product search returns bounded real results and skips items without links or prices', async () => {
  const search = createProductSearch({ SERPAPI_KEY: 'test-serp-key', SHOPPING_COUNTRY: 'GB' }, async url => {
    const parsed = new URL(String(url));
    assert.equal(`${parsed.origin}${parsed.pathname}`, SERPAPI_URL);
    assert.equal(parsed.searchParams.get('engine'), 'google_shopping');
    assert.equal(parsed.searchParams.get('gl'), 'gb');
    assert.equal(parsed.searchParams.get('q'), 'gaming laptop');
    return Response.json({ shopping_results: [
      { title: 'ASUS TUF A15', price: 'Rs 250,000', extracted_price: 250000, source: 'Daraz', product_link: 'https://www.google.com/shopping/product/1', thumbnail: 'https://img/1.jpg', rating: 4.5, reviews: 120 },
      { title: 'No link', price: 'Rs 1' },
      { title: 'Insecure', price: 'Rs 1', link: 'http://example.com' },
      { title: 'Too pricey', price: 'Rs 900,000', extracted_price: 900000, source: 'Shop', link: 'https://shop.example/p' },
    ] });
  })!;
  const products = await search('gaming laptop', { maxPrice: 300000 });
  assert.deepEqual(products, [{
    id: 'p1', title: 'ASUS TUF A15', price: 'Rs 250,000', priceValue: 250000, store: 'Daraz',
    link: 'https://www.google.com/shopping/product/1', thumbnail: 'https://img/1.jpg', rating: 4.5, reviews: 120,
  }]);
});

test('product search reports key problems without leaking the key', async () => {
  const search = createProductSearch({ SERPAPI_KEY: 'secret-serp-key' }, async () => Response.json({ error: 'secret-serp-key invalid' }, { status: 401 }))!;
  await assert.rejects(search('laptop'), (error: unknown) => error instanceof ApiError && /SERPAPI_KEY/.test(error.message) && !/secret-serp-key/.test(error.message));
});

test('client-supplied products are validated', () => {
  assert.deepEqual(validateProducts(undefined), []);
  assert.throws(() => validateProducts([{ ...laptop, link: 'javascript:alert(1)' }]), ApiError);
  assert.throws(() => validateProducts('nope'), ApiError);
  assert.equal(validateProducts([laptop])[0].title, laptop.title);
});

test('shopping assistant searches, then recommends using only search results', async () => {
  const calls: { messages: ToolChatMessage[]; tools: ToolDefinition[] }[] = [];
  const respond = createAssistant({
    transcribe: async () => 'I want to buy a laptop under 800 dollars',
    generate: async () => assert.fail('Plain chat should not run when shopping is enabled'),
    searchProducts: async (query, options) => {
      assert.equal(query, 'laptop');
      assert.equal(options?.maxPrice, 800);
      return [laptop];
    },
    async chat(messages, tools): Promise<ChatResult> {
      calls.push({ messages: [...messages], tools });
      if (calls.length === 1) return { content: '', toolCalls: [{ id: 'c1', name: 'search_products', arguments: '{"query":"laptop","max_price":800}' }] };
      const tool = messages.at(-1);
      assert.ok(tool && tool.role === 'tool');
      assert.match(tool.content, /Card 1 \(id p1\): Acer Swift Go 14 \| price \$699\.99 \| store Best Buy/);
      assert.doesNotMatch(tool.content, /bestbuy\.com/, 'URLs are not given to the model');
      return { content: 'Number one, the Acer Swift Go, is the best pick at 699 dollars.', toolCalls: [] };
    },
  });
  const result = await respond({ audioBase64 });
  assert.deepEqual(result.products, [laptop]);
  assert.equal(result.actions, undefined);
  assert.match(result.reply, /Acer Swift Go/);
  assert.deepEqual(calls[0].tools.map(tool => tool.name), ['search_products', 'buy_product', 'create_trip_plan', 'add_expense']);
});

test('buying a shown product returns a confirm-and-open action, never a completed order', async () => {
  const respond = createAssistant({
    transcribe: async () => 'Buy the first one',
    generate: async () => '',
    searchProducts: async () => assert.fail('No search needed'),
    async chat(messages) {
      const system = messages[0];
      assert.match(String(system.content), /Products currently shown to the user:\nCard 1 \(id p1\): Acer Swift Go 14/);
      if (messages.at(-1)?.role !== 'tool') return { content: '', toolCalls: [{ id: 'b1', name: 'buy_product', arguments: '{"product_id":"p1"}' }] };
      return { content: 'Opening Best Buy so you can check out.', toolCalls: [] };
    },
  });
  const result = await respond({ audioBase64, products: [laptop] });
  assert.deepEqual(result.actions, [{ type: 'buy', product: laptop }]);
  assert.equal(result.products, undefined);
});

test('the tool loop is bounded', async () => {
  let rounds = 0;
  const respond = createAssistant({
    transcribe: async () => 'Find a laptop',
    generate: async () => '',
    searchProducts: async () => [laptop],
    async chat(_messages, tools) {
      rounds++;
      if (!tools.length) return { content: 'Here is what I found.', toolCalls: [] };
      return { content: '', toolCalls: [{ id: `s${rounds}`, name: 'search_products', arguments: '{"query":"laptop"}' }] };
    },
  });
  assert.equal((await respond({ audioBase64 })).reply, 'Here is what I found.');
  assert.equal(rounds, 5);
});

test('typed messages skip transcription and expenses can be logged or questioned', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const respond = createAssistant({
    transcribe: async () => assert.fail('Typed text must not be transcribed'),
    generate: async () => '',
    async chat(messages) {
      assert.match(String(messages[0].content), new RegExp(`${today} \| Food \| Lunch \| 900`));
      assert.match(String(messages[0].content), /Product search is not set up/);
      if (messages.at(-1)?.role !== 'tool') {
        return { content: '', toolCalls: [{ id: 'e1', name: 'add_expense', arguments: '{"title":"Groceries","amount":2500,"category":"groceries"}' }] };
      }
      return { content: 'Saved 2500 for groceries.', toolCalls: [] };
    },
  });
  const result = await respond({ text: ' I spent 2500 on groceries ', expenses: [{ title: 'Lunch', amount: 900, category: 'Food', date: today }] });
  assert.equal(result.transcript, 'I spent 2500 on groceries');
  assert.deepEqual(result.actions, [{ type: 'add_expense', expense: { title: 'Groceries', amount: 2500, category: 'Groceries' } }]);
});

test('expense lists are validated', () => {
  assert.throws(() => validateInput({ text: 'hi', expenses: [{ title: 'x', amount: -1, category: 'Food', date: '2026-10-01' }] }), ApiError);
  assert.throws(() => validateInput({ text: 'hi', expenses: [{ title: 'x', amount: 1, category: 'Crypto', date: '2026-10-01' }] }), ApiError);
  assert.throws(() => validateInput({ text: 'x'.repeat(2001) }), ApiError);
});

test('travel tools search flights, book only shown flights, and save validated trip plans', async () => {
  const flight = {
    id: 'f1', airline: 'Saudia', flightNumbers: ['SV 739'], from: 'LHE', to: 'JED', departTime: '2026-12-10 04:00',
    arriveTime: '2026-12-10 08:00', durationMinutes: 300, stops: 0, price: 120000, currency: 'PKR', bookingUrl: 'https://www.google.com/travel/flights?x',
  };
  let call = 0;
  const respond = createAssistant({
    transcribe: async () => 'Plan my Umrah and find flights',
    generate: async () => '',
    searchFlights: async query => {
      assert.deepEqual(query, { from: 'LHE', to: 'JED', date: '2026-12-10', adults: 2, travelClass: undefined });
      return [flight];
    },
    async chat(messages) {
      call++;
      if (call === 1) return { content: '', toolCalls: [
        { id: 't1', name: 'create_trip_plan', arguments: JSON.stringify({ title: 'Umrah', kind: 'religious', destination: 'Makkah and Madinah', start_date: '2026-12-10', end_date: '2026-12-20', travelers: 2, summary: 'Ten days.', days: [{ date: '2026-12-10', title: 'Arrive', items: [{ time: '09:00', title: 'Ihram and Umrah' }] }], checklist: ['Passport', 'Visa'] }) },
        { id: 't2', name: 'search_flights', arguments: '{"from":"lhe","to":"jed","date":"2026-12-10","adults":2}' },
      ] };
      if (call === 2) {
        assert.match(String(messages.at(-1)?.content), /Card 1 \(id f1\): Saudia SV 739 \| LHE 2026-12-10 04:00 -> JED/);
        return { content: '', toolCalls: [{ id: 't3', name: 'book_flight', arguments: '{"flight_id":"f1"}' }] };
      }
      return { content: 'Your Umrah plan is saved. Confirm the Saudia flight on screen.', toolCalls: [] };
    },
  });
  const result = await respond({ audioBase64 });
  assert.deepEqual(result.flights, [flight]);
  assert.deepEqual(result.actions?.map(action => action.type), ['save_trip', 'book_flight']);
  const saved = result.actions?.[0];
  assert.ok(saved?.type === 'save_trip');
  assert.equal(saved.trip.days[0].items[0].title, 'Ihram and Umrah');
});

test('invalid trip plans are rejected back to the model instead of saved', async () => {
  let output = '';
  const respond = createAssistant({
    transcribe: async () => 'Plan a trip',
    generate: async () => '',
    async chat(messages) {
      const last = messages.at(-1);
      if (last?.role === 'tool') { output = last.content; return { content: 'Which dates?', toolCalls: [] }; }
      return { content: '', toolCalls: [{ id: 'x', name: 'create_trip_plan', arguments: '{"title":"Trip","destination":"Dubai","start_date":"soon","end_date":"later","days":[]}' }] };
    },
  });
  const result = await respond({ audioBase64 });
  assert.equal(result.actions, undefined);
  assert.match(output, /Not saved: Use valid start_date/);
});
