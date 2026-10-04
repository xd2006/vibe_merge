import { describe, expect, it } from 'vitest';
import { GameConfigSchema, type GameConfigInput } from '@/config';
import { createEngine, type Command, type GameState, type Rules } from '..';
import { nextFloat, nextInt, seedRng, type RngState } from '../rng';
import { makeEngine } from '../test-utils';
import { reachableLevels, reachableNow } from '.';

const levels = (r: Map<string, Set<number>>, chain: string) => [...(r.get(chain) ?? [])].sort();

describe('reachableLevels', () => {
  const engine = makeEngine((c) => {
    c.chains[0]!.levels = [1, 2, 3, 4, 5, 6].map((n) => ({ name: `w${n}` }));
  });

  it('от источника — maxMergeDepth уровней вверх, не выше максимума и потолка', () => {
    const r = reachableLevels(engine.rules, {
      sources: [{ chain: 'wood', level: 2 }],
      existing: [],
    });
    expect(levels(r, 'wood')).toEqual([2, 3, 4, 5]);
    const capped = reachableLevels(
      engine.rules,
      { sources: [{ chain: 'wood', level: 2 }], existing: [] },
      { wood: 3 },
    );
    expect(levels(capped, 'wood')).toEqual([2, 3]);
    const top = reachableLevels(engine.rules, {
      sources: [{ chain: 'wood', level: 5 }],
      existing: [],
    });
    expect(levels(top, 'wood')).toEqual([5, 6]);
  });

  it('имеющиеся предметы доступны ровно своего уровня', () => {
    const r = reachableLevels(engine.rules, {
      sources: [],
      existing: [{ chain: 'wood', level: 6 }],
    });
    expect(levels(r, 'wood')).toEqual([6]);
  });

  it('источники из состояния: генераторы, замки после открытия, предметы', () => {
    const e = makeEngine((c) => {
      c.chains[0]!.levels = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ name: `w${n}` }));
      c.orders.reachability = { maxMergeDepth: 1 };
      c.board.layout = ['S..', '...', '..x'];
      c.board.legend.x = { item: 'wood', level: 8 };
      c.board.locks = [{ group: 'z', cells: [[1, 1]], content: { item: 'wood', level: 4 } }];
      c.levels = [
        { id: 1, ordersRequired: 1 },
        { id: 2, ordersRequired: 1, unlocks: ['z'] },
      ];
    });
    const s0 = e.initialState();
    // Лесопилка: ветка (1) → 1–2; брус-8 на доске; замок ещё запечатан.
    expect(levels(reachableNow(e.rules, s0), 'wood')).toEqual([1, 2, 8]);
    const s1 = e.apply(s0, { type: 'cheat', cheat: 'skipLevel' }).state;
    // Замок открыт для слияния: после открытия в клетке будет уровень 5 → 5–6.
    expect(levels(reachableNow(e.rules, s1), 'wood')).toEqual([1, 2, 5, 6, 8]);
  });
});

// ---------- Property-тест ----------

/** Независимая (наивная) проверка достижимости по правилу ТЗ — оракул для property-теста. */
function oracle(rules: Rules, s: GameState, chain: string, level: number): boolean {
  const cap = Math.min(
    rules.chains.get(chain)!.maxLevel,
    rules.levels[s.level.index]!.orderLevelCap[chain] ?? Infinity,
  );
  if (level > cap) return false;
  if (!rules.orders.reach.enabled) return true;
  const depth = rules.orders.reach.maxMergeDepth;
  const fromSource = (src: number) => src <= level && level <= src + depth;
  for (let i = 0; i < s.board.cells.length; i++) {
    const e = s.board.cells[i];
    const gate = s.board.gates[i];
    if (gate) {
      // Заблокированная клетка, открытая для слияния: источник уровня выше содержимого.
      const groupOpen = !gate.group || s.lockGroups[gate.group] === 'unlockable';
      const lockable = gate.locked && groupOpen && gate.requiredLevel === null && !gate.closed;
      if (lockable && e?.kind === 'item' && e.chain === chain && fromSource(e.level + 1))
        return true;
      continue;
    }
    if (e?.kind === 'generator') {
      const lvl = rules.generators.get(e.generator)!.levels[e.level - 1]!;
      if (lvl.produces.some((p) => p.weight > 0 && p.chain === chain && fromSource(p.level)))
        return true;
    }
    if (e?.kind === 'item' && !e.bubble && e.chain === chain && e.level === level) return true;
  }
  return s.storage.some((st) => st.kind === 'item' && st.chain === chain && st.level === level);
}

