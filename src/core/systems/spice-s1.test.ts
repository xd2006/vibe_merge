// Этап S1 (Spice merge): мешок генератора, циклы и кулдаун, пропуск кулдауна, uses,
// слияние в генератор, сбор двойным тапом, ресурсы, генератор в награду, флаг deletable, baseCost.
import { describe, expect, it } from 'vitest';
import type { GameConfigInput } from '@/config';
import { computeMetrics } from '@/telemetry';
import { validateConfig } from '@/validator';
import { at, baseConfig, makeEngine, run } from '../test-utils';
import { availableActions } from './storage';
import { popCost } from './bubbles';
import { skipCooldownCost } from './generators';
import type { GameEvent, GameState } from '../types';

const tap = (x = 0, y = 0) => ({ type: 'tapGenerator' as const, at: { x, y } });
const tick = (dtMs: number) => ({ type: 'tick' as const, dtMs });
const items = (s: GameState) =>
  s.board.cells.flatMap((e) => (e?.kind === 'item' ? [`${e.chain}:${e.level}`] : [])).sort();
const gen = (s: GameState, i = 0) => s.board.cells[i]!;

/** Генератор в режиме мешка на большой пустой доске. */
function bagEngine(patch?: (c: GameConfigInput) => void) {
  return makeEngine((c) => {
    c.energy = { max: 1000, start: 1000, regen: { amount: 1, intervalSec: 60 } };
    c.board.width = 6;
    c.board.height = 6;
    c.board.layout = ['S.....', '......', '......', '......', '......', '......'];
    c.generators[0]!.levels[0] = {
      energyCost: 1,
      cooldown: { cycles: 2, seconds: 60, skipCost: 30, freeSkipSec: 10 },
      produces: [
        { chain: 'wood', level: 1, count: 3 },
        { chain: 'wood', level: 2, count: 2 },
        { chain: 'wood', level: 3, count: 1 },
      ],
    };
    patch?.(c);
  });
}

