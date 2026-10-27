import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/assistant.ts';
import { createGroqServices, GROQ_API_URL, DEFAULT_ASR_MODEL, DEFAULT_CHAT_MODEL } from '../src/groq.ts';

const env = { GROQ_API_KEY: 'test-key-only', FFMPEG_PATH: 'test-ffmpeg' };
const wav = Buffer.from('normalized-wav-fixture');
const normalize = async () => wav;

test('Groq requires its own key and does not fall back to a Hugging Face token', () => {
  assert.throws(() => createGroqServices({ HF_TOKEN: 'old-test-token' }), /Add GROQ_API_KEY/);
  assert.throws(() => createGroqServices({ GROQ_API_KEY: '   ' }), /Add GROQ_API_KEY/);
});

test('Groq transcription sends normalized WAV multipart data with backend authentication', async () => {
  const services = createGroqServices(env, {
    normalizeAudio: async (audio, executable) => {
      assert.equal(audio.toString(), 'mobile-recording');
      assert.equal(executable, 'test-ffmpeg');
      return wav;
    },
    fetch: async (url, init) => {
      assert.equal(url, `${GROQ_API_URL}/audio/transcriptions`);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Authorization'), 'Bearer test-key-only');
      assert.equal(headers.has('Content-Type'), false, 'Fetch must set the multipart boundary');
      assert.ok(init?.signal instanceof AbortSignal);
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get('model'), DEFAULT_ASR_MODEL);
      assert.equal(init.body.get('response_format'), 'json');
      const file = init.body.get('file');
      assert.ok(file instanceof Blob);
      assert.equal(file.type, 'audio/wav');
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), wav);
      return Response.json({ text: 'Hello assistant' });
    },
  });
  assert.equal(await services.transcribe(Buffer.from('mobile-recording')), 'Hello assistant');
});

test('Groq chat preserves message roles and returns only the answer text', async () => {
  const messages = [{ role: 'system' as const, content: 'Be concise.' }, { role: 'user' as const, content: 'Hello' }];
  const services = createGroqServices(env, { fetch: async (url, init) => {
    assert.equal(url, `${GROQ_API_URL}/chat/completions`);
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, DEFAULT_CHAT_MODEL);
    assert.deepEqual(body.messages, messages);
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.max_completion_tokens, 1024);
    return Response.json({ choices: [{ message: { content: 'Hi there', reasoning: 'internal reasoning' } }] });
  } });
  assert.equal(await services.generate(messages), 'Hi there');
});

test('Groq model overrides are used without GPT-OSS-specific parameters on other models', async () => {
  const models: unknown[] = [];
  const services = createGroqServices({ ...env, GROQ_ASR_MODEL: 'custom-whisper', GROQ_CHAT_MODEL: 'custom-chat' }, {
    normalizeAudio: normalize,
    fetch: async (url, init) => {
      if (url === `${GROQ_API_URL}/audio/transcriptions`) {
        models.push((init?.body as FormData).get('model'));
        return Response.json({ text: 'Hi' });
      }
      const body = JSON.parse(String(init?.body));
      models.push(body.model);
      assert.equal(body.reasoning_effort, undefined);
      return Response.json({ choices: [{ message: { content: 'Hello' } }] });
    },
  });
  await services.transcribe(Buffer.from('audio'));
  await services.generate([{ role: 'user', content: 'Hi' }]);
  assert.deepEqual(models, ['custom-whisper', 'custom-chat']);
});

test('Groq errors surface quota/key/model guidance without leaking provider response data', async () => {
  for (const [status, code, pattern] of [
    [429, 'rate_limit_exceeded', /usage limit reached/],
    [401, 'invalid_api_key', /GROQ_API_KEY/],
    [400, 'model_decommissioned', /configured Groq model is unavailable/],
  ] as const) {
    let requests = 0;
    const services = createGroqServices(env, { fetch: async () => {
      requests++;
      return Response.json({ error: { code, message: 'PRIVATE_AUDIO SECRET_KEY PRIVATE_PROMPT' } }, { status });
    } });
    await assert.rejects(services.generate([{ role: 'user', content: 'Private prompt' }]), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status === 429 ? 429 : 502);
      assert.match(error.message, pattern);
      assert.doesNotMatch(error.message, /PRIVATE_AUDIO|SECRET_KEY|PRIVATE_PROMPT/);
      return true;
    });
    assert.equal(requests, 1, 'Quota failures should not trigger automatic retries');
  }
});

test('Groq handles malformed upstream output and keeps local FFmpeg failures actionable', async () => {
  const bad = createGroqServices(env, { normalizeAudio: normalize, fetch: async () => Response.json({ unexpected: true }) });
  await assert.rejects(bad.transcribe(Buffer.from('audio')), /invalid transcription/);
  await assert.rejects(bad.generate([{ role: 'user', content: 'Hi' }]), /invalid assistant response/);
  const unreadable = createGroqServices(env, { fetch: async () => new Response('not-json') });
  await assert.rejects(unreadable.generate([{ role: 'user', content: 'Hi' }]), /unreadable response/);
  const conversion = createGroqServices(env, {
    normalizeAudio: async () => { throw new ApiError(503, 'FFmpeg path is unavailable'); },
    fetch: async () => { assert.fail('Groq should not be called when conversion fails'); },
  });
  await assert.rejects(conversion.transcribe(Buffer.from('audio')), /FFmpeg path is unavailable/);
});
