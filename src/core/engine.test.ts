import { describe, expect, it } from 'vitest';
import { GameConfigSchema } from '@/config';
import { ConfigError, createEngine } from '.';
import { at, baseConfig, makeEngine, run } from './test-utils';

const tap = (x = 0, y = 0) => ({ type: 'tapGenerator' as const, at: { x, y } });
const move = (fx: number, fy: number, tx: number, ty: number) => ({
  type: 'move' as const,
  from: { x: fx, y: fy },
  to: { x: tx, y: ty },
});
const tick = (dtMs: number) => ({ type: 'tick' as const, dtMs });

describe('начальное состояние', () => {
  it('раскладывает доску по ASCII-карте и легенде', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['S.w', '.W.', '..S'];
    });
    const s = e.initialState();
    expect([at(s, 0, 0), at(s, 2, 0), at(s, 1, 1), at(s, 2, 2), at(s, 1, 0)]).toEqual([
      'saw:1',
      'wood:1',
      'wood:2',
      'saw:1',
      '.',
    ]);
    expect(new Set(s.board.cells.filter(Boolean).map((x) => x!.uid)).size).toBe(4);
    expect(s.energy).toEqual({ value: 10, nextRegenAt: null });
  });

  it('запускает восстановление, если стартовая энергия ниже максимума', () => {
    const s = makeEngine((c) => {
      c.energy.start = 3;
    }).initialState();
    expect(s.energy).toEqual({ value: 3, nextRegenAt: 10_000 });
  });

  it('бросает ConfigError на неверной раскладке и ссылках', () => {
    const bad = (patch: (c: ReturnType<typeof baseConfig>) => void, path: string) => {
      const c = baseConfig();
      patch(c);
      expect(() => createEngine(GameConfigSchema.parse(c))).toThrow(ConfigError);
      try {
        createEngine(GameConfigSchema.parse(c));
      } catch (err) {
        expect((err as ConfigError).path).toBe(path);
      }
    };
    bad((c) => (c.board.layout = ['S..', '...']), 'board.layout');
    bad((c) => (c.board.layout = ['S..', '....', '...']), 'board.layout[1]');
    bad((c) => (c.board.layout = ['S..', '.?.', '...']), 'board.layout[1]');
    bad(
      (c) => (c.generators[0]!.levels[0]!.produces[0]!.chain = 'iron'),
      'generators[0].levels[0].produces[0]',
    );
    bad(
      (c) => (c.generators[0]!.levels[0]!.produces[0]!.level = 4),
      'generators[0].levels[0].produces[0]',
    );
    bad((c) => (c.board.legend.S = { generator: 'mill', level: 1 }), 'board.legend.S');
    bad((c) => (c.chains[0]!.value = '2 ^ lvl'), 'chains[0].value');
  });
});

describe('генерация', () => {
  it('тратит энергию и кладёт предмет в ближайшую свободную клетку', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['.w.', 'wSw', '...'];
    });
    const { state, events } = run(e, e.initialState(), [tap(1, 1)]);
    // Свободные соседи на расстоянии 1: (1,2) снизу; сверху и по бокам заняты.
    expect(at(state, 1, 2)).toBe('wood:1');
    expect(state.energy).toEqual({ value: 9, nextRegenAt: 10_000 });
    expect(events.map((x) => x.type)).toEqual(['energy_spent', 'item_spawned']);
    expect(events[1]).toMatchObject({ source: 'generator', generator: 'saw', at: { x: 1, y: 2 } });
  });

  it('при равном расстоянии выбирает клетку выше, затем левее', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['...', '.S.', '...'];
    });
    const s1 = run(e, e.initialState(), [tap(1, 1)]).state;
    expect(at(s1, 1, 0)).toBe('wood:1');
    const s2 = run(e, s1, [tap(1, 1)]).state;
    expect(at(s2, 0, 1)).toBe('wood:1');
  });

  it('отказывает без энергии, без места и не по генератору', () => {
    const noEnergy = makeEngine((c) => {
      c.energy.start = 0;
    });
    expect(noEnergy.apply(noEnergy.initialState(), tap()).rejected).toBe('reject.noEnergy');

    const full = makeEngine((c) => {
      c.board.layout = ['Sww', 'www', 'www'];
    });
    const s = full.initialState();
    const r = full.apply(s, tap());
    expect(r.rejected).toBe('reject.boardFull');
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);

    const e = makeEngine();
    expect(e.apply(e.initialState(), tap(1, 1)).rejected).toBe('reject.notGenerator');
    expect(e.apply(e.initialState(), tap(5, 5)).rejected).toBe('reject.outOfBoard');
  });

  it('генератор с нулевой стоимостью не тратит энергию и не пишет energy_spent', () => {
    const e = makeEngine((c) => {
      c.generators[0]!.levels[0]!.energyCost = 0;
    });
    const { state, events } = run(e, e.initialState(), [tap()]);
    expect(state.energy.value).toBe(10);
    expect(events.map((x) => x.type)).toEqual(['item_spawned']);
  });
});

