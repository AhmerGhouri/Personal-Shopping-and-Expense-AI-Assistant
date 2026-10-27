import { normalizeAudio } from './audio.ts';
import { ApiError, type AssistantServices, type ToolCall } from './assistant.ts';
import { inferenceError, type InferenceStage } from './inference-errors.ts';

export const GROQ_API_URL = 'https://api.groq.com/openai/v1';
export const DEFAULT_ASR_MODEL = 'whisper-large-v3-turbo';
export const DEFAULT_CHAT_MODEL = 'openai/gpt-oss-20b';

/** Groq could not turn the model's output into valid tool-call JSON; a fresh attempt usually succeeds. */
class ToolUseFailed extends Error {}
const TOOL_ATTEMPTS = 3;

type Dependencies = { fetch?: typeof fetch; normalizeAudio?: typeof normalizeAudio };
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function createGroqServices(env: NodeJS.ProcessEnv = process.env, dependencies: Dependencies = {}): AssistantServices {
  const key = env.GROQ_API_KEY?.trim();
  if (!key) throw new Error('Add GROQ_API_KEY to backend/.env and restart the backend. Set DEMO_MODE=true only for canned demo responses.');
  const request = dependencies.fetch ?? fetch;
  const normalize = dependencies.normalizeAudio ?? normalizeAudio;
  const asrModel = env.GROQ_ASR_MODEL?.trim() || DEFAULT_ASR_MODEL;
  const chatModel = env.GROQ_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;

  async function requestJson(path: string, init: RequestInit, stage: InferenceStage): Promise<unknown> {
    try {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${key}`);
      const response = await request(`${GROQ_API_URL}${path}`, {
        ...init, headers, signal: AbortSignal.timeout(35000),
      });
      let body: unknown;
      try { body = await response.json(); }
      catch {
        if (response.ok) throw new ApiError(502, 'Groq returned an unreadable response. Please try again.');
      }
      if (!response.ok) {
        // Only a bounded error code is retained; never retain echoed inputs or headers.
        const code = isObject(body) && isObject(body.error) && typeof body.error.code === 'string'
          ? body.error.code.slice(0, 100) : undefined;
        if (code === 'tool_use_failed') throw new ToolUseFailed();
        throw { httpResponse: { status: response.status, body: { code } } };
      }
      return body;
    } catch (error) {
      if (error instanceof ApiError || error instanceof ToolUseFailed) throw error;
      throw inferenceError(error, stage);
    }
  }

  return {
    async transcribe(audio) {
      const wav = await normalize(audio, env.FFMPEG_PATH || 'ffmpeg');
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'question.wav');
      form.append('model', asrModel);
      form.append('response_format', 'json');
      const result = await requestJson('/audio/transcriptions', { method: 'POST', body: form }, 'transcription');
      if (!isObject(result) || typeof result.text !== 'string') throw new ApiError(502, 'Groq returned an invalid transcription response.');
      return result.text;
    },
    async generate(messages) {
      const result = await requestJson('/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: chatModel, messages, temperature: 0.4, max_completion_tokens: 1024,
          ...(chatModel.startsWith('openai/gpt-oss-') ? { reasoning_effort: 'low' } : {}),
        }),
      }, 'chat');
      const first = isObject(result) && Array.isArray(result.choices) ? result.choices[0] : undefined;
      if (!isObject(first) || !isObject(first.message) || typeof first.message.content !== 'string') {
        throw new ApiError(502, 'Groq returned an invalid assistant response.');
      }
      return first.message.content;
    },
    async chat(messages, tools) {
      let result: unknown;
      for (let attempt = 1; ; attempt++) {
        try {
          result = await requestJson('/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              // Trip plans are long JSON tool calls; a low cap truncates them into invalid JSON.
              model: chatModel, messages, temperature: 0.4, max_completion_tokens: 4000,
              ...(tools.length ? { tools: tools.map(tool => ({ type: 'function', function: tool })), tool_choice: 'auto' } : {}),
              ...(chatModel.startsWith('openai/gpt-oss-') ? { reasoning_effort: 'low' } : {}),
            }),
          }, 'chat');
          break;
        } catch (error) {
          if (!(error instanceof ToolUseFailed)) throw error;
          console.error(`[Groq chat] tool call JSON was malformed (attempt ${attempt}/${TOOL_ATTEMPTS})`);
          if (attempt === TOOL_ATTEMPTS) throw new ApiError(502, 'The assistant had trouble formatting its answer. Please try again.');
        }
      }
      const first = isObject(result) && Array.isArray(result.choices) ? result.choices[0] : undefined;
      const message = isObject(first) && isObject(first.message) ? first.message : undefined;
      if (!message) throw new ApiError(502, 'Groq returned an invalid assistant response.');
      const toolCalls: ToolCall[] = (Array.isArray(message.tool_calls) ? message.tool_calls : []).flatMap((call: unknown) => {
        if (!isObject(call) || typeof call.id !== 'string' || !isObject(call.function) || typeof call.function.name !== 'string') return [];
        return [{ id: call.id, name: call.function.name, arguments: typeof call.function.arguments === 'string' ? call.function.arguments : '{}' }];
      });
      return { content: typeof message.content === 'string' ? message.content : '', toolCalls };
    },
  };
}
