// Этап S4 (Spice merge): заказы по сложности — сумма ценности специй в диапазоне категории,
// слоты категорий по уровню, награда по весам.
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { GameConfigInput } from '@/config';
import { validateConfig } from '@/validator';
import { isReachable, reachableNow } from '../reach';
import { itemValue } from '../rules';
import { baseConfig, makeEngine, run } from '../test-utils';
import type { GameState } from '../types';

type Engine = ReturnType<typeof makeEngine>;

/** Специи 4 / 10 / 30, призовая цепочка, три уровня, три категории. */
function spiceConfig(c: GameConfigInput): void {
  c.chains = [
    {
      id: 'spice',
      name: 'Специи',
      levels: [
        { name: 'Роза', collect: 'storage', value: 4 },
        { name: 'Анис', collect: 'storage', value: 10 },
        { name: 'Мускат', collect: 'storage', value: 30 },
        { name: 'Пряность' },
      ],
    },
    { id: 'prize', name: 'Приз', levels: [{ name: 'p1' }, { name: 'p2' }] },
  ];
  c.generators = [
    {
      id: 'saw',
      name: 'Сад',
      levels: [{ energyCost: 1, produces: [{ chain: 'spice', level: 1, weight: 1 }] }],
    },
  ];
  c.board = {
    width: 4,
    height: 4,
    legend: { '.': null, S: { generator: 'saw', level: 1 } },
    layout: ['S...', '....', '....', '....'],
  };
  c.levels = [
    { id: 1, ordersRequired: 1 },
    { id: 2, ordersRequired: 1 },
    { id: 3, ordersRequired: 5 },
  ];
  c.orders = {
    mode: 'difficulty',
    difficulty: {
      categories: [
        {
          id: 'easy',
          name: 'Лёгкий',
          value: [8, 20],
          rewards: [
            { weight: 3, reward: { type: 'item', chain: 'prize', level: 1 } },
            { weight: 1, reward: { type: 'item', chain: 'prize', level: 2 } },
          ],
        },
        { id: 'medium', name: 'Средний', value: [21, 40] },
        { id: 'hard', name: 'Сложный', value: [41, 90] },
      ],
      allocation: [
        { fromLevel: 1, slots: { easy: 2, medium: 1 } },
        { fromLevel: 2, slots: { easy: 1, medium: 2, hard: 1 } },
      ],
    },
  };
}
const engine = (patch?: (c: GameConfigInput) => void) =>
  makeEngine((c) => {
    spiceConfig(c);
    patch?.(c);
  });

const categories = (s: GameState) => s.orders.slots.map((sl) => sl.category);
const ranges: Record<string, [number, number]> = {
  easy: [8, 20],
  medium: [21, 40],
  hard: [41, 90],
};

/** Все заказы на доске в своём диапазоне, из 2–3 достижимых специй. */
function expectValidOrders(e: Engine, s: GameState) {
  const reach = reachableNow(e.rules, s);
  for (const slot of s.orders.slots) {
    const o = slot.order;
    if (!o) continue;
    const [min, max] = ranges[slot.category!]!;
    expect(o.template).toBe(slot.category);
    expect(o.totalValue).toBeGreaterThanOrEqual(min);
    expect(o.totalValue).toBeLessThanOrEqual(max);
    const sum = o.requirements.reduce(
      (a, r) => a + itemValue(e.rules, r.chain, r.level) * r.count,
      0,
    );
    expect(sum).toBe(o.totalValue);
    const n = o.requirements.reduce((a, r) => a + r.count, 0);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(3);
    for (const r of o.requirements) {
      expect(r.chain).toBe('spice');
      expect(r.level).toBeLessThanOrEqual(3);
      expect(isReachable(reach, r.chain, r.level)).toBe(true);
    }
  }
}

/** Кладёт на свободные клетки предметы заказа слота и сдаёт его. */
function fulfil(e: Engine, s: GameState, slot: number): GameState {
  const order = s.orders.slots[slot]!.order!;
  const filled = produce(s, (d) => {
    for (const r of order.requirements) {
      for (let k = 0; k < r.count; k++) {
        const i = d.board.cells.findIndex((c, idx) => c === null && !d.board.gates[idx]);
        d.board.cells[i] = { uid: d.nextUid++, kind: 'item', chain: r.chain, level: r.level };
      }
    }
  });
  return run(e, filled, [{ type: 'deliverOrder', slot }]).state;
}

