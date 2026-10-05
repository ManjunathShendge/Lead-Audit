import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import type { Report } from '@/lib/report';
import { storedSummarySchema } from '@/lib/ai/summary-types';
import { storedAlignmentSchema, targetAudienceSchema } from '@/lib/ai/alignment-types';
import { SocialReport } from '@/components/report/report';
import { aiConfigured } from '@/lib/ai/provider';
import { Progress } from '@/components/progress';
export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await db.audit.findUnique({ where: { id } });
  if (!audit) notFound();
  if (!audit.report) return <Progress id={audit.id} brand={audit.brand} />;
  return (
    <SocialReport
      id={audit.id}
      brand={audit.brand}
      website={audit.website}
      report={audit.report as unknown as Report}
      summary={storedSummarySchema.safeParse(audit.summary).data ?? null}
      aiEnabled={aiConfigured()}
      completedAt={audit.completedAt?.toISOString() ?? null}
      mode={audit.mode === 'live' ? 'live' : 'mock'}
      alignment={storedAlignmentSchema.safeParse(audit.alignment).data ?? null}
      targetAudience={targetAudienceSchema.nullable().catch(null).parse(audit.targetAudience)}
    />
  );
}
