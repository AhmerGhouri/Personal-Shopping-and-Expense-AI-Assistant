// Live check of Groq tool calling with sample products (no SerpApi call is made).
import { createAssistant } from '../src/assistant.ts';
import { createGroqServices } from '../src/groq.ts';
import type { Product } from '../src/shopping.ts';

const sample: Product[] = [
  { id: 'p1', title: 'ASUS TUF Gaming A15 Ryzen 7 RTX 4060 16GB', price: '$999.99', priceValue: 999.99, store: 'Best Buy', link: 'https://example.com/1', rating: 4.6, reviews: 1500 },
  { id: 'p2', title: 'Acer Nitro V 15 i5 RTX 4050 8GB', price: '$749.99', priceValue: 749.99, store: 'Amazon', link: 'https://example.com/2', rating: 4.4, reviews: 3200 },
  { id: 'p3', title: 'Lenovo LOQ 15 i5 RTX 4050 16GB', price: '$849.00', priceValue: 849, store: 'Walmart', link: 'https://example.com/3', rating: 4.5, reviews: 640 },
];
const groq = createGroqServices();
const queries: string[] = [];
const respond = createAssistant({
  ...groq,
  transcribe: async (audio) => audio.toString(),
  searchProducts: async (query) => { queries.push(query); return sample; },
});
const ask = (text: string, products: Product[] = []) => respond({ audioBase64: Buffer.from(text).toString('base64'), products });
const first = await ask('I want to buy a gaming laptop under 1000 dollars. Which one is best?');
console.log('search queries:', queries);
console.log('reply:', first.reply, '| products:', first.products?.length);
const second = await ask('Okay buy the Lenovo one', sample);
console.log('reply:', second.reply, '| action:', JSON.stringify(second.action).slice(0, 120));
const typed = await respond({ text: 'I spent 2500 rupees on groceries today', expenses: [] });
console.log('reply:', typed.reply, '| action:', JSON.stringify(typed.action));
const summary = await respond({ text: 'How much did I spend this month and on what?', expenses: [
  { title: 'Groceries', amount: 2500, category: 'Groceries', date: new Date().toISOString().slice(0, 10) },
  { title: 'Careem ride', amount: 650, category: 'Transport', date: new Date().toISOString().slice(0, 10) },
] });
console.log('reply:', summary.reply);
