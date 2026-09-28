import { test,expect } from '@playwright/test';
test('authenticated mock audit, cache choice and deletion',async({page,request})=>{
  expect((await request.get('/api/audits/demo-average')).status()).toBe(401);
  await page.goto('/audits/new');await expect(page).toHaveURL(/login/);
  await page.getByLabel('Workspace password').fill(process.env.APP_PASSWORD||'change-me');await page.getByRole('button',{name:'Enter workspace'}).click();await expect(page).toHaveURL(/history/);
  await page.getByRole('link',{name:'New audit',exact:true}).first().click();await page.getByLabel('Website URL or social handles').fill('samplebrand.example');await page.getByRole('button',{name:'Find accounts'}).click();await expect(page.getByText('No website was crawled.',{exact:false})).toBeVisible();
  const brand=`E2E Brand ${Date.now()}`;await page.getByLabel('Brand name').fill(brand);await page.getByRole('button',{name:'Confirm & run audit'}).click();await expect(page).toHaveURL(/audits\/(?!new)/);await expect(page.locator('[data-report-ready="true"]')).toBeVisible({timeout:45000});await expect(page.getByRole('heading',{name:brand,exact:false})).toBeVisible();
  const id=page.url().split('/').at(-1)!;const raw=await page.request.get(`/api/audits/${id}/raw`);expect(raw.ok()).toBe(true);expect((await raw.json()).runs).toHaveLength(4);
  await page.getByRole('link',{name:'Re-run audit'}).click();await page.getByRole('button',{name:'Confirm & run audit'}).click();await expect(page.getByText('A recent audit is ready.')).toBeVisible();await page.getByRole('link',{name:'View cached audit'}).click();await expect(page).toHaveURL(new RegExp(id));
  await page.getByRole('link',{name:'Audit library',exact:true}).click();await page.getByLabel('Search audits').fill(brand);await page.getByRole('button',{name:`Delete ${brand}`}).click();await page.getByRole('button',{name:'Delete audit',exact:true}).click();await expect(page.getByText('No matching brands')).toBeVisible();
});
