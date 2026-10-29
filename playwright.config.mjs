import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:35000,
  expect:{timeout:12000},
  retries:process.env.CI?1:0,
  workers:1,
  reporter:process.env.CI?'list':'line',
  use:{baseURL:'http://127.0.0.1:3210',trace:'retain-on-failure',serviceWorkers:'block'},
  projects:[
    {name:'iPhone-like Chromium',use:{...devices['iPhone 13'],browserName:'chromium'}},
    {name:'desktop Chromium',use:{browserName:'chromium',viewport:{width:1280,height:800}}}
  ],
  webServer:{
    command:'npm run dev -- -p 3210',
    url:'http://127.0.0.1:3210',
    timeout:120000,
    reuseExistingServer:!process.env.CI,
    env:{
      NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:'e2e-test-public-key',
      NEXT_TELEMETRY_DISABLED:'1'
    }
  }
});
