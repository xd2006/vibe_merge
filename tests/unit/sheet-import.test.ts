// Этап S6: импорт таблицы Spice merge в конфиг.
import { describe, expect, it } from 'vitest';
import { GameConfigSchema } from '@/config';
import { createEngine } from '@/core';
import { importSheet, type SheetBook } from '@/sheet';
import { validateConfig } from '@/validator';

/** Небольшая книга в формате выгрузки «Core Merge Config». */
function book(): SheetBook {
  return {
    Settings: [
      ['key', 'value'],
      ['access_level', 2],
      ['energy_max_capacity', 50],
      ['energy_refill_time', 60],
      ['energy_refill_step', 2],
      ['bonus_order_time_min', 300],
      ['bonus_order_time_max', 400],
      ['bonus_order_queue_min', 3],
      ['bonus_order_queue_max', 4],
      ['secret_flag', 1],
    ],
    Objects: [
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
      ['generator_OR_02', 'interactable', null, null, 1, false, 0],
      ['chain_А_01', 'simple', null, null, 5, true, 0],
      ['chain_А_02', 'simple', 'spice_rose', null, 9, false, 0.5],
      ['chain_А_03', 'simple', 'spice_anise', null, 3, 'TRUE', null],
      ['generator_Converter', 'interactable', null, null, 0, false, 0],
      ['chain_E_01', 'simple', null, null, 2, true, 0],
      ['chain_E_02', 'simple', 'crystal', null, null, false, null],
    ],
    Interactables: [
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
        '# Spawns After Used',
      ],
      [null, 'generator_OR_01', 5, 300, 50, 30, 'chain_A_01', 1, null, null],
      [null, 'generator_OR_02', 5, 300, 50, 0, 'chain_A_01', 2, null, null],
      ['ref', null, null, null, null, null, 'chain_A_02', 1, null, null],
      [null, null, null, null, null, null, null, null, null, 'item_x'],
      [null, 'generator_Converter', null, 0, 0, 0, 'chain_E_01', 2, 1, null],
    ],
    Chains: [
      ['chain_id', 'object_id', 'object_level'],
      ['generator_OR', 'generator_OR_01', 1],
      [null, 'generator_OR_02', 2],
      [null, null, null],
      ['chain_А', 'chain_А_01', 1],
      [null, 'chain_А_02', 2],
      [null, 'chain_А_03', 3],
      [null, null, null],
      ['generator_Conver', 'generator_Converter', 1],
      [null, null, null],
      ['chain_E', 'chain_E_01', 1],
      [null, 'chain_E_02', 2],
    ],
    'Spice Chain Order': [
      ['spice', 'energy_reward', '#merge_price'],
      ['spice_rose', 1, 4],
      ['spice_anise', 4, 10],
    ],
    'Orders Allocation': [
      ['player_level', 'easy_order', 'medium_order'],
      [2, 2, null],
      [3, 1, 1],
    ],
    'Orders Difficulty': [
      ['order_dffculty', 'min', 'max'],
      ['easy', 8, 12],
      ['medium', 13, 30],
    ],
    'Orders Rewards': [
      ['weight', 'order_type', 'object_id'],
      [80, 'easy', 'object_E1'],
      [20, 'easy', 'object_E2'],
      [50, 'medium', 'object_E1'],
    ],
    'Bonus Order': [
      ['bonus_order_type', 'min_price', 'max_price'],
      ['regular', 20, 30],
    ],
    ' Bonus Order Reward': [
      ['weight_reward', 'bounus_order_type', 'item_name_1', 'item_value_1'],
      [50, 'regular', 'box1', 1],
      [50, 'regular', 'box1', 1],
      [30, 'regular', 'GameCrystal', 100],
      [20, 'regular', 'MergeEnergy', 5],
    ],
    Field: [
      ['x_coordinate', 'y_coordinate', '#xy', 'object_id', 'locked', 'closed', 'required_level'],
      [1, 1, '1,1', 'chain_А_01', true, null, 3],
      [2, 1, '2,1', 'chain_А_03', true, true, null],
      [3, 1, '3,1', null, true, null, null],
      [1, 2, '1,2', 'generator_OR_01', null, null, null],
      [2, 2, '2,2', null, null, null, null],
      [3, 2, '3,2', 'chain_A_01', null, true, null],
    ],
    Bubbles: [
      ['key', 'value'],
      ['max_bubbles_on_board', 3],
      ['min_pass_lvl_for_bubbles_to_drop', 2],
      ['bubble_time_to_disappear', 30],
    ],
    '#Data': [
      ['object_id', 'text'],
      ['generator_OR_01', 'генератор специй'],
      ['chain_А_01', 'специя'],
    ],
    '#Rewards': [
      ['item_type', 'item_name', '# comment'],
      ['crystal', 'GameCrystal', null],
      ['box', 'box1', 'Простой'],
      ['box', 'box2', 'Розовый'],
      ['merge_energy', 'MergeEnergy', 'Мерж энергия'],
    ],
    '#Field': [['служебный']],
    Notes: [['что-то своё']],
  };
}

