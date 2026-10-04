import { expect, test, type Page } from '@playwright/test';

/** Генератор-мешок с кулдауном после одного цикла, специя собирается на склад, приз — в кристаллы. */
const config = {
  meta: { name: 'Spice S1 e2e', seed: 3 },
  currencies: {
    hard: { name: 'Сапфиры', start: 20 },
    resources: [{ id: 'crystal', name: 'Кристаллы' }],
  },
  energy: { max: 10, start: 10, regen: { amount: 1, intervalSec: 60 } },
  chains: [
    {
      id: 'spice',
      name: 'Специи',
      levels: [
        { name: 'Роза', collect: 'storage' },
        { name: 'Кристалл', collect: [{ type: 'resource', resource: 'crystal', amount: 3 }] },
      ],
    },
  ],
  generators: [
    {
      id: 'gen',
      name: 'Генератор',
      levels: [
        {
          energyCost: 1,
          cooldown: { cycles: 1, seconds: 600, skipCost: 10 },
          produces: [{ chain: 'spice', level: 1, count: 1 }],
        },
      ],
    },
  ],
  board: {
    width: 3,
    height: 3,
    legend: { '.': null, G: { generator: 'gen', level: 1 }, K: { item: 'spice', level: 2 } },
    layout: ['G..', '...', '..K'],
  },
  levels: [{ id: 1, ordersRequired: 10 }],
  orders: {
    slots: 1,
    templates: [
      {
        id: 't',
        weight: 1,
        boardLevels: [1, 9],
        maxRequirements: 1,
        requirements: [{ chain: 'spice', level: 1 }],
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

type DebugHook = { cells(): Record<string, string> };
const boardCells = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vibeMerge: DebugHook }).__vibeMerge.cells());

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await cellCenter(page, ...from);
  const b = await cellCenter(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}

test('пузырь — копия результата слияния, его можно перетащить', async ({ page }) => {
  const bubbleConfig = {
    ...config,
    chains: [
      {
        id: 'spice',
        name: 'Специи',
        levels: [{ name: 'Роза' }, { name: 'Анис', bubbleProbability: 1 }],
      },
    ],
    board: {
      ...config.board,
      legend: { '.': null, G: { generator: 'gen', level: 1 }, r: { item: 'spice', level: 1 } },
      layout: ['rr.', '...', '..G'],
    },
    bubbles: { spawnRules: [{ source: 'merge', lifetimeSec: 60 }], movable: true },
  };
  await page.goto('/');
  await page.getByTestId('load-file').setInputFiles({
    name: 'bubble.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bubbleConfig)),
  });
  await expect(page.getByTestId('editor-status')).toContainText('ошибок нет');
  await page.getByRole('button', { name: 'Запустить прототип' }).click();

  await drag(page, [0, 0], [1, 0]);
  expect(await boardCells(page)).toMatchObject({ '1,0': 'spice:2', '0,0': 'bubble:spice:2' });
  await drag(page, [0, 0], [1, 1]);
  const cells = await boardCells(page);
  expect(cells['1,1']).toBe('bubble:spice:2');
  expect(cells['0,0']).toBeUndefined();
});

test('слияние в заблокированную клетку открывает её и расчищает «песок»', async ({ page }) => {
  const cellsConfig = {
    ...config,
    chains: [{ id: 'spice', name: 'Специи', levels: [{ name: 'Роза' }, { name: 'Анис' }] }],
    board: {
      ...config.board,
      legend: { '.': null, G: { generator: 'gen', level: 1 }, r: { item: 'spice', level: 1 } },
      layout: ['rrr', '...', '..G'],
      cells: [
        { cell: [1, 0], locked: true },
        { cell: [2, 0], closed: true },
        { cell: [1, 1], requiredLevel: 2 },
      ],
    },
    levels: [
      { id: 1, ordersRequired: 10 },
      { id: 2, ordersRequired: 10 },
    ],
  };
  await page.goto('/');
  await page.getByTestId('load-file').setInputFiles({
    name: 'cells.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(cellsConfig)),
  });
  await expect(page.getByTestId('editor-status')).toContainText('ошибок нет');
  await page.getByRole('button', { name: 'Запустить прототип' }).click();

  expect(await boardCells(page)).toMatchObject({ '1,0': 'lock:spice:1', '2,0': 'closed:spice:1' });
  const sand = await cellCenter(page, 2, 0);
  await page.mouse.click(sand.x, sand.y);
  await expect(page.getByTestId('selection')).toContainText('Расчистите объекты рядом');
  const level = await cellCenter(page, 1, 1);
  await page.mouse.click(level.x, level.y);
  await expect(page.getByTestId('selection')).toHaveCount(0);

  await drag(page, [0, 0], [1, 0]);
  expect(await boardCells(page)).toMatchObject({ '1,0': 'spice:2', '2,0': 'spice:1' });
});

test('заказы по сложности: плашка категории, награда по весам', async ({ page }) => {
  const difficultyConfig = {
    ...config,
    chains: [
      {
        id: 'spice',
        name: 'Специи',
        levels: [
          { name: 'Роза', collect: 'storage', value: 4 },
          { name: 'Анис', collect: 'storage', value: 10 },
        ],
      },
      { id: 'prize', name: 'Энергия', levels: [{ name: 'Искра' }] },
    ],
    board: {
      ...config.board,
      legend: { '.': null, G: { generator: 'gen', level: 1 } },
      layout: ['G..', '...', '...'],
    },
    orders: {
      mode: 'difficulty',
      difficulty: {
        categories: [
          {
            id: 'easy',
            name: 'Лёгкий',
            value: [8, 20],
            rewards: [{ weight: 1, reward: { type: 'item', chain: 'prize', level: 1 } }],
          },
        ],
        allocation: [{ fromLevel: 1, slots: { easy: 2 } }],
      },
    },
  };
  await page.goto('/');
  await page.getByTestId('load-file').setInputFiles({
    name: 'difficulty.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(difficultyConfig)),
  });
  await expect(page.getByTestId('editor-status')).toContainText('ошибок нет');
  await page.getByRole('button', { name: 'Запустить прототип' }).click();

  for (const i of [0, 1]) {
    await expect(page.getByTestId(`order-${i}`)).toContainText(/Лёгкий · \d+/);
    await expect(page.getByTestId(`order-${i}`)).toContainText('Искра');
  }
  await expect(page.getByTestId('order-2')).toHaveCount(0);
});

test('бонусный заказ: появляется после заказа, сдаётся, даёт награду', async ({ page }) => {
  const bonusConfig = {
    ...config,
    chains: [
      { id: 'spice', name: 'Специи', levels: [{ name: 'Роза', collect: 'storage', value: 4 }] },
    ],
    board: {
      ...config.board,
      legend: { '.': null, G: { generator: 'gen', level: 1 }, r: { item: 'spice', level: 1 } },
      layout: ['rrr', 'rrr', '..G'],
    },
    orders: {
      mode: 'difficulty',
      difficulty: {
        categories: [{ id: 'easy', name: 'Лёгкий', value: [8, 8] }],
        allocation: [{ fromLevel: 1, slots: { easy: 1 } }],
      },
      bonus: {
        afterOrders: [1, 1],
        durationSec: [600, 600],
        tiers: [
          {
            id: 'regular',
            name: 'Обычный',
            value: [8, 12],
            rewards: [{ weight: 1, reward: { type: 'resource', resource: 'crystal', amount: 7 } }],
          },
        ],
      },
    },
  };
  await page.goto('/');
  await page.getByTestId('load-file').setInputFiles({
    name: 'bonus.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bonusConfig)),
  });
  await expect(page.getByTestId('editor-status')).toContainText('ошибок нет');
  await page.getByRole('button', { name: 'Запустить прототип' }).click();

  await expect(page.getByTestId('bonus-order')).toHaveCount(0);
  await page.getByTestId('order-0').getByRole('button', { name: 'Сдать' }).click();
  const bonus = page.getByTestId('bonus-order');
  await expect(bonus).toContainText(/Бонус: Обычный · (10:00|9:\d\d)/);
  await bonus.getByRole('button', { name: 'Сдать' }).click();
  await expect(bonus).toHaveCount(0);
  await expect(page.getByTestId('resource-crystal')).toContainText('7');
});

test('кулдаун после цикла, пропуск за хард, сбор двойным тапом', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-file').setInputFiles({
    name: 'spice.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.getByTestId('editor-status')).toContainText('ошибок нет');
  await page.getByRole('button', { name: 'Запустить прототип' }).click();

  // Один тап — мешок пуст, цикл пройден, кулдаун.
  const gen = await cellCenter(page, 0, 0);
  await page.mouse.click(gen.x, gen.y);
  await expect(page.getByTestId('selection')).toContainText('Перезарядка');
  await page.getByRole('button', { name: 'Ускорить за 10 💎' }).click();
  await expect(page.getByTestId('hard-value')).toHaveText('10');
  await expect(page.getByTestId('selection')).not.toContainText('Перезарядка');

  // Роза появилась в (1, 0); двойной тап — на склад.
  expect((await boardCells(page))['1,0']).toBe('spice:1');
  const rose = await cellCenter(page, 1, 0);
  await page.mouse.dblclick(rose.x, rose.y);
  await expect(page.getByTestId('open-storage')).toHaveText('Склад · 1');
  expect((await boardCells(page))['1,0']).toBeUndefined();

  // Призовой предмет — кнопкой в панели — даёт кристаллы.
  const prize = await cellCenter(page, 2, 2);
  await page.mouse.click(prize.x, prize.y);
  await page.getByRole('button', { name: 'Забрать: Кристаллы 3' }).click();
  await expect(page.getByTestId('resource-crystal')).toContainText('3');
});
