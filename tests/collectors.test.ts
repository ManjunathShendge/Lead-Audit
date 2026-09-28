import { describe,it,expect } from 'vitest';
import { mockCollector, normalizeMock } from '../src/lib/collectors/mock';
import { platforms, resultSchema } from '../src/lib/collectors/types';
describe('synthetic fixtures and normalized boundary',()=>{
  for(const tier of ['strong','average','weak'] as const) for(const platform of platforms) it(`${tier} ${platform} preserves raw source values`,async()=>{
    const result=await mockCollector(platform,tier,new Date('2026-09-28T00:00:00Z')).collect('demo',{postsLimit:60});
    expect(resultSchema.safeParse(result).success).toBe(true);
    const raw=result.raw as {profile:unknown;posts:unknown}; expect(result.profile).toEqual(raw.profile); expect(result.posts).toEqual(raw.posts); expect(result.costUsd).toBe(0);
  });
  it('hidden subscribers stay null and private data stays absent',async()=>{expect((await mockCollector('youtube','weak').collect('demo',{postsLimit:10})).profile?.followers).toBeNull();expect((await mockCollector('facebook','weak').collect('demo',{postsLimit:10})).profile).toBeNull();});
  it('rejects malformed raw normalized fixtures',()=>expect(()=>normalizeMock({profile:{followers:-1}})).toThrow());
  it('does not claim completeness after truncation',async()=>expect((await mockCollector('instagram','weak').collect('demo',{postsLimit:1})).sampleComplete).toBe(false));
});
