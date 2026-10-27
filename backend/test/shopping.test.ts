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
  assert.equal(result.action, undefined);
  assert.match(result.reply, /Acer Swift Go/);
  assert.deepEqual(calls[0].tools.map(tool => tool.name), ['search_products', 'buy_product', 'add_expense']);
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
  assert.deepEqual(result.action, { type: 'buy', product: laptop });
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
  assert.equal(rounds, 4);
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
  assert.deepEqual(result.action, { type: 'add_expense', expense: { title: 'Groceries', amount: 2500, category: 'Groceries' } });
});

test('expense lists are validated', () => {
  assert.throws(() => validateInput({ text: 'hi', expenses: [{ title: 'x', amount: -1, category: 'Food', date: '2026-10-01' }] }), ApiError);
  assert.throws(() => validateInput({ text: 'hi', expenses: [{ title: 'x', amount: 1, category: 'Crypto', date: '2026-10-01' }] }), ApiError);
  assert.throws(() => validateInput({ text: 'x'.repeat(2001) }), ApiError);
});
