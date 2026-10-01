import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function cellCenter(page: Page, x: number, y: number) {
  const board = page.getByTestId('board');
  await expect(board).toHaveAttribute('data-cell-size', /^[1-9]\d*$/);
  const box = (await board.boundingBox())!;
  const data = await board.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  const size = Number(data.cellSize);
  return {
    x: box.x + Number(data.originX) + (x + 0.5) * size,
    y: box.y + Number(data.originY) + (y + 0.5) * size,
  };
}

const jsonText = (page: Page) => page.getByTestId('json-editor').locator('.cm-content').innerText();

test('редактор → поле формы → JSON → запуск → ход → экспорт метрик', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('editor-status')).toContainText('ошибок нет');

  // Поле формы меняет JSON.
  const name = page.getByTestId('form').getByLabel('Название*');
  await name.fill('Тестовая игра');
  await expect.poll(() => jsonText(page)).toContain('"name": "Тестовая игра"');

  // Запуск и ход: тап по лесопилке (1, 2).
  await page.getByRole('button', { name: 'Запустить прототип' }).click();
  const sawmill = await cellCenter(page, 1, 2);
  await page.mouse.click(sawmill.x, sawmill.y);
  await expect(page.getByTestId('energy-value')).toHaveText('99 / 100');

  // Метрики и экспорт.
  await page.getByTestId('open-metrics').click();
  await expect(page.getByTestId('metric-energy')).toHaveText('1');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Экспорт JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Тестовая игра-metrics.json');
  const data = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  const current = data.sessions.at(-1);
  expect(current.metrics.energySpent.total).toBe(1);
  expect(current.events.some((e: { type: string }) => e.type === 'energy_spent')).toBe(true);

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Экспорт CSV' }).click(),
  ]);
  const csvText = readFileSync((await csv.path())!, 'utf8');
  expect(csvText).toContain(';energy;total;Энергия всего;1;1');

  // Назад в редактор: черновик сохранён.
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await page.getByRole('button', { name: '← Редактор' }).click();
  await expect(page.getByTestId('form').getByLabel('Название*')).toHaveValue('Тестовая игра');
});

test('синтаксическая ошибка JSON блокирует форму и запуск', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('json-editor').locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(',');

  await expect(page.getByTestId('editor-status')).toContainText('ошибок: 1');
  await expect(page.getByRole('button', { name: 'Запустить прототип' })).toBeDisabled();
  await expect(page.getByText('JSON содержит синтаксическую ошибку')).toBeVisible();
  await expect(page.getByTestId('issues')).toContainText('Синтаксическая ошибка JSON');
  await expect(page.getByTestId('json-editor').locator('.cm-lintRange-error')).toHaveCount(1);
});

test('логическая ошибка показывается у поля и в списке; пресет её сбрасывает', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Энергия', exact: true }).click();
  // Стоимость генерации 1 больше максимума 0 — нет, максимум 0 нарушает схему (минимум 1).
  const max = page.getByTestId('form').getByLabel('Максимум*');
  await max.fill('0');
  await expect(page.getByTestId('issues')).toContainText('energy.max');
  await expect(page.getByTestId('form').locator('.error-detail')).toContainText('1');
  await expect(page.getByRole('button', { name: 'Запустить прототип' })).toBeDisabled();

  await page.getByLabel('Пресет…').selectOption('demo');
  await expect(page.getByTestId('editor-status')).toContainText('ошибок нет');
});

test('загрузка конфига из файла', async ({ page }) => {
  await page.goto('/');
  const empty = readFileSync('presets/empty.json', 'utf8');
  await page.getByTestId('load-file').setInputFiles({
    name: 'empty.json',
    mimeType: 'application/json',
    buffer: Buffer.from(empty),
  });
  await expect.poll(() => jsonText(page)).toContain('"name": "Новая игра"');
  await page.getByRole('button', { name: 'Запустить прототип' }).click();
  await expect(page.getByTestId('level')).toContainText('Уровень 1');
});