const messages = (r: ReturnType<typeof importSheet>, level: string) =>
  r.report.filter((e) => e.level === level).map((e) => e.message);

describe('импорт таблицы', () => {
  const result = importSheet(book());
  const c = result.config;

  it('результат проходит валидатор без ошибок и запускается', () => {
    const errors = validateConfig(c).issues.filter((i) => i.level === 'error');
    expect(errors).toEqual([]);
    expect(() => createEngine(GameConfigSchema.parse(c)).initialState()).not.toThrow();
  });

  it('цепочки: кириллица → латиница, специи, призы, слияние в конвертер', () => {
    expect(c.chains.map((ch) => ch.id)).toEqual(['chain_a', 'chain_e']);
    const a = c.chains[0]!;
    expect(a.name).toBe('Специя A');
    expect(a.levels).toEqual([
      { name: 'A1', deletable: true, baseCost: 5 },
      {
        name: 'Роза',
        deletable: false,
        baseCost: 9,
        bubbleProbability: 0.5,
        collect: 'storage',
        value: 4,
      },
      { name: 'Анис', deletable: true, baseCost: 3, collect: 'storage', value: 10 },
    ]);
    expect(a.mergesInto).toBeUndefined();
    // Призовая цепочка короче 5 уровней — собирать нечего; с prizeCollect от 2-го уровня — кристаллы.
    expect(c.chains[1]!.levels[1]!.collect).toBeUndefined();
    const short = importSheet(book(), {
      prizeCollect: { 2: 3 },
      mergesInto: { chain_A: 'generator_Converter' },
    });
    expect(short.config.chains[1]!.levels[1]!.collect).toEqual([
      { type: 'resource', resource: 'crystal', amount: 3 },
    ]);
    expect(short.config.chains[0]!.mergesInto).toEqual({
      generator: 'generator_converter',
      level: 1,
    });
    expect(messages(result, 'imported').join()).toContain('chain_А_01');
  });

  it('генераторы: строки-продолжения, мешок, кулдаун, uses', () => {
    const [or, conv] = c.generators;
    expect(or!.id).toBe('generator_or');
    expect(or!.name).toBe('Генератор специй');
    expect(or!.levels[1]).toEqual({
      name: 'OR2',
      energyCost: 1,
      cooldown: { cycles: 5, seconds: 300, skipCost: 50, freeSkipSec: 0 },
      deletable: false,
      produces: [
        { chain: 'chain_a', level: 1, count: 2 },
        { chain: 'chain_a', level: 2, count: 1 },
      ],
    });
    expect(conv!.levels[0]).toMatchObject({
      uses: 1,
      produces: [{ chain: 'chain_e', level: 1, count: 2 }],
    });
    expect(conv!.levels[0]!.cooldown).toBeUndefined();
    expect(messages(result, 'unsupported').join()).toContain('item_x');
  });

  it('поле: 1-база → 0-база, легенда, состояния клеток', () => {
    expect(c.board.width).toBe(3);
    expect(c.board.height).toBe(2);
    expect(c.board.layout).toEqual(['ab.', 'c.a']);
    expect(c.board.legend).toEqual({
      '.': null,
      a: { item: 'chain_a', level: 1 },
      b: { item: 'chain_a', level: 3 },
      c: { generator: 'generator_or', level: 1 },
    });
    // (3, 1) пустая — блокировка снята; (2, 1) — объект последнего уровня — блокировка снята.
    expect(c.board.cells).toEqual([
      { cell: [0, 0], requiredLevel: 3, locked: true },
      { cell: [1, 0], closed: true },
      { cell: [2, 1], closed: true },
    ]);
    const warnings = messages(result, 'warning').join('\n');
    expect(warnings).toContain('(3, 1)');
    expect(warnings).toContain('(2, 1)');
  });

  it('уровни: старт с access_level, генераторы по очереди', () => {
    expect(c.levels.map((l) => l.id)).toEqual([2, 3, 4]);
    expect(c.levels.map((l) => l.ordersRequired)).toEqual([10, 10, 10]);
    expect(c.levels.map((l) => l.reward)).toEqual([
      [{ type: 'generator', generator: 'generator_or', level: 1 }],
      [{ type: 'generator', generator: 'generator_or', level: 2 }],
      [],
    ]);
    expect(c.energy).toEqual({ max: 50, start: 100, regen: { amount: 2, intervalSec: 60 } });
  });

  it('заказы по сложности: категории, распределение, награды', () => {
    expect(c.orders.mode).toBe('difficulty');
    expect(c.orders.difficulty).toEqual({
      categories: [
        {
          id: 'easy',
          name: 'Лёгкий',
          value: [8, 12],
          rewards: [
            { weight: 80, reward: { type: 'item', chain: 'chain_e', level: 1 } },
            { weight: 20, reward: { type: 'item', chain: 'chain_e', level: 2 } },
          ],
        },
        {
          id: 'medium',
          name: 'Средний',
          value: [13, 30],
          rewards: [{ weight: 50, reward: { type: 'item', chain: 'chain_e', level: 1 } }],
        },
      ],
      itemsPerOrder: [2, 3],
      allocation: [
        { fromLevel: 2, slots: { easy: 2, medium: 0 } },
        { fromLevel: 3, slots: { easy: 1, medium: 1 } },
      ],
    });
  });

  it('бонусный заказ: настройки, награды через #Rewards, повтор строки', () => {
    expect(c.orders.bonus).toEqual({
      afterOrders: [3, 4],
      durationSec: [300, 400],
      itemsPerOrder: [2, 3],
      tiers: [
        {
          id: 'regular',
          name: 'Обычный',
          weight: 1,
          value: [20, 30],
          rewards: [
            { weight: 50, reward: { type: 'resource', resource: 'box1', amount: 1 } },
            { weight: 50, reward: { type: 'resource', resource: 'box1', amount: 1 } },
            { weight: 30, reward: { type: 'resource', resource: 'crystal', amount: 100 } },
            { weight: 20, reward: { type: 'energy', amount: 5 } },
          ],
        },
      ],
    });
    expect(c.currencies!.resources).toEqual([
      { id: 'box1', name: 'box1 — Простой' },
      { id: 'crystal', name: 'Кристаллы' },
    ]);
    expect(messages(result, 'warning').join()).toContain('Bonus Order Reward');
  });

  it('пузыри, склад, отчёт о неподдержанном', () => {
    expect(c.bubbles).toEqual({
      spawnRules: [{ source: 'merge', lifetimeSec: 30 }],
      maxOnBoard: 3,
      minLevel: 2,
      movable: true,
      popCost: { formula: 'baseCost' },
    });
    expect(c.storage).toEqual({ enabled: true, returnToBoard: false });
    const unsupported = messages(result, 'unsupported').join('\n');
    expect(unsupported).toContain('#Data, #Rewards, #Field');
    expect(unsupported).toContain('«Notes»');
    expect(unsupported).toContain('secret_flag');
    expect(unsupported).toContain('energy_reward');
  });
});
