import { afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  queueTick: vi.fn(),
  accuracyTick: vi.fn(),
  auditCount: vi.fn(),
  runCount: vi.fn(),
  itemCount: vi.fn(),
}));
vi.mock('../src/lib/jobs/queue', () => ({ queueTick: mocks.queueTick }));
vi.mock('../src/lib/jobs/accuracy', () => ({ accuracyTick: mocks.accuracyTick }));
vi.mock('../src/lib/db', () => ({
  db: {
    audit: { count: mocks.auditCount },
    collectorRun: { count: mocks.runCount },
    accuracyItem: { count: mocks.itemCount },
  },
}));
import { jobsRunning, kickJobs, pendingWork } from '../src/lib/jobs/runner';
function pendingSequence(...totals: number[]) {
  for (const total of totals) mocks.runCount.mockResolvedValueOnce(total);
  mocks.runCount.mockResolvedValue(0);
  mocks.auditCount.mockResolvedValue(0);
  mocks.itemCount.mockResolvedValue(0);
}
describe('on-demand job runner', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });
  it('counts audits, collector runs and accuracy items as pending work', async () => {
    mocks.auditCount.mockResolvedValue(1);
    mocks.runCount.mockResolvedValue(3);
    mocks.itemCount.mockResolvedValue(2);
    expect(await pendingWork()).toEqual({ audits: 1, runs: 3, items: 2, total: 6 });
  });
  it('ticks until nothing is pending, then stops', async () => {
    vi.useFakeTimers();
    pendingSequence(2, 1);
    const loop = kickJobs('test');
    expect(jobsRunning()).toBe(true);
    await vi.runAllTimersAsync();
    await loop;
    expect(mocks.queueTick).toHaveBeenCalledTimes(3);
    expect(mocks.accuracyTick).toHaveBeenCalledTimes(3);
    expect(jobsRunning()).toBe(false);
  });
  it('runs one loop per process however often it is kicked', async () => {
    pendingSequence();
    const first = kickJobs('a');
    expect(kickJobs('b')).toBe(first);
    await first;
    expect(mocks.queueTick).toHaveBeenCalledTimes(1);
  });
  it('keeps going after a failed tick and stops when the database is unreachable', async () => {
    mocks.queueTick.mockRejectedValueOnce(new Error('boom'));
    mocks.auditCount.mockRejectedValue(new Error('db down'));
    mocks.runCount.mockResolvedValue(0);
    mocks.itemCount.mockResolvedValue(0);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(kickJobs('test')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    expect(jobsRunning()).toBe(false);
  });
});
