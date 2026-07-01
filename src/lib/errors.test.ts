import { describe, expect, it } from 'vitest';
import { friendlyError } from './errors';

function apiError(status: number, message = 'raw provider message'): Error {
  const e = new Error(message);
  (e as any).status = status;
  return e;
}

describe('friendlyError', () => {
  it('maps auth failures to a Settings pointer', () => {
    expect(friendlyError(apiError(401))).toMatch(/rejected.*Settings/i);
    expect(friendlyError(apiError(403))).toMatch(/rejected/i);
  });

  it('maps rate limits and billing problems', () => {
    expect(friendlyError(apiError(429))).toMatch(/rate-limited|quota/i);
    expect(friendlyError(apiError(402))).toMatch(/billing/i);
    expect(friendlyError(new Error('Your credit balance is too low'))).toMatch(/billing/i);
  });

  it('maps unknown-model 404s to model advice', () => {
    expect(friendlyError(apiError(404, 'model not_found'))).toMatch(/model/i);
  });

  it('maps provider outages', () => {
    expect(friendlyError(apiError(529))).toMatch(/provider is having trouble/i);
  });

  it('maps network failures', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/internet connection/i);
  });

  it('passes through unrecognized messages', () => {
    expect(friendlyError(new Error('weird edge case'))).toBe('weird edge case');
  });
});
