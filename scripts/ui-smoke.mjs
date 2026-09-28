import 'dotenv/config';
import { chromium } from 'playwright';
import fs from 'node:fs';
fs.mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:3000/login');
await page.getByLabel('Workspace password').fill(process.env.APP_PASSWORD);
await page.getByRole('button',{name:'Enter workspace'}).click();
await page.waitForURL('**/history');
for(const tier of ['strong','average','weak']){
  await page.goto(`http://localhost:3000/audits/demo-${tier}`);
  await page.locator('[data-report-ready="true"]').waitFor();
  await page.screenshot({path:`artifacts/report-${tier}.png`,fullPage:true});
  if(await page.locator('.recharts-surface').count()<6)throw new Error('Charts missing');
}
await page.setViewportSize({width:834,height:1112});
await page.goto('http://localhost:3000/audits/demo-average');
await page.locator('[data-report-ready="true"]').waitFor();
await page.screenshot({path:'artifacts/report-tablet.png',fullPage:true});
if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw new Error('Tablet overflow');
await browser.close();
if(errors.length)throw new Error(errors.join('\n'));
console.log('Three demo reports and tablet layout passed browser smoke checks.');
