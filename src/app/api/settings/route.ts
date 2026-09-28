import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { apiGuard, jsonInput } from '@/lib/http';
import { configSchema, benchmarkSchema, defaults } from '@/lib/scoring/config';
import { platformSchema } from '@/lib/collectors/types';

const bodySchema = z
  .object({
    config: configSchema,
    benchmarks: z
      .array(
        benchmarkSchema.and(
          z.object({ industry: z.enum(['General', 'B2B', 'D2C']), platform: platformSchema }),
        ),
      )
      .max(60),
  })
  .strict();

export async function PUT(request: Request) {
  const guard = await apiGuard(request, true);
  if (guard) return guard;
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await jsonInput(request));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? `${error.issues[0]?.path.join('.') || 'value'}: ${error.issues[0]?.message ?? 'invalid'}`
            : 'Check the submitted settings.',
      },
      { status: 400 },
    );
  }
  // Every channel weight at zero would leave nothing to score against.
  const { website, social, gbp } = body.config.channels;
  if (website + social + gbp <= 0)
    return Response.json({ error: 'At least one channel weight must be above zero.' }, { status: 400 });
  if (!body.config.enabled.length)
    return Response.json({ error: 'Enable at least one platform.' }, { status: 400 });

  await db.$transaction([
    db.config.upsert({
      where: { id: 'default' },
      update: { value: body.config as unknown as Prisma.InputJsonValue },
      create: { id: 'default', value: body.config as unknown as Prisma.InputJsonValue },
    }),
    ...body.benchmarks.map((b) =>
      db.benchmark.upsert({
        where: { industry_platform: { industry: b.industry, platform: b.platform } },
        update: {
          postsTarget: b.postsTarget,
          engagementTarget: b.engagementTarget,
          followerLow: b.followerLow,
          followerHigh: b.followerHigh,
          reviewLow: b.reviewLow,
          reviewHigh: b.reviewHigh,
          placeholder: false,
        },
        create: { ...b, placeholder: false },
      }),
    ),
  ]);
  console.log(JSON.stringify({ event: 'settings.updated', benchmarks: body.benchmarks.length }));
  return Response.json({
    saved: true,
    note: 'Saved. Existing audits keep the configuration snapshot they were run with.',
  });
}

/** Restores the seeded defaults without touching benchmarks. */
export async function DELETE(request: Request) {
  const guard = await apiGuard(request, true);
  if (guard) return guard;
  await db.config.upsert({
    where: { id: 'default' },
    update: { value: defaults as unknown as Prisma.InputJsonValue },
    create: { id: 'default', value: defaults as unknown as Prisma.InputJsonValue },
  });
  return Response.json({ saved: true, note: 'Scoring weights restored to the seeded defaults.' });
}
