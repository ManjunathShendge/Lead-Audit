import { describe, it, expect, vi } from 'vitest';
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('../src/lib/db', () => ({ db: {} }));
import { passwordMatches, sameOrigin } from '../src/lib/auth';
describe('password and origin boundary', () => {
  it('requires a configured password and checks exact values', () => {
    vi.stubEnv('APP_PASSWORD', 'long-demo-password');
    expect(passwordMatches('long-demo-password')).toBe(true);
    expect(passwordMatches('wrong')).toBe(false);
    vi.stubEnv('APP_PASSWORD', ''); expect(passwordMatches('')).toBe(false); vi.unstubAllEnvs();
  });
  it('rejects cross-origin mutations', () => { vi.stubEnv('APP_ORIGIN', 'http://localhost:3000'); expect(sameOrigin(new Request('http://localhost:3000', { headers: { origin: 'https://evil.example' } }))).toBe(false); expect(sameOrigin(new Request('http://localhost:3000', { headers: { origin: 'http://localhost:3000' } }))).toBe(true); vi.unstubAllEnvs(); });
});
