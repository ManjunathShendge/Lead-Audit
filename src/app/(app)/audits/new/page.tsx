import { db } from '@/lib/db';
import { AuditForm, type InitialAudit } from '@/components/audit-form';
import { handlesSchema } from '@/lib/validation';
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
      </div>
      <AuditForm initial={initial} />
    </>
  );
}
