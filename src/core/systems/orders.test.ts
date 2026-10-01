import { describe, expect, it } from 'vitest';
import type { GameConfigInput } from '@/config';
import { at, makeEngine, run } from '../test-utils';

type Tpl = GameConfigInput['orders']['templates'][number];
const tpl = (over: Partial<Tpl> = {}): Tpl => ({
  id: 't',
  weight: 1,
  boardLevels: [1, 99],
  maxRequirements: 3,
  requirements: [{ chain: 'wood', level: 1 }],
  ...over,
});
const deliver = (slot = 0) => ({ type: 'deliverOrder' as const, slot });
const tick = (dtMs: number) => ({ type: 'tick' as const, dtMs });

describe('генерация заказов', () => {
  it('в начале партии все слоты заполнены', () => {
    const e = makeEngine((c) => {
      c.orders.slots = 3;
    });
    const s = e.initialState();
    expect(s.orders.slots.map((sl) => sl.order?.requirements)).toEqual([
      [{ chain: 'wood', level: 1, count: 1 }],
      [{ chain: 'wood', level: 1, count: 1 }],
      [{ chain: 'wood', level: 1, count: 1 }],
    ]);
    expect(s.orders.slots.map((sl) => sl.order!.id)).toEqual([1, 2, 3]);
  });

  it('шаблоны фильтруются по уровню доски', () => {
    const e = makeEngine((c) => {
      c.orders.templates = [tpl({ id: 'late', boardLevels: [2, 3] })];
    });
    expect(e.initialState().orders.slots[0]).toMatchObject({ order: null, pending: true });
  });

  it('недостижимые уровни исключаются; потолок orderLevelCap ограничивает уровень', () => {
    // Лесопилка даёт ветку (1); при глубине слияния 1 достижимы уровни 1–2.
    const e = makeEngine((c) => {
      c.orders.reachability = { maxMergeDepth: 1 };
      c.orders.templates = [
        tpl({ requirements: [{ chain: 'wood', levelRange: [1, 3], count: 1 }] }),
      ];
    });
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = makeEngine((c) => {
        c.meta.seed = seed;
        c.orders.reachability = { maxMergeDepth: 1 };
        c.orders.templates = [
          tpl({ requirements: [{ chain: 'wood', levelRange: [1, 3], count: 1 }] }),
        ];
      }).initialState();
      seen.add(s.orders.slots[0]!.order!.requirements[0]!.level);
    }
    expect([...seen].sort()).toEqual([1, 2]);
    expect(e.initialState().orders.slots[0]!.order).not.toBeNull();

    const capped = makeEngine((c) => {
      c.levels = [{ id: 1, ordersRequired: 1, orderLevelCap: { wood: 1 } }];
      c.orders.templates = [tpl({ requirements: [{ chain: 'wood', levelRange: [1, 3] }] })];
    });
    expect(capped.initialState().orders.slots[0]!.order!.requirements[0]!.level).toBe(1);
  });

  it('skipSlot: слот ждёт, пока предмет не станет достижимым', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['SWW', '...', '...'];
      c.orders.reachability = { maxMergeDepth: 0 };
      c.orders.templates = [tpl({ requirements: [{ chain: 'wood', level: 3 }] })];
    });
    const s0 = e.initialState();
    expect(s0.orders.slots[0]!.pending).toBe(true);
    // Слияние двух досок даёт брус — он уже на доске, значит доступен.
    const { state, events } = run(e, s0, [
      { type: 'move', from: { x: 1, y: 0 }, to: { x: 2, y: 0 } },
    ]);
    expect(state.orders.slots[0]).toMatchObject({ pending: false, order: { template: 't' } });
    expect(events.map((x) => x.type)).toEqual(['merge', 'order_created']);
  });

  it('выключенная проверка достижимости пропускает любые уровни', () => {
    const e = makeEngine((c) => {
      c.orders.reachability = { mode: 'off', maxMergeDepth: 0 };
      c.orders.templates = [tpl({ requirements: [{ chain: 'wood', level: 3 }] })];
    });
    expect(e.initialState().orders.slots[0]!.order).not.toBeNull();
  });

  it('fallbackTemplate и error', () => {
    const fb = makeEngine((c) => {
      c.orders.templates = [
        tpl({ id: 'late', boardLevels: [5, 5] }),
        tpl({ id: 'fb', boardLevels: [7, 7] }),
      ];
      c.orders.fallbackTemplate = 'fb';
      c.orders.reachability = { onNoValidTemplate: 'fallbackTemplate' };
    });
    expect(fb.initialState().orders.slots[0]!.order!.template).toBe('fb');

    const err = makeEngine((c) => {
      c.orders.templates = [tpl({ boardLevels: [5, 5] })];
      c.orders.reachability = { onNoValidTemplate: 'error' };
    });
    const s = err.initialState();
    expect(s.orders.stopped).toBe(true);
    expect(s.orders.slots[0]).toMatchObject({ order: null, pending: false });
  });

  it('требований не больше maxRequirements; одинаковые складываются', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = makeEngine((c) => {
        c.meta.seed = seed;
        c.orders.templates = [
          tpl({
            maxRequirements: 2,
            requirements: [
              { chain: 'wood', level: 1, count: [1, 2] },
              { chain: 'wood', level: 2 },
              { chain: 'wood', level: 1 },
            ],
          }),
        ];
      }).initialState();
      const reqs = s.orders.slots[0]!.order!.requirements;
      expect(reqs.length).toBeLessThanOrEqual(2);
      expect(new Set(reqs.map((r) => r.level)).size).toBe(reqs.length);
    }
  });

  it('награды считаются по формулам от totalValue', () => {
    const e = makeEngine((c) => {
      c.orders.templates = [
        tpl({
          requirements: [{ chain: 'wood', level: 2, count: 2 }],
          rewards: [
            { type: 'energy', amount: 'ceil(totalValue * 0.5)' },
            { type: 'hard', amount: 'totalValue + boardLevel' },
          ],
        }),
      ];
    });
    // Ценность доски 2 ^ 2 = 4, требуется 2 → totalValue = 8.
    expect(e.initialState().orders.slots[0]!.order).toMatchObject({
      totalValue: 8,
      rewards: [
        { type: 'energy', amount: 4 },
        { type: 'hard', amount: 9 },
      ],
    });
  });
});

