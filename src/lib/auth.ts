import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';
export const SESSION_COOKIE = 'tier2_session';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function passwordMatches(value: string) {
  const expected = process.env.APP_PASSWORD;
  if (!expected || (process.env.NODE_ENV === 'production' && expected === 'change-me')) return false;
  return timingSafeEqual(Buffer.from(hash(value)), Buffer.from(hash(expected)));
}
export async function sessionValid() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const session = await db.session.findUnique({ where: { tokenHash: hash(token) } });
  return !!session && session.expiresAt > new Date();
}
export async function requirePageSession() {
  if (!(await sessionValid())) redirect('/login');
}
export async function createSession() {
  const token = randomBytes(32).toString('hex');
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.session.create({
    data: { tokenHash: hash(token), expiresAt: new Date(Date.now() + 8 * 3600_000) },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.APP_ORIGIN?.startsWith('https://') ?? false,
    path: '/',
    maxAge: 8 * 3600,
  });
}
export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
  store.delete(SESSION_COOKIE);
}
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === (process.env.APP_ORIGIN || 'http://localhost:3000');
}
