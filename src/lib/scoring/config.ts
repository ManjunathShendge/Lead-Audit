import { z } from 'zod';
import { platformSchema } from '../collectors/types';
const weight=z.number().finite().min(0).max(100);
const platformWeights=z.object({instagram:weight,facebook:weight,linkedin:weight,youtube:weight});
export const configSchema=z.object({
  channels:z.object({website:weight,social:weight,gbp:weight}),
  components:z.object({activity:weight,engagement:weight,audience:weight,completeness:weight}),
  website:z.object({performance:weight,seo:weight,tracking:weight,conversion:weight,freshness:weight}),
  gbp:z.object({rating:weight,reviews:weight,replies:weight,completeness:weight}),
  industries:z.object({General:z.object({weights:platformWeights,relevant:z.array(platformSchema)}),B2B:z.object({weights:platformWeights,relevant:z.array(platformSchema)}),D2C:z.object({weights:platformWeights,relevant:z.array(platformSchema)})}),
  enabled:z.array(platformSchema),thresholds:z.object({gapDays:z.number().positive(),gapPenalty:weight,gapScore:weight,ratingLow:z.number(),ratingHigh:z.number(),lcp:z.number().positive(),inp:z.number().positive(),cls:z.number().positive(),altRatio:z.number().min(0).max(1),strong:weight,good:weight,needsWork:weight}),
});
export type ScoreConfig=z.infer<typeof configSchema>;
export const defaults:ScoreConfig={channels:{website:40,social:40,gbp:20},components:{activity:35,engagement:35,audience:15,completeness:15},website:{performance:30,seo:30,tracking:20,conversion:20,freshness:0},gbp:{rating:40,reviews:30,replies:15,completeness:15},industries:{General:{weights:{instagram:35,linkedin:25,facebook:20,youtube:20},relevant:['instagram','facebook','linkedin','youtube']},B2B:{weights:{instagram:20,linkedin:40,facebook:15,youtube:25},relevant:['linkedin','youtube']},D2C:{weights:{instagram:45,facebook:25,youtube:20,linkedin:10},relevant:['instagram','facebook','youtube']}},enabled:['instagram','facebook','linkedin','youtube'],thresholds:{gapDays:21,gapPenalty:20,gapScore:50,ratingLow:3,ratingHigh:4.5,lcp:2.5,inp:200,cls:.1,altRatio:.9,strong:80,good:60,needsWork:40}};
export const benchmarkSchema=z.object({postsTarget:z.number().positive(),engagementTarget:z.number().positive(),followerLow:z.number().positive(),followerHigh:z.number().positive(),reviewLow:z.number().positive(),reviewHigh:z.number().positive()}).refine(b=>b.followerHigh>b.followerLow&&b.reviewHigh>b.reviewLow,'Band high must exceed band low');
export type Benchmark=z.infer<typeof benchmarkSchema>;
export const placeholderBenchmark:Benchmark={postsTarget:12,engagementTarget:3,followerLow:1000,followerHigh:50000,reviewLow:10,reviewHigh:500};