describe('сдача заказа', () => {
  const engine = makeEngine((c) => {
    c.board.layout = ['Sww', 'w..', '...'];
    c.energy = { max: 10, start: 10, regen: { amount: 1, intervalSec: 60 } };
    c.orders.templates = [
      tpl({
        requirements: [{ chain: 'wood', level: 1, count: 2 }],
        rewards: [
          { type: 'energy', amount: 3 },
          { type: 'hard', amount: 2 },
          { type: 'item', chain: 'wood', level: 3, count: 1 },
        ],
      }),
    ];
    c.orders.refillDelaySec = 5;
    c.levels = [{ id: 1, ordersRequired: 10 }];
  });

  it('списывает предметы с доски в порядке чтения и выдаёт награды', () => {
    const { state, events } = run(engine, engine.initialState(), [deliver()]);
    // Ветки (1,0) и (2,0) сданы, (0,1) осталась; брус-награда — в первую свободную клетку.
    expect([at(state, 1, 0), at(state, 2, 0), at(state, 0, 1)]).toEqual(['wood:3', '.', 'wood:1']);
    expect(state.energy.value).toBe(13);
    expect(state.energy.nextRegenAt).toBeNull();
    expect(state.hard).toBe(2);
    expect(state.level).toMatchObject({ ordersDone: 1, totalOrdersDone: 1 });
    expect(events.map((e) => e.type)).toEqual([
      'order_completed',
      'reward_granted',
      'reward_granted',
      'item_spawned',
      'reward_granted',
    ]);
  });

  it('без нужных предметов — отказ; пустой слот — отказ', () => {
    const s = run(engine, engine.initialState(), [deliver()]).state;
    expect(s.orders.slots[0]).toMatchObject({ order: null, refillAt: 5_000 });
    expect(engine.apply(s, deliver()).rejected).toBe('reject.noOrder');
    const refilled = run(engine, s, [tick(5_000)]).state;
    expect(refilled.orders.slots[0]!.order).not.toBeNull();
    expect(engine.apply(refilled, deliver()).rejected).toBe('reject.orderNotReady');
  });

  it('при allowOverMax: false награда энергией не поднимает выше максимума', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['Sw.', '...', '...'];
      c.energy = { max: 10, start: 9, regen: { amount: 1, intervalSec: 60 }, allowOverMax: false };
      c.orders.templates = [tpl({ rewards: [{ type: 'energy', amount: 5 }] })];
    });
    expect(run(e, e.initialState(), [deliver()]).state.energy).toEqual({
      value: 10,
      nextRegenAt: null,
    });
  });

  it('предмет-награда при полной доске уходит в хранилище', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['Sww', 'www', 'www'];
      c.orders.templates = [
        tpl({ rewards: [{ type: 'item', chain: 'wood', level: 2, count: 2 }] }),
      ];
    });
    const { state } = run(e, e.initialState(), [deliver()]);
    expect(at(state, 1, 0)).toBe('wood:2');
    expect(state.storage).toEqual([
      { kind: 'item', chain: 'wood', level: 2, key: 'item:wood:2', count: 1 },
    ]);
  });

  it('хранилище засчитывается только при allowFromStorage', () => {
    const setup = (allow: boolean) =>
      makeEngine((c) => {
        c.board.layout = ['Sww', '...', '...'];
        c.itemActions = [{ match: '*', pickUp: true }];
        c.orders.allowFromStorage = allow;
        c.orders.templates = [tpl({ requirements: [{ chain: 'wood', level: 1, count: 2 }] })];
      });
    const pick = { type: 'itemAction' as const, at: { x: 2, y: 0 }, action: 'pickUp' as const };

    const strict = setup(false);
    const s1 = run(strict, strict.initialState(), [pick]).state;
    expect(strict.apply(s1, deliver()).rejected).toBe('reject.orderNotReady');

    const loose = setup(true);
    const s2 = run(loose, loose.initialState(), [pick, deliver()]).state;
    expect(s2.storage).toEqual([]);
    expect(at(s2, 1, 0)).toBe('.');
  });
});

