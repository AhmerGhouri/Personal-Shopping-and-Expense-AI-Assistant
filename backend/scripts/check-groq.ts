import { createGroqServices, GROQ_API_URL, DEFAULT_ASR_MODEL, DEFAULT_CHAT_MODEL } from '../src/groq.ts';
import { ApiError } from '../src/assistant.ts';
import { describeInferenceError } from '../src/inference-errors.ts';

async function main() {
  const services = createGroqServices();
  const response = await fetch(`${GROQ_API_URL}/models`, {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY?.trim()}` }, signal: AbortSignal.timeout(10000),
  });
  console.log(`Groq key/model access check: HTTP ${response.status}`);
  if (!response.ok) throw new ApiError(502, describeInferenceError({ httpResponse: { status: response.status } }).message);
  const body = await response.json() as { data?: { id: string }[] };
  const available = new Set(body.data?.map(model => model.id));
  for (const model of [process.env.GROQ_ASR_MODEL?.trim() || DEFAULT_ASR_MODEL, process.env.GROQ_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL]) {
    if (!available.has(model)) throw new ApiError(400, `Configured model ${model} is unavailable for this account. Check backend/.env.`);
    console.log(`Model available: ${model}`);
  }
  // A generated tone exercises ASR without uploading a user's recording.
  // These real requests count against your Groq usage quota.
  const samples = 8000;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(1000 * Math.sin(2 * Math.PI * 440 * i / 16000)), 44 + i * 2);
  await services.transcribe(wav);
  console.log('Groq transcription: succeeded (generated tone; not an accuracy test).');
  const reply = await services.generate([{ role: 'user', content: 'Reply with the word OK.' }]);
  if (!reply.trim()) throw new ApiError(502, 'Groq chat returned an empty reply.');
  console.log('Groq chat: succeeded.');
}

main().catch(error => {
  // A missing-key error is generated locally and contains no credential value.
  const message = !process.env.GROQ_API_KEY?.trim() ? 'Add GROQ_API_KEY to backend/.env before running this check.'
    : error instanceof ApiError ? error.message : describeInferenceError(error).message;
  console.error(message);
  process.exitCode = 1;
});
