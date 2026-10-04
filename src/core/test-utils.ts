// Общие заготовки для тестов ядра.
import { produce } from 'immer';
import { GameConfigSchema, type GameConfigInput } from '@/config';
import { createEngine } from './engine';
import { cellState, entityAt, indexOf } from './board';
import type { Command, GameState, Order } from './types';

/** Минимальный корректный конфиг: доска 3×3, лесопилка в левом верхнем углу. */
export function baseConfig(): GameConfigInput {
  return {
    meta: { name: 'test', seed: 1 },
    energy: { max: 10, start: 10, regen: { amount: 1, intervalSec: 10 } },
    chains: [
      { id: 'wood', name: 'Дерево', levels: [{ name: 'w1' }, { name: 'w2' }, { name: 'w3' }] },
    ],
    generators: [
      {
        id: 'saw',
        name: 'Лесопилка',
        levels: [
          { energyCost: 1, produces: [{ chain: 'wood', level: 1, weight: 1 }] },
          { energyCost: 2, produces: [{ chain: 'wood', level: 2, weight: 1 }] },
        ],
      },
    ],
    board: {
      width: 3,
      height: 3,
      legend: {
        '.': null,
        S: { generator: 'saw', level: 1 },
        w: { item: 'wood', level: 1 },
        W: { item: 'wood', level: 2 },
        X: { item: 'wood', level: 3 },
      },
      layout: ['S..', '...', '...'],
    },
    levels: [{ id: 1, ordersRequired: 1 }],
    orders: {
      slots: 1,
      templates: [
        {
          id: 't',
          weight: 1,
          boardLevels: [1, 1],
          maxRequirements: 1,
          requirements: [{ chain: 'wood', level: 1 }],
        },
      ],
    },
  };
}

export function makeEngine(patch?: (c: GameConfigInput) => void) {
  const input = baseConfig();
  patch?.(input);
  return createEngine(GameConfigSchema.parse(input));
}

/** Применяет команды подряд; падает, если какая-то отклонена (кроме разрешённых через `allowReject`). */
export function run(engine: ReturnType<typeof makeEngine>, state: GameState, commands: Command[]) {
  const events = [];
  for (const c of commands) {
    const r = engine.apply(state, c);
    if (r.rejected) throw new Error(`Команда ${JSON.stringify(c)} отклонена: ${r.rejected}`);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/**
 * Короткая запись содержимого клетки для проверок: `wood:2`, `saw:1`, `.`; заблокированная
 * клетка — `lock:wood:1`, закрытая по уровню или «песком» — `closed:wood:1` (`closed:.` — пустая).
 */
export function at(state: GameState, x: number, y: number): string {
  const e = entityAt(state.board, { x, y });
  const kind = cellState(state, indexOf(state.board, { x, y })).kind;
  const prefix = kind === 'locked' || kind === 'group' ? 'lock:' : kind === 'open' ? '' : 'closed:';
  if (!e) return prefix + '.';
  if (e.kind === 'item') return `${prefix}${e.bubble ? 'bubble:' : ''}${e.chain}:${e.level}`;
  return `${prefix}${e.generator}:${e.level}`;
}

// ---------- Spice merge: заказы по сложности и бонусный заказ ----------

/** Специи 4 / 10 / 30, призовая цепочка, три уровня, три категории. */
export function spiceConfig(c: GameConfigInput): void {
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
/** Кладёт на свободные открытые клетки предметы заказа. */
export function placeItems(s: GameState, order: Order): GameState {
  return produce(s, (d) => {
    for (const r of order.requirements) {
      for (let k = 0; k < r.count; k++) {
        const i = d.board.cells.findIndex((c, idx) => c === null && !d.board.gates[idx]);
        d.board.cells[i] = { uid: d.nextUid++, kind: 'item', chain: r.chain, level: r.level };
      }
    }
  });
}

/** Кладёт на поле предметы заказа слота и сдаёт его. */
export function fulfil(e: ReturnType<typeof makeEngine>, s: GameState, slot: number): GameState {
  const filled = placeItems(s, s.orders.slots[slot]!.order!);
  return run(e, filled, [{ type: 'deliverOrder', slot }]).state;
}
