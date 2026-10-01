import { expect, test } from '@playwright/test';

test('приложение открывается', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Merge-2 прототип' })).toBeVisible();
});
