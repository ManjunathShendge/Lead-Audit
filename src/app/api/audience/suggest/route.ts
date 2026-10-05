import { z } from 'zod';
import { db } from '@/lib/db';
import { apiGuard, jsonInput } from '@/lib/http';
import { idSchema } from '@/lib/validation';
import { aiConfigured, aiKeyHelp } from '@/lib/ai/provider';
import { suggestAudience } from '@/lib/ai/audience-suggest';
import { alignmentInputFromAudit } from '@/lib/ai/alignment';
import { fetchSiteText, MIN_SITE_TEXT, siteTextAvailable } from '@/lib/site-text';

const bodySchema = z
  .object({
    brand: z.string().trim().max(100).default(''),
    industry: z.enum(['General', 'B2B', 'D2C']).default('General'),
    website: z.string().trim().max(2048).default(''),
    /** Page words from the discovery step. */
    siteText: z.string().max(6000).default(''),
    handles: z
      .partialRecord(z.enum(['instagram', 'facebook', 'linkedin', 'youtube']), z.string().max(100))
      .default({}),
    /** When set, the suggestion uses that audit's stored website text, bios and posts instead. */
    auditId: idSchema.optional(),
  })
  .strict();

/** One quick AI request that proposes a target audience for the team to review. */
export async function POST(request: Request) {
  const guard = await apiGuard(request, true);
  if (guard) return guard;
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await jsonInput(request));
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!aiConfigured())
    return Response.json({ error: `Suggestions need an AI key. ${aiKeyHelp}` }, { status: 409 });

  let ctx: Parameters<typeof suggestAudience>[0] = {
    brand: body.brand,
    industry: body.industry,
    website: body.website || null,
    siteText: body.siteText,
    handles: body.handles,
  };
  if (body.auditId) {
    const audit = await db.audit.findUnique({
      where: { id: body.auditId },
      include: { runs: { select: { platform: true, result: true } } },
    });
    if (!audit) return Response.json({ error: 'Audit not found.' }, { status: 404 });
    const input = alignmentInputFromAudit({ ...audit, targetAudience: null });
    ctx = { brand: audit.brand, industry: audit.industry, website: audit.website, audit: input };
  }
  if (!ctx.brand && !ctx.website && !ctx.siteText && !Object.keys(ctx.handles ?? {}).length)
    return Response.json({ error: 'Add a brand name or website first.' }, { status: 400 });

  // No website words yet (a re-run, handles-only input, or a site the discovery crawl could not read):
  // read the homepage through Apify so the suggestion is based on what the brand actually says.
  const haveWords =
    (ctx.siteText?.length ?? 0) >= MIN_SITE_TEXT || !!ctx.audit?.site?.detail?.messaging?.text;
  let fetched = '';
  if (!haveWords && ctx.website && siteTextAvailable()) {
    const href = /^https?:\/\//i.test(ctx.website) ? ctx.website : `https://${ctx.website}`;
    const site = await fetchSiteText(href);
    fetched = site.text;
    console.log(
      JSON.stringify({ event: 'audience.site_text', ok: !!fetched, chars: fetched.length, costUsd: site.costUsd }),
    );
    if (fetched) ctx = { ...ctx, siteText: fetched };
  }

  const result = await suggestAudience(ctx);
  console.log(JSON.stringify({ event: result.ok ? 'audience.suggested' : 'audience.suggest_failed' }));
  // Fetched words go back to the form so a second suggestion does not pay for the same page again.
  return result.ok
    ? Response.json({ suggestion: result.suggestion, ...(fetched && !body.auditId && { siteText: fetched }) })
    : Response.json({ error: result.reason }, { status: 502 });
}