describe('кулдаун генератора', () => {
  const engine = makeEngine((c) => {
    c.generators[0]!.levels[0]!.cooldown = { charges: 2, seconds: 30 };
  });

  it('после зарядов уходит на кулдаун, после кулдауна заряды восстанавливаются', () => {
    const start = engine.initialState();
    expect(start.board.cells[0]).toMatchObject({ charges: 2, cooldownUntil: null });

    const afterTaps = run(engine, start, [tap(), tick(1000), tap()]);
    expect(afterTaps.state.board.cells[0]).toMatchObject({ charges: 0, cooldownUntil: 31_000 });
    expect(afterTaps.events.at(-1)).toMatchObject({
      type: 'generator_cooldown_started',
      t: 1000,
      untilMs: 31_000,
    });
    expect(engine.apply(afterTaps.state, tap()).rejected).toBe('reject.cooldown');

    const almost = run(engine, afterTaps.state, [tick(29_999)]);
    expect(engine.apply(almost.state, tap()).rejected).toBe('reject.cooldown');

    const done = run(engine, almost.state, [tick(1)]);
    expect(done.state.board.cells[0]).toMatchObject({ charges: 2, cooldownUntil: null });
    expect(done.events).toContainEqual(
      expect.objectContaining({ type: 'generator_cooldown_ended', t: 31_000, at: { x: 0, y: 0 } }),
    );
    expect(engine.apply(done.state, tap()).rejected).toBeUndefined();
  });

  it('кулдаун идёт и после перемещения генератора', () => {
    const s = run(engine, engine.initialState(), [tap(), tap(), move(0, 0, 2, 2), tick(30_000)]);
    expect(s.state.board.cells[8]).toMatchObject({
      kind: 'generator',
      charges: 2,
      cooldownUntil: null,
    });
    expect(s.events.at(-1)).toMatchObject({ type: 'generator_cooldown_ended', at: { x: 2, y: 2 } });
  });

  it('уровень без кулдауна работает без ограничений', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['S..', '...', '...'];
      c.energy.start = 100;
      c.energy.max = 100;
    });
    const taps = Array.from({ length: 8 }, () => tap());
    const { state } = run(e, e.initialState(), taps);
    expect(state.board.cells[0]).toMatchObject({ charges: null, cooldownUntil: null });
  });
});

