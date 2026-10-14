import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const port = 5173;

// Редактор по умолчанию открывает пресет Core Merge Config; e2e рассчитаны на демо-пресет.
const demoText =
  JSON.stringify(JSON.parse(readFileSync('presets/demo.json', 'utf8')), null, 2) + '\n';
const demoDraft = {
  cookies: [],
  origins: [
    {
      origin: `http://localhost:${port}`,
      localStorage: [{ name: 'vibe-merge.draft.v1', value: JSON.stringify({ text: demoText }) }],
    },
  ],
};

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    storageState: demoDraft,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
