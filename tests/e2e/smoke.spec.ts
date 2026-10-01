import { expect, test, type Page } from '@playwright/test';

/** Координаты центра клетки на странице по геометрии, которую доска пишет в data-атрибуты. */
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

async function tapCell(page: Page, x: number, y: number) {
  const c = await cellCenter(page, x, y);
  await page.mouse.click(c.x, c.y);
}

type DebugHook = { cells(): Record<string, string> };

/** Содержимое доски через отладочный хук dev-сборки: `{ "x,y": "wood:2" }`. */
const boardCells = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vibeMerge: DebugHook }).__vibeMerge.cells());

// Демо-пресет: лесопилки (1,2) и (6,7), карьер (5,2), ветки (0,4) и (1,4), доска (0,5),
// камешки (3,4) и (4,4), замки группы zone2 в (0,0)–(2,0).

test('тап по генератору тратит энергию и создаёт предмет', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('energy-value')).toHaveText('100 / 100');
  const before = Object.keys(await boardCells(page)).length;

  await tapCell(page, 1, 2);

  await expect(page.getByTestId('energy-value')).toHaveText('99 / 100');
  await expect(page.getByTestId('energy')).toContainText('+1 через');
  expect(Object.keys(await boardCells(page)).length).toBe(before + 1);
  // Генератор выделен: панель показывает его заряды.
  await expect(page.getByTestId('selection')).toContainText('Заряды: 11 / 12');
});

test('перетаскивание ветки на ветку сливает их в доску', async ({ page }) => {
  await page.goto('/');
  const from = await cellCenter(page, 0, 4);
  const to = await cellCenter(page, 1, 4);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();

  const cells = await boardCells(page);
  expect(cells['0,4']).toBeUndefined();
  expect(cells['1,4']).toBe('wood:2');
});

test('заказы показаны с кнопкой «Сдать»', async ({ page }) => {
  await page.goto('/');
  for (const i of [0, 1, 2]) {
    await expect(
      page.getByTestId(`order-${i}`).getByRole('button', { name: 'Сдать' }),
    ).toBeVisible();
  }
  await expect(page.getByTestId('level')).toContainText('Уровень 1');
  await expect(page.getByTestId('level')).toContainText('заказы 0 / 5');
});

test('партия сохраняется и восстанавливается после перезагрузки', async ({ page }) => {
  await page.goto('/');
  await tapCell(page, 1, 2);
  await expect(page.getByTestId('energy-value')).toHaveText('99 / 100');
  const cells = await boardCells(page);

  await page.reload();
  await expect(page.getByTestId('energy-value')).toHaveText('99 / 100');
  expect(await boardCells(page)).toEqual(cells);
});

test('забрать в хранилище и вернуть на выбранную клетку', async ({ page }) => {
  await page.goto('/');
  await tapCell(page, 3, 4);
  await page.getByTestId('selection').getByRole('button', { name: 'Забрать' }).click();
  await expect(page.getByTestId('open-storage')).toHaveText('Склад · 1');
  expect((await boardCells(page))['3,4']).toBeUndefined();

  await page.getByTestId('open-storage').click();
  await page.getByTestId('stack-item:stone:1').getByRole('button', { name: 'На доску' }).click();
  await expect(page.getByText('Выберите свободную клетку')).toBeVisible();
  await tapCell(page, 6, 0);

  expect((await boardCells(page))['6,0']).toBe('stone:1');
  await expect(page.getByTestId('open-storage')).toHaveText('Склад · 0');
});

test('читы: валюта и пропуск уровня открывают замки', async ({ page }) => {
  await page.goto('/');
  await tapCell(page, 0, 0);
  await expect(page.getByTestId('selection')).toContainText('Откроется на уровне 2');

  await page.getByTestId('open-cheats').click();
  await page.getByRole('button', { name: '+100 Гемы' }).click();
  await page.getByRole('button', { name: 'Пройти уровень' }).click();
  await page.getByRole('button', { name: 'Закрыть' }).click();

  await expect(page.getByTestId('hard-value')).toHaveText('115');
  await expect(page.getByTestId('level')).toContainText('Уровень 2');
  await tapCell(page, 0, 0);
  await expect(page.getByTestId('selection')).toContainText('Перетащите сюда «Доска»');
});
