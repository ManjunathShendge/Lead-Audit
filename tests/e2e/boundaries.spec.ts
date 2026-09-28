import { test, expect } from '@playwright/test';
test('private API boundaries and explicitly absent accounts', async ({ request }) => {
  expect((await request.get('/api/audits/demo-average/raw')).status()).toBe(401);
  expect((await request.get('/api/audits/demo-average/pdf')).status()).toBe(401);
  const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
  expect(
    (
      await request.post('/api/auth', {
        headers: { Origin: 'https://untrusted.example' },
        data: { password: 'wrong' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/auth', {
        headers: { Origin: origin },
        data: { password: process.env.APP_PASSWORD || 'change-me' },
      })
    ).status(),
  ).toBe(200);
  const headers = { Origin: origin };
  expect((await request.post('/api/audits', { headers, data: { brand: 'invalid' } })).status()).toBe(400);
  const handles = {
    instagram: { handle: '', presence: 'unknown' },
    facebook: { handle: '', presence: 'unknown' },
    linkedin: { handle: '', presence: 'absent' },
    youtube: { handle: '', presence: 'unknown' },
  };
  const res = await request.post('/api/audits', {
    headers,
    data: { brand: 'Absent account test', website: '', industry: 'B2B', tier: 'weak', handles, force: true },
  });
  expect(res.status()).toBe(201);
  const { id } = await res.json();
  try {
    await expect
      .poll(
        async () => {
          const response = await request.get(`/api/audits/${id}`);
          return (await response.json()).state;
        },
        { timeout: 20000 },
      )
      .toBe('complete');
    const raw = await request.get(`/api/audits/${id}/raw`);
    expect((await raw.json()).runs).toHaveLength(0);
    const html = await request.get(`/audits/${id}`);
    expect(await html.text()).toContain('No account');
  } finally {
    expect((await request.delete(`/api/audits/${id}`, { headers })).status()).toBe(200);
    expect((await request.get(`/api/audits/${id}/raw`)).status()).toBe(404);
  }
});
