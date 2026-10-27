import { ApiError } from './assistant.ts';

export type InferenceStage = 'transcription' | 'chat';

export function describeInferenceError(error: unknown) {
  const failure = error as { name?: string; httpResponse?: { status?: number; body?: unknown }; cause?: { code?: string } } | null;
  const status = failure?.httpResponse?.status;
  // Inspect the response for known categories, but never log or return its body:
  // providers can echo recordings, prompts, authorization headers, or URLs.
  let body = '';
  try { body = JSON.stringify(failure?.httpResponse?.body ?? '').slice(0, 32000).toLowerCase(); } catch {}
  if (status === 402 || /insufficient.{0,30}(credit|balance|fund)|payment required|billing|pre.?paid credit|exceeded.{0,30}credit/.test(body)) {
    return { status, reason: 'billing', message: 'Groq reported an account billing restriction. Check your Groq account settings.' };
  }
  if (status === 401) return { status, reason: 'authentication', message: 'Groq rejected the API key. Check GROQ_API_KEY in backend/.env and restart the backend.' };
  if (status === 403) return { status, reason: 'permission', message: 'Groq access was denied. Check your account access and model permissions in the Groq Console.' };
  if (status === 404 || /model_not_found|model_decommissioned|model_not_available/.test(body)) return { status, reason: 'model-routing', message: 'The configured Groq model is unavailable. Check GROQ_ASR_MODEL and GROQ_CHAT_MODEL in backend/.env.' };
  if (status === 429) return { status, reason: 'rate-limit', message: 'Groq usage limit reached. Wait for your quota to reset or try a shorter conversation.' };
  if (status === 400 || status === 422) return { status, reason: 'provider-input', message: 'Groq rejected the request format or parameters. Check the configured model and audio input.' };
  if (status && status >= 500) return { status, reason: 'provider-unavailable', message: 'Groq is temporarily unavailable. Please try again later.' };
  if (failure?.name === 'TimeoutError' || failure?.name === 'AbortError') return { status, reason: 'timeout', message: 'The Groq request timed out. Please try again.' };
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT'].includes(failure?.cause?.code ?? '')) {
    return { status, reason: 'network', message: 'The backend could not connect to Groq. Check its internet connection, DNS, or proxy.' };
  }
  return { status, reason: 'unknown', message: 'Groq inference failed. Check your API key, model access, and usage limits.' };
}

export function inferenceError(error: unknown, stage: InferenceStage): ApiError {
  const details = describeInferenceError(error);
  console.error(`[Groq ${stage}] status=${details.status ?? 'unavailable'} reason=${details.reason}`);
  return new ApiError(details.status === 429 ? 429 : 502, `${stage === 'transcription' ? 'Speech recognition' : 'Assistant response'} failed. ${details.message}`);
}
