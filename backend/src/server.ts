import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ApiError, type Respond } from './assistant.ts';

const MAX_BODY_BYTES = 6 * 1024 * 1024;

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new ApiError(415, 'Use application/json.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new ApiError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'Invalid JSON.'); }
}

// The app authenticates nothing yet, so permissive CORS only helps browser-based testing.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS });
  response.end(JSON.stringify(body));
}

export function createApi({ respond, demo = false, log = false }: { respond: Respond; demo?: boolean; log?: boolean }) {
  let active = 0;
  const server = createServer(async (request, response) => {
    if (log) {
      // One line per request makes it obvious whether a phone reaches the computer at all.
      const started = Date.now();
      response.on('finish', () => {
        const client = request.socket.remoteAddress?.replace(/^::ffff:/, '') ?? 'unknown';
        console.log(`${new Date().toLocaleTimeString()} ${client} ${request.method} ${request.url} -> ${response.statusCode} (${Date.now() - started} ms)`);
      });
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, CORS_HEADERS);
      return response.end();
    }
    if (request.method === 'GET' && request.url === '/health') {
      return send(response, 200, { status: 'ok', mode: demo ? 'demo' : 'groq' });
    }
    if (request.method !== 'POST' || request.url !== '/v1/assistant') {
      return send(response, 404, { error: 'Route not found.' });
    }
    if (active >= 2) return send(response, 429, { error: 'Assistant is busy. Try again shortly.' });
    active++;
    try {
      const result = await respond(await readJson(request));
      send(response, 200, { ...result, demo });
    } catch (error) {
      if (error instanceof ApiError) send(response, error.status, { error: error.message });
      else {
        // Avoid printing SDK errors, which can contain request audio or credentials.
        console.error('Inference failed:', error instanceof Error ? error.name : 'Error');
        send(response, 502, { error: 'Assistant request failed. Check the backend configuration and Groq API access.' });
      }
    } finally { active--; }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}
