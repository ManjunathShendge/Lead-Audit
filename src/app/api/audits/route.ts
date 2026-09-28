import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { apiGuard,jsonInput } from '@/lib/http';
import { auditInputSchema } from '@/lib/validation';
import { loadSnapshot } from '@/lib/config-store';
import { platforms } from '@/lib/collectors/types';
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function POST(request:Request){const guard=await apiGuard(request,true);if(guard)return guard;let input;try{input=auditInputSchema.parse(await jsonInput(request));}catch{return Response.json({error:'Check the brand, website and confirmed handles. Present accounts need a valid handle.'},{status:400});}
  if(process.env.USE_MOCK_DATA!=='true')return Response.json({error:'Only mock audits are enabled until live integrations are reviewed.'},{status:409});
  try{const snapshot=await loadSnapshot(input.industry);const active=platforms.filter(p=>snapshot.settings.enabled.includes(p)&&input.handles[p].presence==='present');
    if(!active.length&&!platforms.some(p=>snapshot.settings.enabled.includes(p)&&input.handles[p].presence==='absent'))return Response.json({error:'Confirm at least one enabled platform as present or absent.'},{status:400});
    const key=createHash('sha256').update(JSON.stringify({handles:input.handles,industry:input.industry,tier:input.tier,brand:input.brand,website:input.website,config:snapshot,mode:'mock'})).digest('hex');
    const cacheDays=Number(process.env.AUDIT_CACHE_DAYS??7);const since=new Date(Date.now()-(Number.isFinite(cacheDays)?Math.max(0,cacheDays):7)*86400000);
    const cached=await db.audit.findFirst({where:{cacheKey:key,state:'complete',createdAt:{gte:since}},orderBy:{createdAt:'desc'}});
    if(cached&&!input.force)return Response.json({cached:{id:cached.id,createdAt:cached.createdAt},message:'A recent matching audit is available.'},{status:409});
    const audit=await db.audit.create({data:{brand:input.brand,website:input.website||null,industry:input.industry,handles:json(input.handles),tier:input.tier,config:json(snapshot),cacheKey:key,runs:{create:active.map(platform=>({platform,handle:input.handles[platform].handle}))}}});
    return Response.json({id:audit.id},{status:201});
  }catch{console.error(JSON.stringify({event:'audit.create_failed'}));return Response.json({error:'Unable to create the audit. Check database setup and seed configuration.'},{status:503});}
}
