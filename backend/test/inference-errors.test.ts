import test from 'node:test';
import assert from 'node:assert/strict';
import { describeInferenceError } from '../src/inference-errors.ts';

test('provider failures distinguish authentication, permission, billing, and availability', () => {
  for (const [status, reason] of [[401, 'authentication'], [403, 'permission'], [402, 'billing'], [404, 'model-routing'], [422, 'provider-input'], [429, 'rate-limit'], [503, 'provider-unavailable']] as const) {
    assert.equal(describeInferenceError({ httpResponse: { status } }).reason, reason);
  }
  assert.equal(describeInferenceError({ httpResponse: { status: 403, body: { detail: 'Insufficient balance' } } }).reason, 'billing');
});

test('safe diagnostics never expose echoed tokens, audio, or prompts', () => {
  const details = describeInferenceError({ httpResponse: { status: 422, body: { error: 'SECRET_TOKEN PRIVATE_TRANSCRIPT AUDIO_BASE64' } } });
  assert.doesNotMatch(JSON.stringify(details), /SECRET_TOKEN|PRIVATE_TRANSCRIPT|AUDIO_BASE64/);
  assert.equal(describeInferenceError({ cause: { code: 'ENOTFOUND' } }).reason, 'network');
  assert.equal(describeInferenceError({ name: 'TimeoutError' }).reason, 'timeout');
});
