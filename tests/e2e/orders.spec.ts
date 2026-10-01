import { expect, test, type Page } from '@playwright/test';

/** Маленький конфиг: генератор даёт предмет 1-го уровня, заказ требует ровно его. */
const config = {
  meta: { name: 'Заказы e2e', seed: 7 },
  energy: { max: 10, start: 10, regen: { amount: 1, intervalSec: 60 } },
  chains: [{ id: 'item', name: 'Предмет', levels: [{ name: 'Шишка' }, { name: 'Ветка' }] }],
  generators: [
    {
      id: 'gen',
      name: 'Ёлка',
      levels: [{ energyCost: 1, produces: [{ chain: 'item', level: 1, weight: 1 }] }],
    },
  ],
  board: {
    width: 3,
    height: 3,
    legend: { '.': null, G: { generator: 'gen', level: 1 } },
    layout: ['G..', '...', '...'],
  },
  levels: [
    { id: 1, ordersRequired: 1, reward: [{ type: 'hard', amount: 10 }] },
    { id: 2, ordersRequired: 3 },
  ],
  orders: {
    slots: 1,
    templates: [
      {
        id: 't',
        weight: 1,
        boardLevels: [1, 9],
        maxRequirements: 1,
        requirements: [{ chain: 'item', level: 1 }],
        rewards: [
          { type: 'hard', amount: 'totalValue + 1' },
          { type: 'energy', amount: 2 },
        ],
      },
    ],
  },
};

async function cellCenter(page: Page, x: number, y: number) {
  const board = page.getByTestId('board');
  await expect(board).toHaveAttribute('data-cell-size', /^[1-9]\d*$/);
  const box = (await board.boundingBox())!;
  const d = await board.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  return {
    x: box.x + Number(d.originX) + (x + 0.5) * Number(d.cellSize),
    y: box.y + Number(d.originY) + (y + 0.5) * Number(d.cellSize),
  };
}

test('заказ сдаётся кнопкой, награды и награда за уровень выдаются', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-file').setInputFiles({
    name: 'orders.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.getByTestId('editor-status')).toContainText('ошибок нет');
  await page.getByRole('button', { name: 'Запустить прототип' }).click();

  const order = page.getByTestId('order-0');
  await expect(order).toContainText('Шишка');
  await expect(order).toContainText('0/1');
  const deliver = order.getByRole('button', { name: 'Сдать' });
  await expect(deliver).toBeDisabled();
  // Награды: хард-валюта totalValue + 1 = 2 ^ 1 + 1 = 3 и энергия 2.
  await expect(order).toContainText('💎 3');
  await expect(order).toContainText('⚡ 2');

  const gen = await cellCenter(page, 0, 0);
  await page.mouse.click(gen.x, gen.y);
  await expect(order).toContainText('1/1');
  await expect(deliver).toBeEnabled();
  await deliver.click();

  // 3 за заказ + 10 за уровень; энергия 10 − 1 + 2 = 11 (выше максимума разрешено).
  await expect(page.getByTestId('hard-value')).toHaveText('13');
  await expect(page.getByTestId('energy-value')).toHaveText('11 / 10');
  await expect(page.getByTestId('level')).toContainText('Уровень 2');
  await expect(page.getByTestId('level')).toContainText('заказы 0 / 3');
});
