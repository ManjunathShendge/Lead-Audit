'use client';
import { useState } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { pdfSections, sectionFilename, type PdfSection } from '@/lib/pdf/sections';

/** Downloads one area of the report as its own PDF, built from the data like the full export. */
export function SectionDownload({
  auditId,
  brand,
  section,
}: {
  auditId: string;
  brand: string;
  section: PdfSection;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/pdf?section=${section}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'PDF export failed.');
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = sectionFilename(brand, section);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to export PDF.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="section-download">
      <button className="button section-download-button" onClick={download} disabled={busy}>
        <ArrowDownToLine size={14} aria-hidden />
        {busy ? 'Preparing PDF…' : `Download ${pdfSections[section]} PDF`}
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
