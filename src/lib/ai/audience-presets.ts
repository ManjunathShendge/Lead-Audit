/** Starting points for the target-audience fields. Shared by server and browser. */

export type IndustryProfile = 'General' | 'B2B' | 'D2C';

export const personaPresets: Record<IndustryProfile, string[]> = {
  B2B: [
    'Founders & CEOs',
    'Marketing heads',
    'Sales leaders',
    'HR / people leaders',
    'IT decision-makers',
    'Procurement managers',
    'Operations heads',
    'Finance heads (CFOs)',
  ],
  D2C: [
    'Gen Z shoppers (18–24)',
    'Young professionals (25–34)',
    'Working parents',
    'Fitness & wellness enthusiasts',
    'Gift buyers',
    'Premium / conscious shoppers',
    'First-time online buyers in tier-2 cities',
  ],
  General: [
    'Local customers nearby',
    'Working professionals',
    'Small business owners',
    'Families',
    'Students',
    'Visitors & tourists',
  ],
};

export const locationPresets = [
  'Pan-India',
  'Metro cities',
  'Tier-2 & tier-3 cities',
  'Bengaluru',
  'Mumbai',
  'Delhi NCR',
  'Pune',
  'Hyderabad',
  'Chennai',
  'UK',
  'US',
  'Middle East',
  'Global',
];

export const descriptionExamples: Record<IndustryProfile, string> = {
  B2B: 'HR heads and founders at 50–500 person IT companies in India who need to hire faster without raising costs',
  D2C: 'Urban women aged 25–40 who buy clean skincare online and care about ingredients more than price',
  General: 'Families and working professionals within 5 km of the store who want quick, reliable service',
};

export const audienceTips = [
  'Describe who buys or decides, not everyone who might follow.',
  'Include role or age, company size or life stage, and the problem they need solved.',
  'Two to four clear personas work better than a long list.',
];

/** Adds or removes one item in a comma-separated list, keeping at most `max` items. */
export function toggleListItem(list: string, item: string, max = 6): string {
  const items = list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const i = items.findIndex((s) => s.toLowerCase() === item.toLowerCase());
  if (i >= 0) items.splice(i, 1);
  else if (items.length < max) items.push(item);
  return items.join(', ');
}
export const listHas = (list: string, item: string) =>
  list
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .includes(item.toLowerCase());
