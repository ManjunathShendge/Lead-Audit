import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import type { Report } from '@/lib/report';
import { storedSummarySchema } from '@/lib/ai/summary-types';
import { storedAlignmentSchema } from '@/lib/ai/alignment-types';
import { isPdfSection } from '@/lib/pdf/sections';
import { PdfReport } from '@/components/pdf/pdf-report';
/** The PDF source: a print document rendered entirely on the server, not the interactive report. */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { id } = await params;
  const { section } = await searchParams;
  const audit = await db.audit.findUnique({ where: { id } });
  if (!audit?.report) notFound();
  return (
    <PdfReport
      id={audit.id}
      brand={audit.brand}
      website={audit.website}
      report={audit.report as unknown as Report}
      summary={storedSummarySchema.safeParse(audit.summary).data ?? null}
      alignment={storedAlignmentSchema.safeParse(audit.alignment).data ?? null}
      mode={audit.mode === 'live' ? 'live' : 'mock'}
      section={isPdfSection(section) ? section : null}
    />
  );
}