describe('генератор: мешок и циклы', () => {
  it('за цикл выдаёт ровно заданное количество каждого вида', () => {
    const e = bagEngine();
    const { state } = run(
      e,
      e.initialState(),
      Array.from({ length: 6 }, () => tap()),
    );
    expect(items(state)).toEqual(['wood:1', 'wood:1', 'wood:1', 'wood:2', 'wood:2', 'wood:3']);
    // Мешок набран заново на следующий цикл, кулдауна ещё нет (циклов 2).
    expect(gen(state)).toMatchObject({ bag: [3, 2, 1], cyclesLeft: 1, cooldownUntil: null });
  });

  it('порядок внутри цикла зависит от seed, состав — нет', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      const e = bagEngine((c) => (c.meta.seed = seed));
      const { events } = run(
        e,
        e.initialState(),
        Array.from({ length: 6 }, () => tap()),
      );
      orders.add(events.flatMap((x) => (x.type === 'item_spawned' ? [x.level] : [])).join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('после cycles циклов — кулдаун; после него циклы восстанавливаются', () => {
    const e = bagEngine();
    const r = run(
      e,
      e.initialState(),
      Array.from({ length: 12 }, () => tap()),
    );
    expect(gen(r.state)).toMatchObject({ cyclesLeft: 0, cooldownUntil: 60_000 });
    expect(r.events.filter((x) => x.type === 'generator_cooldown_started')).toHaveLength(1);
    expect(e.apply(r.state, tap()).rejected).toBe('reject.cooldown');
    const back = run(e, r.state, [tick(60_000)]).state;
    expect(gen(back)).toMatchObject({ cyclesLeft: 2, cooldownUntil: null, bag: [3, 2, 1] });
  });

  it('мешок из одного предмета и 15 циклов — 15 тапов до кулдауна (как generator_OR_01)', () => {
    const e = bagEngine((c) => {
      c.generators[0]!.levels[0] = {
        energyCost: 1,
        cooldown: { cycles: 15, seconds: 300 },
        produces: [{ chain: 'wood', level: 1, count: 1 }],
      };
    });
    const after14 = run(
      e,
      e.initialState(),
      Array.from({ length: 14 }, () => tap()),
    ).state;
    expect(gen(after14).kind === 'generator' && gen(after14)).toMatchObject({
      cooldownUntil: null,
    });
    const after15 = run(e, after14, [tap()]).state;
    expect(gen(after15)).toMatchObject({ cooldownUntil: 300_000 });
  });
});

describe('пропуск кулдауна', () => {
  const e = bagEngine();
  const onCooldown = run(
    e,
    e.initialState(),
    Array.from({ length: 12 }, () => tap()),
  ).state;

  it('цена падает пропорционально остатку, в бесплатном окне — 0', () => {
    const g = gen(onCooldown);
    if (g.kind !== 'generator') throw new Error();
    expect(skipCooldownCost(e.rules, onCooldown, g)).toBe(30);
    const half = run(e, onCooldown, [tick(30_000)]).state;
    expect(skipCooldownCost(e.rules, half, gen(half) as typeof g)).toBe(15);
    const almost = run(e, onCooldown, [tick(49_000)]).state;
    // Осталось 11 с из 60: ceil(30 × 11 / 60) = 6.
    expect(skipCooldownCost(e.rules, almost, gen(almost) as typeof g)).toBe(6);
    const free = run(e, onCooldown, [tick(50_000)]).state;
    expect(skipCooldownCost(e.rules, free, gen(free) as typeof g)).toBe(0);
  });

  it('списывает хард и сразу возвращает генератор; без хард — отказ', () => {
    expect(e.apply(onCooldown, { type: 'skipCooldown', at: { x: 0, y: 0 } }).rejected).toBe(
      'reject.noHard',
    );
    const paid = run(e, onCooldown, [
      { type: 'cheat', cheat: 'addHard' },
      { type: 'skipCooldown', at: { x: 0, y: 0 } },
    ]);
    expect(paid.state.hard).toBe(70);
    expect(gen(paid.state)).toMatchObject({ cooldownUntil: null, cyclesLeft: 2 });
    expect(paid.events.map((x) => x.type)).toContain('generator_cooldown_skipped');
    expect(computeMetrics(e.rules.config, paid.events)).toMatchObject({
      hardSpent: 30,
      cooldownSkips: 1,
    });
  });

  it('генератор не на кулдауне — отказ', () => {
    expect(e.apply(e.initialState(), { type: 'skipCooldown', at: { x: 0, y: 0 } }).rejected).toBe(
      'reject.notOnCooldown',
    );
  });
});

describe('uses: генератор исчезает', () => {
  it('режим мешка — после uses циклов (как generator_Converter)', () => {
    const e = bagEngine((c) => {
      c.generators[0]!.levels[0] = {
        energyCost: 1,
        uses: 1,
        produces: [
          { chain: 'wood', level: 1, count: 2 },
          { chain: 'wood', level: 2, count: 2 },
        ],
      };
    });
    const three = run(e, e.initialState(), [tap(), tap(), tap()]).state;
    expect(gen(three)).toMatchObject({ kind: 'generator', usesLeft: 1 });
    const four = run(e, three, [tap()]);
    expect(gen(four.state)).toBeNull();
    expect(items(four.state)).toEqual(['wood:1', 'wood:1', 'wood:2', 'wood:2']);
    expect(four.events.at(-1)).toMatchObject({ type: 'generator_depleted', at: { x: 0, y: 0 } });
  });

  it('режим весов — после uses тапов', () => {
    const e = makeEngine((c) => {
      c.generators[0]!.levels[0]!.uses = 2;
    });
    const s = run(e, e.initialState(), [tap(), tap()]).state;
    expect(at(s, 0, 0)).toBe('.');
  });
});

describe('слияние последнего уровня в генератор', () => {
  const e = makeEngine((c) => {
    c.board.layout = ['XX.', '...', '...'];
    c.chains[0]!.mergesInto = { generator: 'saw', level: 2 };
  });

  it('два предмета последнего уровня дают генератор', () => {
    const r = run(e, e.initialState(), [
      { type: 'move', from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
    ]);
    expect(at(r.state, 1, 0)).toBe('saw:2');
    expect(r.state.board.cells[1]).toMatchObject({ kind: 'generator', cooldownUntil: null });
    expect(r.events[0]).toMatchObject({
      type: 'merge',
      kind: 'item',
      intoGenerator: { generator: 'saw', level: 2 },
    });
  });

  it('без mergesInto последний уровень не сливается', () => {
    const plain = makeEngine((c) => (c.board.layout = ['XX.', '...', '...']));
    const r = run(plain, plain.initialState(), [
      { type: 'move', from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
    ]);
    expect([at(r.state, 0, 0), at(r.state, 1, 0)]).toEqual(['wood:3', 'wood:3']);
  });
});

describe('сбор двойным тапом', () => {
  const collect = (x: number, y: number) => ({ type: 'collect' as const, at: { x, y } });
  const e = makeEngine((c) => {
    c.board.layout = ['Swx', 'WX.', '...'];
    c.board.legend.x = { item: 'wood', level: 1 };
    c.currencies = { hard: { name: 'Гемы' }, resources: [{ id: 'crystal', name: 'Кристаллы' }] };
    c.chains[0]!.levels[1]!.collect = 'storage';
    c.chains[0]!.levels[2]!.collect = [
      { type: 'resource', resource: 'crystal', amount: 2 },
      { type: 'energy', amount: 'boardLevel + 4' },
    ];
    c.energy = { max: 10, start: 3, regen: { amount: 1, intervalSec: 60 } };
    c.telemetry = {
      counters: [
        {
          id: 'col',
          name: 'Собрано',
          match: { chain: 'wood', levelRange: [1, 3] },
          sources: ['collect'],
        },
      ],
    };
  });

  it('специя уходит на склад без награды', () => {
    const r = run(e, e.initialState(), [collect(0, 1)]);
    expect(at(r.state, 0, 1)).toBe('.');
    expect(r.state.storage).toEqual([
      { kind: 'item', chain: 'wood', level: 2, key: 'item:wood:2', count: 1 },
    ]);
    expect(r.events).toEqual([
      expect.objectContaining({ type: 'item_collected', to: 'storage', chain: 'wood', level: 2 }),
    ]);
  });

  it('призовой предмет превращается в ресурс и энергию', () => {
    const r = run(e, e.initialState(), [collect(1, 1)]);
    expect(r.state.resources).toEqual({ crystal: 2 });
    expect(r.state.energy.value).toBe(3 + 5);
    const m = computeMetrics(e.rules.config, r.events);
    expect(m.resourcesGained).toEqual({ crystal: 2 });
    expect(m.itemsCollected).toBe(1);
    expect(m.counters[0]!.value).toBe(1);
  });

  it('обычный предмет и генератор не собираются', () => {
    const s = e.initialState();
    expect(e.apply(s, collect(1, 0)).rejected).toBe('reject.notCollectable');
    expect(e.apply(s, collect(0, 0)).rejected).toBe('reject.notCollectable');
    expect(e.apply(s, collect(2, 2)).rejected).toBe('reject.emptyCell');
    expect(availableActions(e.rules, s, s.board.cells[3]!).collect).toBe('storage');
  });
});

describe('генератор в награду за уровень', () => {
  const e = makeEngine((c) => {
    c.board.layout = ['Sww', 'www', 'ww.'];
    c.chains[0]!.levels[0]!.deletable = true;
    c.levels = [
      { id: 5, ordersRequired: 1, reward: [{ type: 'generator', generator: 'saw', level: 1 }] },
      {
        id: 6,
        ordersRequired: 1,
        reward: [{ type: 'generator', generator: 'saw', level: 2, count: 2 }],
      },
      { id: 7, ordersRequired: 1 },
    ];
  });
  const skip = { type: 'cheat' as const, cheat: 'skipLevel' as const };

  it('ставится в свободную клетку; при полной доске ждёт в очереди', () => {
    const l6 = run(e, e.initialState(), [skip]);
    expect(at(l6.state, 2, 2)).toBe('saw:1');
    expect(l6.events.map((x) => x.type)).toContain('generator_placed');

    const l7 = run(e, l6.state, [skip]).state;
    expect(l7.rewardQueue).toEqual([
      { kind: 'generator', generator: 'saw', level: 2 },
      { kind: 'generator', generator: 'saw', level: 2 },
    ]);
    // Освободили клетку — первая из очереди встаёт сразу.
    const freed = run(e, l7, [{ type: 'itemAction', at: { x: 1, y: 0 }, action: 'delete' }]);
    expect(at(freed.state, 1, 0)).toBe('saw:2');
    expect(freed.state.rewardQueue).toHaveLength(1);
  });
});

describe('свойства уровня цепочки', () => {
  it('deletable важнее itemActions в обе стороны', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['SwW', '...', '...'];
      c.itemActions = [{ match: 'wood.1', delete: true }];
      c.chains[0]!.levels[0]!.deletable = false;
      c.chains[0]!.levels[1]!.deletable = true;
      c.generators[0]!.levels[0]!.deletable = true;
    });
    const s = e.initialState();
    const del = (i: number) => availableActions(e.rules, s, s.board.cells[i]!).delete;
    expect([del(0), del(1), del(2)]).toEqual([true, false, true]);
  });

  it('baseCost — переменная формулы цены лопания пузыря', () => {
    const e = makeEngine((c) => {
      c.chains[0]!.levels[1]!.baseCost = 7;
      c.bubbles = { popCost: { formula: 'baseCost' } };
    });
    const s = e.initialState();
    expect(popCost(e.rules, s, 'wood', 2)).toBe(7);
    expect(popCost(e.rules, s, 'wood', 1)).toBe(0);
  });
});

describe('валидатор: новые проверки', () => {
  const brief = (patch: (c: GameConfigInput) => void) => {
    const c = baseConfig();
    patch(c);
    return validateConfig(c).issues.map((i) => `${i.code}@${i.path}`);
  };

  it.each<[string, (c: GameConfigInput) => void, string]>([
    [
      'смешаны weight и count',
      (c) =>
        (c.generators[0]!.levels[0]!.produces = [
          { chain: 'wood', level: 1, weight: 1 },
          { chain: 'wood', level: 2, count: 1 },
        ]),
      'mixedProduces@generators[0].levels[0].produces',
    ],
    [
      'кулдаун charges в режиме мешка',
      (c) => {
        c.generators[0]!.levels[0]!.produces = [{ chain: 'wood', level: 1, count: 1 }];
        c.generators[0]!.levels[0]!.cooldown = { charges: 3, seconds: 10 };
      },
      'cooldownMode@generators[0].levels[0].cooldown.charges',
    ],
    [
      'неизвестный ресурс в награде сбора',
      (c) =>
        (c.chains[0]!.levels[2]!.collect = [{ type: 'resource', resource: 'gold', amount: 1 }]),
      'unknownResource@chains[0].levels[2].collect[0].resource',
    ],
    [
      'mergesInto на несуществующий генератор',
      (c) => (c.chains[0]!.mergesInto = { generator: 'mill', level: 1 }),
      'unknownGenerator@chains[0].mergesInto.generator',
    ],
    [
      'генератор-награда выше максимального уровня',
      (c) => (c.levels[0]!.reward = [{ type: 'generator', generator: 'saw', level: 9 }]),
      'levelTooHigh@levels[0].reward[0].level',
    ],
  ])('%s', (_, patch, expected) => {
    expect(brief(patch)).toContain(expected);
  });

  it('weight и count в одной строке — ошибка схемы', () => {
    expect(
      brief(
        (c) =>
          (c.generators[0]!.levels[0]!.produces = [
            { chain: 'wood', level: 1, weight: 1, count: 1 },
          ]),
      ),
    ).toContain('schema.custom@generators[0].levels[0].produces[0]');
  });
});

// Журнал без лишних событий удобно смотреть при отладке.
export const types = (events: GameEvent[]) => events.map((e) => e.type);
