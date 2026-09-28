import { z } from 'zod';
import { platforms, type Platform } from './collectors/types';
import type { Handles } from './report';
export const handleSchema = z
  .object({
    handle: z
      .string()
      .trim()
      .max(100)
      .regex(/^[a-zA-Z0-9_.@-]*$/, 'Use a username, not a URL.'),
    presence: z.enum(['present', 'absent', 'unknown']),
  })
  .superRefine((value, ctx) => {
    if (value.presence === 'present' && !value.handle)
      ctx.addIssue({ code: 'custom', message: 'A confirmed account needs a handle.' });
    if (value.presence !== 'present' && value.handle)
      ctx.addIssue({ code: 'custom', message: 'Remove the handle or mark the account present.' });
  });
export const handlesSchema = z
  .object({ instagram: handleSchema, facebook: handleSchema, linkedin: handleSchema, youtube: handleSchema })
  .strict();
export const auditInputSchema = z
  .object({
    brand: z.string().trim().min(1).max(100),
    website: z
      .string()
      .max(2048)
      .refine((v) => {
        if (!v) return true;
        try {
          const u = new URL(v);
          return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password;
        } catch {
          return false;
        }
      }, 'Enter a valid HTTP or HTTPS website.'),
    industry: z.enum(['General', 'B2B', 'D2C']),
    tier: z.enum(['strong', 'average', 'weak']),
    handles: handlesSchema,
    force: z.boolean().default(false),
  })
  .strict();
export const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export function emptyHandles(): Handles {
  return Object.fromEntries(platforms.map((p) => [p, { handle: '', presence: 'unknown' }])) as Handles;
}
export function normalizeHandle(platform: Platform, input: string): string {
  let value = input.trim();
  if (!value) return '';
  if (/^(https?:\/\/)?(www\.)?(instagram\.com|facebook\.com|linkedin\.com|youtube\.com)\//i.test(value)) {
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const expected = {
      instagram: 'instagram.com',
      facebook: 'facebook.com',
      linkedin: 'linkedin.com',
      youtube: 'youtube.com',
    }[platform];
    if (host !== expected || url.username || url.password)
      throw new Error('The URL does not match this platform.');
    const parts = url.pathname.split('/').filter(Boolean);
    if (
      parts.some((p) =>
        ['share', 'sharer.php', 'intent', 'reel', 'reels', 'p', 'watch', 'shorts', 'posts'].includes(
          p.toLowerCase(),
        ),
      )
    )
      throw new Error('Use a profile URL, not a post or share link.');
    if (platform === 'linkedin') {
      if (parts[0] !== 'company' || parts.length !== 2) throw new Error('Use a LinkedIn company page.');
      value = parts[1];
    } else if (platform === 'youtube') {
      if (parts[0] === 'channel' && parts.length === 2) value = parts[1];
      else if (parts.length === 1 && parts[0].startsWith('@')) value = parts[0];
      else throw new Error('Use a YouTube @handle or channel ID.');
    } else {
      if (parts.length !== 1) throw new Error('Use the profile homepage URL.');
      value = parts[0];
    }
  }
  value = value.replace(/^@/, '');
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(value)) throw new Error('Enter a valid public handle.');
  return platform === 'youtube' && value.startsWith('UC') ? value : value.toLowerCase();
}
export function parseSource(input: string) {
  const handles = emptyHandles();
  let website: string | null = null;
  const text = input.trim();
  if (!text) throw new Error('Enter a website or a social handle.');
  const items = text
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const item of items) {
    const prefix = item.match(/^(instagram|facebook|linkedin|youtube)\s*:\s*(.+)$/i);
    if (prefix) {
      const platform = prefix[1].toLowerCase() as Platform;
      handles[platform] = { handle: normalizeHandle(platform, prefix[2]), presence: 'present' };
      continue;
    }
    const social = platforms.find((p) =>
      new RegExp(`^(?:https?:\\/\\/)?(?:www\\.)?${p}\\.com(?:/|$)`, 'i').test(item),
    );
    if (social) {
      handles[social] = { handle: normalizeHandle(social, item), presence: 'present' };
      continue;
    }
    if (item.startsWith('@')) {
      handles.instagram = { handle: normalizeHandle('instagram', item), presence: 'present' };
      continue;
    }
    const url = new URL(/^https?:\/\//i.test(item) ? item : `https://${item}`);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname.includes('.') ||
      url.port
    )
      throw new Error('Enter a public website URL or label handles by platform.');
    if (website) throw new Error('Use one website per audit.');
    website = url.origin;
  }
  return { website, handles };
}
