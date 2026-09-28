import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import type { Report } from '@/lib/report';
import { SocialReport } from '@/components/report/report';
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await db.audit.findUnique({ where: { id } });
  if (!audit?.report) notFound();
  return (
    <SocialReport
      id={audit.id}
      brand={audit.brand}
      website={audit.website}
      report={audit.report as unknown as Report}
      print
    />
  );
}