describe('перемещение и слияние', () => {
  const engine = makeEngine((c) => {
    c.board.layout = ['ww.', 'WX.', 'SSX'];
    c.generators[0]!.levels[0]!.cooldown = { charges: 1, seconds: 60 };
    c.generators[0]!.levels[1]!.cooldown = { charges: 5, seconds: 60 };
  });

  it('переносит предмет в пустую клетку', () => {
    const { state, events } = run(engine, engine.initialState(), [move(0, 0, 2, 0)]);
    expect([at(state, 0, 0), at(state, 2, 0)]).toEqual(['.', 'wood:1']);
    expect(events).toEqual([]);
  });

  it('сливает два одинаковых предмета в следующий уровень на месте цели', () => {
    const s0 = engine.initialState();
    const { state, events } = run(engine, s0, [move(0, 0, 1, 0)]);
    expect([at(state, 0, 0), at(state, 1, 0)]).toEqual(['.', 'wood:2']);
    expect(state.board.cells[1]!.uid).toBe(s0.nextUid);
    expect(events).toEqual([
      {
        type: 'merge',
        t: 0,
        kind: 'item',
        chain: 'wood',
        fromLevel: 1,
        toLevel: 2,
        at: { x: 1, y: 0 },
      },
    ]);
  });

  it('не сливает предметы максимального уровня, а меняет местами разные', () => {
    const s0 = engine.initialState();
    const maxed = run(engine, s0, [move(1, 1, 2, 2)]);
    expect([at(maxed.state, 1, 1), at(maxed.state, 2, 2)]).toEqual(['wood:3', 'wood:3']);
    expect(maxed.events).toEqual([]);

    const swapped = run(engine, s0, [move(0, 0, 0, 1)]);
    expect([at(swapped.state, 0, 0), at(swapped.state, 0, 1)]).toEqual(['wood:2', 'wood:1']);
  });

  it('сливает генераторы; новый стартует с полными зарядами и без кулдауна', () => {
    // Первый генератор уходит на кулдаун (1 заряд), затем сливается со вторым.
    const { state, events } = run(engine, engine.initialState(), [
      move(0, 0, 2, 0),
      tap(0, 2),
      move(0, 2, 1, 2),
    ]);
    expect(at(state, 1, 2)).toBe('saw:2');
    expect(state.board.cells[7]).toMatchObject({ charges: 5, cooldownUntil: null });
    expect(events.at(-1)).toMatchObject({
      type: 'merge',
      kind: 'generator',
      generator: 'saw',
      toLevel: 2,
    });
  });

  it('отказывает в некорректных переносах', () => {
    const s = engine.initialState();
    expect(engine.apply(s, move(2, 0, 0, 0)).rejected).toBe('reject.emptyCell');
    expect(engine.apply(s, move(0, 0, 0, 0)).rejected).toBe('reject.sameCell');
    expect(engine.apply(s, move(0, 0, 3, 0)).rejected).toBe('reject.outOfBoard');
  });
});

describe('энергия', () => {
  const engine = makeEngine((c) => {
    c.energy = { max: 5, start: 5, regen: { amount: 2, intervalSec: 10 } };
    c.generators[0]!.levels[0]!.energyCost = 4;
    c.board.layout = ['S..', '...', '...'];
  });

  it('восстанавливается порциями до максимума и останавливается', () => {
    let { state } = run(engine, engine.initialState(), [tap()]);
    expect(state.energy).toEqual({ value: 1, nextRegenAt: 10_000 });
    state = run(engine, state, [tick(9_999)]).state;
    expect(state.energy.value).toBe(1);
    state = run(engine, state, [tick(1)]).state;
    expect(state.energy).toEqual({ value: 3, nextRegenAt: 20_000 });
    state = run(engine, state, [tick(10_000)]).state;
    expect(state.energy).toEqual({ value: 5, nextRegenAt: null });
    state = run(engine, state, [tick(100_000)]).state;
    expect(state.energy).toEqual({ value: 5, nextRegenAt: null });
  });

  it('последняя порция не превышает максимум', () => {
    const e = makeEngine((c) => {
      c.energy = { max: 5, start: 4, regen: { amount: 3, intervalSec: 10 } };
    });
    const { state } = run(e, e.initialState(), [tick(10_000)]);
    expect(state.energy).toEqual({ value: 5, nextRegenAt: null });
  });

  it('выше максимума восстановление не идёт, пока энергия не опустится ниже', () => {
    const e = makeEngine((c) => {
      c.energy = { max: 5, start: 7, regen: { amount: 1, intervalSec: 10 } };
      c.generators[0]!.levels[0]!.energyCost = 1;
    });
    let { state } = run(e, e.initialState(), [tick(60_000), tap()]);
    expect(state.energy).toEqual({ value: 6, nextRegenAt: null });
    state = run(e, state, [tap(), tap()]).state;
    expect(state.energy).toEqual({ value: 4, nextRegenAt: 70_000 });
  });

  it('при allowOverMax: false стартовая энергия обрезается до максимума', () => {
    const e = makeEngine((c) => {
      c.energy = { max: 5, start: 7, regen: { amount: 1, intervalSec: 10 }, allowOverMax: false };
    });
    expect(e.initialState().energy.value).toBe(5);
  });

  it('офлайн-прогресс: один длинный tick равен многим коротким', () => {
    const s0 = run(engine, engine.initialState(), [tap()]).state;
    const long = run(engine, s0, [tick(25_000)]).state;
    const short = run(
      engine,
      s0,
      Array.from({ length: 25 }, () => tick(1000)),
    ).state;
    expect(long).toEqual(short);
  });
});
