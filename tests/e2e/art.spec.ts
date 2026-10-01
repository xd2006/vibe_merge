import { expect, test } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('вкладка «Арт»: предметы, режим, копирование промпта', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Арт', exact: true }).click();
  const panel = page.getByTestId('art-panel');
  await expect(panel.locator('.art-row')).toHaveCount(12);

  const row = page.getByTestId('art-wood:2');
  await expect(row).toContainText('Доска');
  await row.getByRole('button', { name: 'Копировать промпт' }).click();
  await expect(row).toContainText('Промпт скопирован');
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('Single object: Доска');
  // Уровень 2 — с пометкой про референс первого уровня.
  expect(prompt).toContain('level 1 of the same chain');

  // Режим предмета пишется в art.items конфига.
  await row.getByRole('combobox', { name: 'mode' }).selectOption('auto');
  // CodeMirror рисует только видимые строки, поэтому смотрим сохранённый черновик.
  const draft = () =>
    page.evaluate(
      () => JSON.parse(JSON.parse(localStorage.getItem('vibe-merge.draft.v1')!).text).art.items,
    );
  await expect.poll(draft).toMatchObject({ 'wood:2': { mode: 'auto' } });
  await expect(row.getByRole('button', { name: 'Сгенерировать' })).toBeVisible();
});
