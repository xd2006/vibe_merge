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

type DebugHook = { cells(): Record<string, string> };

/** Содержимое доски через отладочный хук dev-сборки: `{ "x,y": "wood:2" }`. */
const boardCells = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vibeMerge: DebugHook }).__vibeMerge.cells());

test('тап по генератору тратит энергию и создаёт предмет', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('energy-value')).toHaveText('100 / 100');
  const before = Object.keys(await boardCells(page)).length;

  // Лесопилка в демо-пресете стоит в клетке (1, 2).
  const sawmill = await cellCenter(page, 1, 2);
  await page.mouse.click(sawmill.x, sawmill.y);

  await expect(page.getByTestId('energy-value')).toHaveText('99 / 100');
  await expect(page.getByTestId('energy')).toContainText('+1 через');
  expect(Object.keys(await boardCells(page)).length).toBe(before + 1);
});

test('перетаскивание ветки на ветку сливает их в доску', async ({ page }) => {
  await page.goto('/');
  // Две ветки (wood:1) стоят в клетках (0, 4) и (1, 4).
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
