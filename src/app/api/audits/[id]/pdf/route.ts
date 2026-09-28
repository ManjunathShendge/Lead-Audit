import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { apiGuard } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/auth';
import { idSchema } from '@/lib/validation';
import { renderAuditPdf, PdfBusyError } from '@/lib/pdf/render';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiGuard(request);
  if (guard) return guard;
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return Response.json({ error: 'Invalid audit ID.' }, { status: 400 });
  const audit = await db.audit.findUnique({
    where: { id: parsed.data },
    select: { state: true, brand: true },
  });
  if (!audit) return Response.json({ error: 'Audit not found.' }, { status: 404 });
  if (audit.state !== 'complete')
    return Response.json({ error: 'The report is still being prepared.' }, { status: 409 });
  try {
    const token = (await cookies()).get(SESSION_COOKIE)!.value;
    const pdf = await renderAuditPdf(parsed.data, token);
    const filename =
      audit.brand
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 80) || 'brand';
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}-social-audit.pdf"`,
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
