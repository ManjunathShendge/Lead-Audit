import { z } from 'zod';
import { apiGuard, jsonInput } from '@/lib/http';
import { parseSource } from '@/lib/validation';
import { platforms } from '@/lib/collectors/types';
import { discoverFromWebsite, DiscoveryBusyError, UnsafeUrlError } from '@/lib/discovery';

export async function POST(request: Request) {
  const guard = await apiGuard(request, true);
  if (guard) return guard;
  let parsed: ReturnType<typeof parseSource>;
  try {
    const { source } = z
      .object({ source: z.string().trim().min(1).max(2048) })
      .strict()
      .parse(await jsonInput(request));
    parsed = parseSource(source);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? 'Enter a website or supported handle.'
            : error instanceof Error
              ? error.message
              : 'Invalid input.',
      },
      { status: 400 },
    );
  }

  if (!parsed.website)
    return Response.json({
      ...parsed,
      brand: '',
      crawled: false,
      warnings: [],
      pagesVisited: [],
      notice: 'Handles parsed from your input. No accounts have been verified.',
    });

  try {
    const found = await discoverFromWebsite(parsed.website);
    const handles = { ...parsed.handles };
    for (const platform of platforms) {
      // A handle typed by the user always wins over a discovered link.
      if (handles[platform].presence === 'present') continue;
      const hit = found.handles[platform];
      if (hit) handles[platform] = { handle: hit.handle, presence: 'present' };
    }
    return Response.json({
      website: found.website,
      handles,
      brand: found.brand ?? '',
      crawled: true,
      warnings: found.warnings,
      pagesVisited: found.pagesVisited,
      siteText: found.siteText,
      notice: `Crawled ${found.pagesVisited.length} page(s) on ${new URL(found.website).hostname}. Links found on the site are not proof the account is active. Edit and confirm each account.`,
    });
  } catch (error) {
    if (error instanceof UnsafeUrlError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof DiscoveryBusyError) return Response.json({ error: error.message }, { status: 503 });
    return Response.json(
      {
        error:
          error instanceof Error && error.message === 'The website could not be loaded.'
            ? 'The website could not be loaded. Check the URL or enter handles directly.'
            : 'Discovery failed. Enter handles directly.',
      },
      { status: 502 },
    );
  }
}
