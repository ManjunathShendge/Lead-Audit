import type { Report } from '../report';

/** Report areas that can be exported on their own. Order is the order they appear in the report. */
export const pdfSections = {
  overview: 'Overview & score',
  audience: 'Target audience',
  social: 'Social media',
  website: 'Website',
  seo: 'SEO audit',
  gbp: 'Google Business Profile',
  opportunities: 'Priority opportunities',
} as const;
export type PdfSection = keyof typeof pdfSections;

export const isPdfSection = (v: unknown): v is PdfSection =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(pdfSections, v);

/** Whether the audit has data for a section; a section with none has nothing to export. */
export function sectionAvailable(section: PdfSection, report: Report, alignmentOk: boolean) {
  switch (section) {
    case 'audience':
      return alignmentOk;
    case 'website':
      return !!report.website;
    case 'seo':
      return !!report.seo?.groups;
    case 'gbp':
      return !!report.gbp;
    default:
      return true;
  }
}

export const sectionFilename = (brand: string, section: PdfSection | null) =>
  `${
    brand
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 80) || 'brand'
  }-${section ? `${section}-report` : 'social-audit'}.pdf`;