/** Случайный, но корректный конфиг: 1–3 цепочки, 1–2 генератора, случайные шаблоны и потолки. */
function randomConfig(r: RngState, seed: number): GameConfigInput {
  const chains = Array.from({ length: nextInt(r, 1, 3) }, (_, i) => ({
    id: `c${i}`,
    name: `Цепочка ${i}`,
    levels: Array.from({ length: nextInt(r, 3, 7) }, (_, l) => ({ name: `c${i}-${l + 1}` })),
  }));
  const anyItem = () => {
    const c = chains[nextInt(r, 0, chains.length - 1)]!;
    return { chain: c.id, level: nextInt(r, 1, Math.min(3, c.levels.length)) };
  };
  const generators = Array.from({ length: nextInt(r, 1, 2) }, (_, i) => ({
    id: `g${i}`,
    name: `Генератор ${i}`,
    levels: [{ energyCost: 1, produces: [{ ...anyItem(), weight: 1 }] }],
  }));
  const templates = Array.from({ length: nextInt(r, 1, 4) }, (_, i) => {
    const c = chains[nextInt(r, 0, chains.length - 1)]!;
    const lo = nextInt(r, 1, c.levels.length);
    return {
      id: `t${i}`,
      weight: 1,
      boardLevels: [1, 9] as [number, number],
      maxRequirements: 2,
      requirements: [
        { chain: c.id, levelRange: [lo, nextInt(r, lo, c.levels.length)] as [number, number] },
      ],
    };
  });
  return {
    meta: { name: 'random', seed },
    energy: { max: 1000, start: 1000, regen: { amount: 1, intervalSec: 1 } },
    chains,
    generators,
    board: {
      width: 5,
      height: 5,
      legend: { '.': null, A: { generator: 'g0', level: 1 } },
      layout: ['A....', '.....', '.....', '.....', '.....'],
      locks: [{ group: 'z', cells: [[4, 4]], content: { item: anyItem().chain, level: 1 } }],
    },
    levels: [
      {
        id: 1,
        ordersRequired: 2,
        orderLevelCap: nextFloat(r) < 0.5 ? { c0: nextInt(r, 1, 3) } : {},
      },
      { id: 2, ordersRequired: 3, unlocks: ['z'] },
      { id: 3, ordersRequired: 100 },
    ],
    orders: {
      slots: 2,
      reachability: { maxMergeDepth: nextInt(r, 0, 3), onNoValidTemplate: 'skipSlot' },
      templates,
    },
    itemActions: [{ match: '*', pickUp: true, delete: true }],
  };
}

describe('property: заказы не требуют недостижимых предметов', () => {
  it('на 60 случайных конфигах и партиях', () => {
    let checkedOrders = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = seedRng(seed, 'property');
      const engine = createEngine(GameConfigSchema.parse(randomConfig(r, seed)));
      const { width, height } = engine.rules.board;
      let state = engine.initialState();
      const check = (s: GameState, orderIds: number[]) => {
        for (const slot of s.orders.slots) {
          if (!slot.order || !orderIds.includes(slot.order.id)) continue;
          for (const req of slot.order.requirements) {
            expect(
              oracle(engine.rules, s, req.chain, req.level),
              JSON.stringify({ seed, req }),
            ).toBe(true);
            checkedOrders++;
          }
        }
      };
      check(
        state,
        state.orders.slots.flatMap((sl) => (sl.order ? [sl.order.id] : [])),
      );

      for (let step = 0; step < 300; step++) {
        const cell = () => ({ x: nextInt(r, 0, width - 1), y: nextInt(r, 0, height - 1) });
        const roll = nextInt(r, 0, 9);
        const command: Command =
          roll < 4
            ? { type: 'tapGenerator', at: { x: 0, y: 0 } }
            : roll < 7
              ? { type: 'move', from: cell(), to: cell() }
              : roll < 8
                ? { type: 'deliverOrder', slot: nextInt(r, 0, 1) }
                : roll < 9
                  ? { type: 'itemAction', at: cell(), action: 'delete' }
                  : { type: 'cheat', cheat: 'skipLevel' };
        const res = engine.apply(state, command);
        state = res.state;
        // Новые заказы проверяем по состоянию после команды: без пузырей источники
        // внутри команды после генерации заказа не меняются.
        const created = res.events.flatMap((e) => (e.type === 'order_created' ? [e.orderId] : []));
        check(state, created);
      }
    }
    expect(checkedOrders).toBeGreaterThan(200);
  });
});
