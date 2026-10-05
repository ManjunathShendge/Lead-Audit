import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { apiGuard } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/auth';
import { idSchema } from '@/lib/validation';
import { renderAuditPdf, PdfBusyError } from '@/lib/pdf/render';
import { isPdfSection, sectionAvailable, sectionFilename } from '@/lib/pdf/sections';
import { storedAlignmentSchema } from '@/lib/ai/alignment-types';
import type { Report } from '@/lib/report';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiGuard(request);
  if (guard) return guard;
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return Response.json({ error: 'Invalid audit ID.' }, { status: 400 });
  const audit = await db.audit.findUnique({
    where: { id: parsed.data },
    select: { state: true, brand: true, mode: true, report: true, alignment: true },
  });
  if (!audit) return Response.json({ error: 'Audit not found.' }, { status: 404 });
  if (audit.state !== 'complete')
    return Response.json({ error: 'The report is still being prepared.' }, { status: 409 });
  // ?section=seo exports one area; no section exports the full report.
  const requested = new URL(request.url).searchParams.get('section');
  if (requested !== null && !isPdfSection(requested))
    return Response.json({ error: 'Unknown report section.' }, { status: 400 });
  const section = requested;
  if (
    section &&
    (!audit.report ||
      !sectionAvailable(
        section,
        audit.report as unknown as Report,
        storedAlignmentSchema.safeParse(audit.alignment).data?.status === 'ok',
      ))
  )
    return Response.json({ error: 'This section was not measured for this audit.' }, { status: 404 });
  try {
    const token = (await cookies()).get(SESSION_COOKIE)!.value;
    const pdf = await renderAuditPdf(parsed.data, token, audit.mode === 'live' ? 'live' : 'mock', section);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sectionFilename(audit.brand, section)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'pdf.failed', auditId: parsed.data }));
    return Response.json(
      {
        error:
          error instanceof PdfBusyError
            ? error.message
            : 'PDF could not be rendered. Verify the Chromium installation and APP_ORIGIN, then retry.',
      },
      { status: 503 },
    );
  }
}
