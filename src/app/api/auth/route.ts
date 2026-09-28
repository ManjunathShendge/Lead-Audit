import { z } from 'zod';
import { createSession, destroySession, passwordMatches, sameOrigin } from '@/lib/auth';
import { db } from '@/lib/db';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const parsed = z
    .object({ password: z.string().min(1).max(256) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter your workspace password.' }, { status: 400 });
  // Global throttle is deliberate for a small internal workspace; no untrusted forwarded IPs.
  const now = new Date();
  const throttle = await db.loginThrottle.upsert({
    where: { key: 'workspace' },
    create: { key: 'workspace', attempts: 0, resetAt: new Date(Date.now() + 600_000) },
    update: {},
  });
  if (throttle.resetAt <= now)
    await db.loginThrottle.update({
      where: { key: 'workspace' },
      data: { attempts: 0, resetAt: new Date(Date.now() + 600_000) },
    });
  const attempt = await db.loginThrottle.update({
    where: { key: 'workspace' },
    data: { attempts: { increment: 1 } },
  });
  if (attempt.attempts > 20)
    return Response.json({ error: 'Too many attempts. Try again in 10 minutes.' }, { status: 429 });
  if (!passwordMatches(parsed.data.password))
    return Response.json(
      { error: 'Incorrect password or workspace password is not configured.' },
      { status: 401 },
    );
  await db.loginThrottle.deleteMany({ where: { key: 'workspace' } });
  await createSession();
  return Response.json({ ok: true });
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  await destroySession();
  return Response.json({ ok: true });
}
