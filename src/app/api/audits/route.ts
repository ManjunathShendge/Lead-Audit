import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { apiGuard, jsonInput } from '@/lib/http';
import { auditInputSchema } from '@/lib/validation';
import { loadSnapshot } from '@/lib/config-store';
import { platforms } from '@/lib/collectors/types';
import { currentMode, liveAvailability } from '@/lib/collectors';
import { channelAvailability } from '@/lib/collectors/channels';
import { normalizeGbpQuery, type Channel } from '@/lib/collectors/channel-types';
import { audienceProvided } from '@/lib/ai/alignment-types';
import { periodAllowed } from '@/lib/period';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function POST(request: Request) {
  const guard = await apiGuard(request, true);
  if (guard) return guard;
  let input;
  try {
    input = auditInputSchema.parse(await jsonInput(request));
  } catch {
    return Response.json(
      { error: 'Check the brand, website and confirmed handles. Present accounts need a valid handle.' },
      { status: 400 },
    );
  }
  if (input.period && !periodAllowed(input.period, new Date()))
    return Response.json(
      { error: 'Choose a time period within the last 24 months that does not end in the future.' },
      { status: 400 },
    );
  const mode = currentMode();
  try {
    const snapshot = await loadSnapshot(input.industry);
    const active = platforms.filter(
      (p) => snapshot.settings.enabled.includes(p) && input.handles[p].presence === 'present',
    );
    const weights = snapshot.settings.channels;
    const channelRuns: { platform: Channel; handle: string }[] = [
      ...(input.website && input.channels.website.audit && weights.website > 0
        ? [{ platform: 'website' as const, handle: input.website }]
        : []),
      ...(input.channels.gbp.presence === 'present' && weights.gbp > 0
        ? [{ platform: 'gbp' as const, handle: normalizeGbpQuery(input.channels.gbp.query) }]
        : []),
    ];
    const liveChannels = channelRuns.filter((r) => channelAvailability()[r.platform].ready);
    if (mode === 'live' && input.channels.gbp.presence === 'present' && !channelAvailability().gbp.ready)
      return Response.json({ error: channelAvailability().gbp.reason }, { status: 409 });
    if (
      mode === 'live' &&
      active.length &&
      !active.some((p) => liveAvailability()[p].ready) &&
      !liveChannels.length
    )
      return Response.json(
        {
          error:
            'No live collector is configured for the confirmed platforms. Set the required keys or confirm a platform that has one.',
        },
        { status: 409 },
      );
    if (
      !active.length &&
      !channelRuns.length &&
      input.channels.gbp.presence !== 'absent' &&
      !platforms.some((p) => snapshot.settings.enabled.includes(p) && input.handles[p].presence === 'absent')
    )
      return Response.json(
        { error: 'Confirm at least one enabled platform, a website or a Google Business Profile.' },
        { status: 400 },
      );
    const key = createHash('sha256')
      .update(
        JSON.stringify({
          handles: input.handles,
          channels: input.channels,
          targetAudience: audienceProvided(input.targetAudience) ? input.targetAudience : null,
          period: input.period,
          industry: input.industry,
          tier: input.tier,
          brand: input.brand,
          website: input.website,
          config: snapshot,
          mode,
        }),
      )
      .digest('hex');
    const cacheDays = Number(process.env.AUDIT_CACHE_DAYS ?? 7);
    const since = new Date(Date.now() - (Number.isFinite(cacheDays) ? Math.max(0, cacheDays) : 7) * 86400000);
    const cached = await db.audit.findFirst({
      where: { cacheKey: key, state: 'complete', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
    if (cached && !input.force)
      return Response.json(
        {
          cached: { id: cached.id, createdAt: cached.createdAt },
          message: 'A recent matching audit is available.',
        },
        { status: 409 },
      );
    const audit = await db.audit.create({
      data: {
        brand: input.brand,
        website: input.website || null,
        industry: input.industry,
        handles: json(input.handles),
        channels: json(input.channels),
        ...(audienceProvided(input.targetAudience) && { targetAudience: json(input.targetAudience) }),
        ...(input.period && { period: json(input.period) }),
        tier: input.tier,
        mode,
        config: json(snapshot),
        cacheKey: key,
        runs: {
          create: [
            ...active.map((platform) => ({ platform, handle: input.handles[platform].handle })),
            ...channelRuns,
          ],
        },
      },
    });
    return Response.json({ id: audit.id }, { status: 201 });
  } catch {
    console.error(JSON.stringify({ event: 'audit.create_failed' }));
    return Response.json(
      { error: 'Unable to create the audit. Check database setup and seed configuration.' },
      { status: 503 },
    );
  }
}