describe('уровни доски', () => {
  const engine = makeEngine((c) => {
    c.board.layout = ['Sww', 'www', '...'];
    c.orders.templates = [tpl()];
    c.levels = [
      { id: 1, ordersRequired: 2, reward: [{ type: 'hard', amount: 3 }] },
      { id: 2, ordersRequired: 1 },
    ];
  });

  it('уровень закрывается заказами, даёт награду; после последнего игра продолжается', () => {
    const l2 = run(engine, engine.initialState(), [deliver(), deliver()]);
    expect(l2.state.level).toEqual({
      index: 1,
      ordersDone: 0,
      totalOrdersDone: 2,
      completedAll: false,
    });
    expect(l2.state.hard).toBe(3);
    expect(l2.events).toContainEqual(
      expect.objectContaining({ type: 'level_completed', level: 1, last: false }),
    );

    const done = run(engine, l2.state, [deliver()]);
    expect(done.state.level).toMatchObject({ index: 1, completedAll: true, totalOrdersDone: 3 });
    expect(done.events).toContainEqual(
      expect.objectContaining({ type: 'level_completed', level: 2, last: true }),
    );

    const more = run(engine, done.state, [deliver()]);
    expect(more.state.level.totalOrdersDone).toBe(4);
    expect(more.events.some((e) => e.type === 'level_completed')).toBe(false);
    expect(more.state.orders.slots[0]!.order).not.toBeNull();
  });
});
