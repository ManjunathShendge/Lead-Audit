import 'dotenv/config';
import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',timeout:90000,fullyParallel:false,workers:1,use:{baseURL:process.env.APP_ORIGIN||'http://localhost:3000',headless:true,viewport:{width:1440,height:1000},trace:'retain-on-failure'},reporter:'list',webServer:[{command:'npm run dev -- --hostname 127.0.0.1',url:'http://localhost:3000/login',reuseExistingServer:!process.env.CI,timeout:120000},{command:'npm run worker',wait:{stdout:/worker.started/},reuseExistingServer:false,timeout:30000}]});
