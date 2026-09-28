import 'dotenv/config';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
await fs.mkdir('output/pdf', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://localhost:3000/login');
  await page.getByLabel('Workspace password').fill(process.env.APP_PASSWORD);
  await page.getByRole('button', { name: 'Enter workspace' }).click();
  await page.waitForURL('**/history');
  await page.screenshot({ path: 'artifacts/history.png', fullPage: true });
  for (const tier of ['average', 'strong', 'weak']) {
    const res = await page.request.get(`http://localhost:3000/api/audits/demo-${tier}/pdf`, {
      timeout: 120000,
    });
    if (!res.ok()) throw new Error(await res.text());
    const bytes = await res.body();
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Not a PDF');
    await fs.writeFile(`output/pdf/tier2-${tier}-sample.pdf`, bytes);
    console.log(`${tier}: ${bytes.length} bytes`);
  }
} finally {
  await browser.close();
}