describe('заказы по сложности', () => {
  it('слоты по распределению уровня, заказы в диапазоне категории', () => {
    const e = engine();
    const s = e.initialState();
    expect(categories(s)).toEqual(['easy', 'easy', 'medium']);
    expect(s.orders.slots.every((sl) => sl.order)).toBe(true);
    expectValidOrders(e, s);
  });

  it('свойство: на разных seed, глубине слияния и уровне заказы валидны', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const e = engine((c) => {
        c.meta.seed = seed;
        c.orders.reachability = { maxMergeDepth: seed % 4 };
      });
      let s = e.initialState();
      expectValidOrders(e, s);
      for (let step = 0; step < 4; step++) {
        const filled = s.orders.slots.findIndex((sl) => sl.order);
        if (filled < 0) break;
        s = fulfil(e, s, filled);
        expectValidOrders(e, s);
      }
    }
  });

  it('недостижимая категория — слот ждёт; при росте достижимости заполняется', () => {
    // Глубина 0: достижима только роза (4) — средний заказ (21–40) из 2–3 роз не собрать.
    const e = engine((c) => (c.orders.reachability = { maxMergeDepth: 0 }));
    const s = e.initialState();
    expect(s.orders.slots[2]).toMatchObject({ category: 'medium', order: null, pending: true });
    // Мускат на доске — источник: средний заказ теперь собирается.
    const withMuskat = produce(s, (d) => {
      d.board.cells[5] = { uid: d.nextUid++, kind: 'item', chain: 'spice', level: 3 };
    });
    const next = run(e, withMuskat, [{ type: 'tick', dtMs: 1 }]).state;
    expect(next.orders.slots[2]!.order).not.toBeNull();
    expectValidOrders(e, next);
  });

  it('при переходе на уровень слоты перераспределяются, лишний убирается после сдачи', () => {
    const e = engine();
    // Сдаём лёгкий заказ: уровень 2 — лёгких 1, средних 2, сложный 1.
    const s = fulfil(e, e.initialState(), 0);
    expect(s.level.index).toBe(1);
    // Сданный лёгкий слот убран, второй лёгкий остаётся; добавлены средний и сложный.
    expect(categories(s)).toEqual(['easy', 'medium', 'medium', 'hard']);
    expect(s.orders.slots.every((sl) => sl.order)).toBe(true);
    expectValidOrders(e, s);
  });

  it('лишний слот с заказом остаётся до сдачи', () => {
    const e = engine();
    const s = run(e, e.initialState(), [{ type: 'cheat', cheat: 'skipLevel' }]).state;
    // Оба лёгких слота с заказами: лишний ждёт сдачи.
    expect(categories(s)).toEqual(['easy', 'easy', 'medium', 'medium', 'hard']);
    const after = fulfil(e, s, 1);
    expect(categories(after)).toEqual(['easy', 'medium', 'medium', 'hard']);
  });

  it('награда — по весам категории, предмет выпадает на поле', () => {
    let first = 0;
    const n = 400;
    for (let seed = 1; seed <= n; seed++) {
      const e = engine((c) => (c.meta.seed = seed));
      const reward = e.initialState().orders.slots[0]!.order!.rewards;
      expect(reward).toHaveLength(1);
      const r = reward[0]!;
      if (r.type === 'item' && r.level === 1) first++;
    }
    // Вес 3 : 1 — около 75 %.
    expect(first / n).toBeGreaterThan(0.68);
    expect(first / n).toBeLessThan(0.82);

    const e = engine();
    const s = fulfil(e, e.initialState(), 0);
    expect(s.board.cells.some((c) => c?.kind === 'item' && c.chain === 'prize')).toBe(true);
    // У среднего заказа наград нет.
    expect(s.orders.slots.find((sl) => sl.category === 'medium')!.order!.rewards).toEqual([]);
  });

  it('ценность уровня (`value`) заменяет формулу цепочки', () => {
    const e = engine();
    expect([1, 2, 3, 4].map((l) => itemValue(e.rules, 'spice', l))).toEqual([4, 10, 30, 16]);
  });
});

describe('валидатор: заказы по сложности', () => {
  const issuesOf = (patch: (c: GameConfigInput) => void) => {
    const c = baseConfig();
    spiceConfig(c);
    patch(c);
    return validateConfig(c).issues.map((i) => `${i.level}:${i.code}@${i.path}`);
  };

  it('корректный конфиг проходит без замечаний', () => {
    expect(issuesOf(() => {})).toEqual([]);
  });

  it('нет блока, неизвестная категория, нет специй', () => {
    expect(issuesOf((c) => delete c.orders.difficulty)).toContain(
      'error:noDifficulty@orders.difficulty',
    );
    expect(
      issuesOf((c) => (c.orders.difficulty!.allocation[0]!.slots = { easy: 1, super: 1 })),
    ).toContain('error:unknownCategory@orders.difficulty.allocation[0].slots.super');
    expect(issuesOf((c) => c.chains[0]!.levels.forEach((l) => delete l.collect))).toContain(
      'error:noSpices@orders.difficulty',
    );
  });

  it('режим шаблонов без слотов и шаблонов', () => {
    const issues = issuesOf((c) => (c.orders = { mode: 'templates' }));
    expect(issues).toContain('error:ordersSlots@orders.slots');
    expect(issues).toContain('error:noTemplates@orders.templates');
  });

  it('категорию не собрать из достижимых специй — предупреждение по уровню', () => {
    expect(issuesOf((c) => (c.orders.reachability = { maxMergeDepth: 0 }))).toEqual([
      'warning:categoryUnreachable@levels[0]',
      'warning:categoryUnreachable@levels[1]',
      'warning:categoryUnreachable@levels[1]',
      'warning:categoryUnreachable@levels[2]',
      'warning:categoryUnreachable@levels[2]',
    ]);
  });
});
