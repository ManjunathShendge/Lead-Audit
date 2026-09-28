import { afterEach,describe,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({findMany:vi.fn(),updateMany:vi.fn(),auditFindMany:vi.fn(),auditUpdateMany:vi.fn(),collect:vi.fn()}));
vi.mock('../src/lib/db',()=>({db:{collectorRun:{findMany:mocks.findMany,updateMany:mocks.updateMany},audit:{findMany:mocks.auditFindMany,updateMany:mocks.auditUpdateMany}}}));
vi.mock('../src/lib/collectors/mock',()=>({mockCollector:()=>({collect:mocks.collect})}));
import { queueTick,withTimeout } from '../src/lib/jobs/queue';
const result={status:'ok',profile:null,posts:[],raw:{fixture:true},costUsd:0,warnings:[],fetchedAt:'2026-09-28T00:00:00.000Z',sampleComplete:false,subscriberHidden:false};
function setup(attempts=0){vi.stubEnv('USE_MOCK_DATA','true');mocks.findMany.mockResolvedValue([{id:'job',auditId:'audit',platform:'instagram',handle:'demo',state:'queued',attempts,leaseUntil:null,audit:{mode:'mock',tier:'average',createdAt:new Date()}}]);mocks.updateMany.mockResolvedValue({count:1});mocks.auditFindMany.mockResolvedValue([]);mocks.auditUpdateMany.mockResolvedValue({count:1});}
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
describe('durable worker boundaries',()=>{
  it('stores successful raw responses with their normalized result',async()=>{setup();mocks.collect.mockResolvedValue(result);await queueTick();expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({state:'done',costUsd:0,raw:{fixture:true}})}));});
  it('backs off once and then fails independently',async()=>{setup();mocks.collect.mockRejectedValue(new Error('secret-provider-details'));await queueTick();expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({state:'queued',leaseUntil:expect.any(Date)})}));setup(1);await queueTick();expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({state:'failed',result:expect.objectContaining({profile:null,costUsd:null})})}));expect(JSON.stringify(mocks.updateMany.mock.calls)).not.toContain('secret-provider-details');});
  it('does not execute a job claimed by another worker',async()=>{setup();mocks.updateMany.mockResolvedValue({count:0});await queueTick();expect(mocks.collect).not.toHaveBeenCalled();});
  it('never calls a live API when mock mode is off',async()=>{setup();vi.stubEnv('USE_MOCK_DATA','false');await queueTick();expect(mocks.collect).not.toHaveBeenCalled();});
  it('aborts on timeout and lets immediate success finish',async()=>{let aborted=false;await expect(withTimeout(signal=>new Promise(()=>signal.addEventListener('abort',()=>{aborted=true;})),5)).rejects.toThrow('timed out');expect(aborted).toBe(true);await expect(withTimeout(async()=>42,50)).resolves.toBe(42);});
});
