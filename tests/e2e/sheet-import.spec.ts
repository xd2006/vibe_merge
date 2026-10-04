import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';

/** Маленькая книга в формате выгрузки «Core Merge Config». */
async function workbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const add = (name: string, rows: (string | number | boolean | null)[][]) =>
    wb.addWorksheet(name).addRows(rows);
  add('Settings', [
    ['key', 'value'],
    ['access_level', 1],
    ['energy_max_capacity', 100],
    ['energy_refill_time', 120],
    ['energy_refill_step', 1],
  ]);
  add('Objects', [
    [
      'object_id',
      'object_type',
      null,
      'object_icon',
      'base_cost',
      'deletable',
      'bubble_probability',
    ],
    ['generator_OR_01', 'interactable', null, null, 0, false, 0],
    ['chain_A_01', 'simple', null, null, 5, true, 0],
    ['chain_A_02', 'simple', 'spice_rose', null, 9, false, 0],
  ]);
  add('Interactables', [
    [
      '# Object ID',
      'object_id',
      'cooldown_cycle',
      'reload_time',
      'skip_cost',
      'free_skip_time',
      'produced_objects',
      'count_per_cycle',
      'uses',
    ],
    [null, 'generator_OR_01', 10, 300, 50, 30, 'chain_A_01', 1, null],
  ]);
  add('Chains', [
    ['chain_id', 'object_id', 'object_level'],
    ['generator_OR', 'generator_OR_01', 1],
    [null, null, null],
    ['chain_A', 'chain_A_01', 1],
    [null, 'chain_A_02', 2],
  ]);
  add('Spice Chain Order', [
    ['spice', 'energy_reward', '#merge_price'],
    ['spice_rose', 1, 4],
  ]);
  add('Orders Allocation', [
    ['player_level', 'easy_order'],
    [1, 2],
  ]);
  add('Orders Difficulty', [
    ['order_dffculty', 'min', 'max'],
    ['easy', 8, 12],
  ]);
  add('Field', [
    ['x_coordinate', 'y_coordinate', '#xy', 'object_id', 'locked', 'closed', 'required_level'],
    [1, 1, '1,1', 'generator_OR_01', null, null, null],
    [2, 1, '2,1', 'chain_A_01', null, true, null],
    [1, 2, '1,2', null, null, null, null],
    [2, 2, '2,2', null, null, null, null],
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('импорт из таблицы: конфиг, отчёт, запуск прототипа', async ({ page }) => {
  await page.goto('/');
  // Замена текущего черновика подтверждается диалогом.
  page.on('dialog', (d) => void d.accept());
  await page.getByTestId('import-sheet').setInputFiles({
    name: 'Core Merge Config.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await workbook(),
  });
  const report = page.getByTestId('import-report');
  await expect(report).toContainText('Импортировано: цепочек 1, генераторов 1, поле 2×2');
  await expect(report).toContainText('По умолчанию');
  await expect(page.getByTestId('editor-status')).toContainText('ошибок нет');
  await page.getByRole('button', { name: 'Запустить прототип' }).click();
  await expect(page.getByTestId('order-0')).toContainText(/Лёгкий · (8|12)/);
  await expect(page.getByTestId('order-1')).toContainText('Роза');
});
