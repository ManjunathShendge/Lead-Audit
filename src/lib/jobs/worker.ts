import 'dotenv/config';
import { queueTick } from './queue';
import { db } from '../db';
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
async function main() {
  console.log(
    JSON.stringify({
      event: 'worker.started',
      mode: process.env.USE_MOCK_DATA === 'true' ? 'mock' : 'disabled',
    }),
  );
  while (!stopping) {
    try {
      await queueTick();
    } catch {
      console.error(
        JSON.stringify({
          event: 'worker.tick_failed',
          message: 'Check database availability and seeded configuration.',
        }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await db.$disconnect();
}
void main();
