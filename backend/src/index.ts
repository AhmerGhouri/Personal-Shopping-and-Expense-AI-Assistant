import { networkInterfaces } from 'node:os';
import { createAssistant, type AssistantServices } from './assistant.ts';
import { createGroqServices } from './groq.ts';
import { createApi } from './server.ts';
import { createProductSearch } from './shopping.ts';
import { createFlightSearch } from './travel.ts';

const demo = process.env.DEMO_MODE === 'true';

function shoppingRegion(country = 'us'): string {
  return country.trim().toLowerCase() === 'pk'
    ? 'Pakistan. Products come from Daraz.pk and prices are in Pakistani rupees (Rs); say rupees when speaking'
    : `country code ${country.toUpperCase()}; use the currency shown in the results`;
}
const services: AssistantServices = demo ? {
  async transcribe() { return '[Demo transcript] Help me plan my day.'; },
  async generate() { return 'This is a demo response. Your microphone upload and speech playback are connected. Configure your Groq API key to get real transcriptions and replies.'; },
} : {
  ...createGroqServices(),
  searchProducts: createProductSearch(),
  searchFlights: createFlightSearch(),
  shoppingRegion: shoppingRegion(process.env.SHOPPING_COUNTRY),
};

function lanAddresses(): string[] {
  // Skip virtual adapters (WSL, Hyper-V, VPNs); a phone can only reach the real Wi-Fi/Ethernet address.
  return Object.entries(networkInterfaces())
    .filter(([name]) => !/vEthernet|WSL|Hyper-V|VirtualBox|VMware|Loopback/i.test(name))
    .flatMap(([, items]) => items ?? [])
    .filter(item => item.family === 'IPv4' && !item.internal)
    .map(item => item.address);
}

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8000);
const server = createApi({ respond: createAssistant(services), demo, log: true });
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is already in use. Stop the other backend window and try again.`
    : `Could not start the backend: ${error.message}`);
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(`Assistant listening on http://${host}:${port} (${demo ? 'DEMO' : 'Groq'})`);
  if (host === '127.0.0.1' || host === 'localhost') {
    console.log('Only this computer can connect. Set HOST=0.0.0.0 in backend/.env to use a phone.');
  } else if (host === '0.0.0.0') {
    for (const address of lanAddresses()) console.log(`  Phone URL: http://${address}:${port}`);
    console.log('If the phone cannot connect, allow Node.js through Windows Firewall (see docs/ANDROID-DEVICE-TEST.md).');
  }
  if (!demo) console.log(services.searchProducts ? `Shopping search: on (${(process.env.SHOPPING_COUNTRY || 'us').toLowerCase() === 'pk' ? 'Daraz.pk' : 'Google Shopping, ' + (process.env.SHOPPING_COUNTRY || 'us')})` : 'Shopping search: off. Add SERPAPI_KEY to backend/.env to enable it.');
  if (!demo) console.log(services.searchFlights ? 'Flight search: on (Google Flights)' : 'Flight search: off. Add SERPAPI_KEY to backend/.env to enable it.');
  console.log('Each request is logged below. No log line means the phone never reached this computer.');
});
