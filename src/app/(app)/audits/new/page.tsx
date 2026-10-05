import Link from 'next/link';
import { ListPlus } from 'lucide-react';
import { db } from '@/lib/db';
import { AuditForm, type InitialAudit } from '@/components/audit-form';
import { handlesSchema } from '@/lib/validation';
import { channelTargetsSchema } from '@/lib/collectors/channel-types';
import { targetAudienceSchema } from '@/lib/ai/alignment-types';
import { aiConfigured } from '@/lib/ai/provider';
import { periodSchema } from '@/lib/period';
export default async function NewAudit({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const old = from ? await db.audit.findUnique({ where: { id: from } }) : null;
  const initial: InitialAudit | undefined = old
    ? {
        brand: old.brand,
        website: old.website,
        industry: old.industry,
        tier: old.tier,
        handles: handlesSchema.parse(old.handles),
        channels: channelTargetsSchema.safeParse(old.channels).data,
        targetAudience: targetAudienceSchema.nullable().catch(null).parse(old.targetAudience),
        period: periodSchema.nullable().catch(null).parse(old.period),
      }
    : undefined;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DISCOVER THE POSSIBILITIES</span>
          <h1>New brand audit</h1>
          <p>From a social footprint to a focused plan of action.</p>
        </div>
        <Link className="button" href="/audits/bulk">
          <ListPlus size={16} />
          Bulk audit
        </Link>
      </div>
      <AuditForm
        initial={initial}
        mockCollection={process.env.USE_MOCK_DATA === 'true'}
        aiEnabled={aiConfigured()}
      />
    </>
  );
}
