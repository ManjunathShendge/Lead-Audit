import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { type Collector, type Platform, profileSchema, postSchema, resultSchema, profileUrl } from '../types';
const fixtureSchema = z.object({ synthetic: z.literal(true), fixtureVersion: z.literal(1), platform: z.string(), tier: z.string(), status: z.enum(['ok','private']), sampleComplete: z.boolean(), subscriberHidden: z.boolean(), profile: profileSchema.omit({handle:true,url:true}), posts: z.array(postSchema.omit({publishedAt:true,url:true}).extend({daysAgo:z.number().nonnegative()})) });
export function normalizeMock(raw: unknown) { return resultSchema.parse(raw); }
export function mockCollector(platform: Platform, tier: 'strong'|'average'|'weak', asOf = new Date()): Collector {
  return { platform, async collect(handle, {postsLimit, signal}) {
    signal?.throwIfAborted();
    const fixture = fixtureSchema.parse(JSON.parse(await readFile(path.join(process.cwd(),'fixtures',platform,`raw-mock-${tier}.json`),'utf8')));
    const raw = { status: fixture.status, profile: fixture.status === 'private' ? null : {...fixture.profile,handle,url:profileUrl(platform,handle)}, posts: fixture.status === 'private' ? [] : fixture.posts.slice(0,postsLimit).map(({daysAgo,...post})=>({...post,publishedAt:new Date(asOf.getTime()-daysAgo*86400000).toISOString(),url:null})), costUsd:0, warnings:['Synthetic fixture data — not collected from a live platform.', ...(fixture.status==='private'?['Private account: public metrics are unavailable.']:[]), ...(fixture.subscriberHidden?['Subscriber count is hidden.']:[])], fetchedAt:asOf.toISOString(), sampleComplete:fixture.sampleComplete&&fixture.posts.length<=postsLimit, subscriberHidden:fixture.subscriberHidden };
    return normalizeMock({...raw, raw:{...raw,source:{synthetic:true,fixture:`fixtures/${platform}/raw-mock-${tier}.json`,fixtureVersion:fixture.fixtureVersion}}});
  }};
}
