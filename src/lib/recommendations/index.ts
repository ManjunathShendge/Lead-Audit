export const serviceDefaults = {
  activity: {
    service: 'Branding & Social Media',
    explanation: 'Build a reliable content calendar so the brand stays visible between campaigns.',
  },
  engagement: {
    service: 'Branding & Social Media',
    explanation: 'Develop content strategy and reels that give the audience a reason to respond.',
  },
  audience: {
    service: 'Digital strategy call',
    explanation: 'Focus distribution and creative on reaching a relevant audience.',
  },
  completeness: {
    service: 'Branding',
    explanation: 'Complete the profile and make the brand story consistent across touchpoints.',
  },
  linkedin: {
    service: 'B2B Marketing',
    explanation: 'Strengthen the company presence where business buyers research their partners.',
  },
  video: {
    service: 'Videos & Animation',
    explanation: 'Add video to demonstrate products, share expertise and tell the brand story.',
  },
  missing: {
    service: 'Digital strategy call',
    explanation: 'Establish a presence on a channel that matters for this industry.',
  },
  performance: { service: 'Web & UI', explanation: 'Improve loading performance and Core Web Vitals.' },
  seo: {
    service: 'SEO / AEO / GEO',
    explanation: 'Strengthen the foundations that help people and search engines find the brand.',
  },
  tracking: {
    service: 'Growth & Performance Marketing',
    explanation: 'Measure acquisition and campaign outcomes with appropriate analytics and ad tags.',
  },
  conversion: {
    service: 'Web & UI + CRO',
    explanation: 'Give visitors clear and accessible ways to take the next step.',
  },
  freshness: {
    service: 'Copy & Content',
    explanation: 'Keep the site useful with current, relevant content.',
  },
  gbp: {
    service: 'Local SEO / reputation management',
    explanation: 'Build trust through reviews, owner replies and complete local information.',
  },
};
export type ServiceMap = Record<string, { service: string; explanation: string }>;
export interface Gap {
  platform: string;
  component: string;
  score: number;
  measured: string;
  service: string;
  explanation: string;
}
export function sortGaps(gaps: Gap[]) {
  return [...gaps].sort((a, b) => a.score - b.score || a.platform.localeCompare(b.platform));
}
export function lowestGaps(gaps: Gap[]) {
  return sortGaps(gaps).slice(0, 6);
}
