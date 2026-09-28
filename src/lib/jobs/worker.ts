import 'dotenv/config';
import { queueTick } from './queue';
import { accuracyTick } from './accuracy';
import { currentMode, liveReadyPlatforms } from '../collectors';
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
      mode: currentMode(),
      liveCollectors: currentMode() === 'live' ? liveReadyPlatforms() : [],
    }),
  );
  while (!stopping) {
    try {
      await queueTick();
      await accuracyTick();
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
