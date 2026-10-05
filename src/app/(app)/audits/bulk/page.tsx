import { BulkAuditForm } from '@/components/bulk-audit-form';
export default function BulkAudit() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DISCOVER THE POSSIBILITIES</span>
          <h1>Bulk brand audit</h1>
          <p>Paste a list of prospects and queue every audit in one go.</p>
        </div>
      </div>
      <BulkAuditForm mockCollection={process.env.USE_MOCK_DATA === 'true'} />
    </>
  );
}
