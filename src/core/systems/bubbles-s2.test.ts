// Этап S2 (Spice merge): пузырь — копия результата слияния, общий лимит, минимальный уровень,
// перемещение пузырей.
import { describe, expect, it } from 'vitest';
import type { GameConfigInput } from '@/config';
import { validateConfig } from '@/validator';
import { at, baseConfig, makeEngine, run } from '../test-utils';
import type { GameState } from '../types';

const move = (fx: number, fy: number, tx: number, ty: number) => ({
  type: 'move' as const,
  from: { x: fx, y: fy },
  to: { x: tx, y: ty },
});
const tick = (dtMs: number) => ({ type: 'tick' as const, dtMs });
const bubbles = (s: GameState) => s.board.cells.filter((e) => e?.kind === 'item' && e.bubble);

/** Две ветки рядом, доска 3×3, у доски (уровень 2) вероятность пузыря при слиянии. */
function mergeEngine(patch?: (c: GameConfigInput) => void) {
  return makeEngine((c) => {
    c.board.layout = ['ww.', '...', '...'];
    c.chains[0]!.levels[1]!.bubbleProbability = 1;
    c.chains[0]!.levels[1]!.baseCost = 4;
    c.bubbles = {
      spawnRules: [{ source: 'merge', lifetimeSec: 30 }],
      popCost: { formula: 'baseCost' },
    };
    patch?.(c);
  });
}

describe('пузырь при слиянии', () => {
  it('копия результата появляется в ближайшей свободной клетке и живёт lifetimeSec', () => {
    const e = mergeEngine();
    const r = run(e, e.initialState(), [move(0, 0, 1, 0)]);
    // Результат — в (1, 0); ближайшая свободная — (0, 0), освободившаяся после слияния.
    expect([at(r.state, 1, 0), at(r.state, 0, 0)]).toEqual(['wood:2', 'bubble:wood:2']);
    expect(r.state.board.cells[0]).toMatchObject({ bubble: { expiresAt: 30_000, rule: 0 } });
    expect(r.events.at(-1)).toMatchObject({
      type: 'item_spawned',
      source: 'bubbleMerge',
      inBubble: true,
      at: { x: 0, y: 0 },
    });
    // Цена лопания — baseCost объекта.
    expect(e.apply(r.state, { type: 'popBubble', at: { x: 0, y: 0 } }).rejected).toBe(
      'reject.noHard',
    );
    const popped = run(e, r.state, [
      { type: 'cheat', cheat: 'addHard' },
      { type: 'popBubble', at: { x: 0, y: 0 } },
    ]);
    expect(popped.state.hard).toBe(96);
    // Не лопнули — исчезает по времени.
    expect(at(run(e, r.state, [tick(30_000)]).state, 0, 0)).toBe('.');
  });

  it('без вероятности у уровня или без правила merge пузыря нет', () => {
    const noChance = mergeEngine((c) => delete c.chains[0]!.levels[1]!.bubbleProbability);
    expect(bubbles(run(noChance, noChance.initialState(), [move(0, 0, 1, 0)]).state)).toHaveLength(
      0,
    );
    const noRule = mergeEngine((c) => (c.bubbles = { spawnRules: [] }));
    expect(bubbles(run(noRule, noRule.initialState(), [move(0, 0, 1, 0)]).state)).toHaveLength(0);
  });

  it('вероятность соблюдается (на разных seed)', () => {
    let withBubble = 0;
    const n = 400;
    for (let seed = 1; seed <= n; seed++) {
      const e = mergeEngine((c) => {
        c.meta.seed = seed;
        c.chains[0]!.levels[1]!.bubbleProbability = 0.25;
      });
      if (bubbles(run(e, e.initialState(), [move(0, 0, 1, 0)]).state).length) withBubble++;
    }
    expect(withBubble / n).toBeGreaterThan(0.18);
    expect(withBubble / n).toBeLessThan(0.32);
  });

  it('на заполненной доске копия встаёт в освободившуюся после слияния клетку', () => {
    // Слияние всегда освобождает исходную клетку, поэтому места для копии хватает и на полной доске.
    const e = mergeEngine((c) => {
      c.board.legend.X = { item: 'wood', level: 3 };
      c.board.layout = ['wwX', 'XXX', 'XXX'];
    });
    expect(at(run(e, e.initialState(), [move(0, 0, 1, 0)]).state, 0, 0)).toBe('bubble:wood:2');
  });

  it('открытие замка слиянием тоже даёт шанс пузыря', () => {
    const e = mergeEngine((c) => {
      c.board.layout = ['w..', '...', '...'];
      c.board.locks = [{ group: 'z', cells: [[1, 0]], content: { item: 'wood', level: 1 } }];
      c.levels = [{ id: 1, ordersRequired: 1, unlocks: ['z'] }];
    });
    const r = run(e, e.initialState(), [move(0, 0, 1, 0)]);
    expect(at(r.state, 1, 0)).toBe('wood:2');
    expect(bubbles(r.state)).toHaveLength(1);
  });
});

describe('общие условия появления пузырей', () => {
  it('общий лимит maxOnBoard действует на все источники', () => {
    const e = mergeEngine((c) => {
      c.board.layout = ['www', 'w..', '...'];
      c.bubbles!.maxOnBoard = 1;
    });
    const r = run(e, e.initialState(), [move(0, 0, 1, 0), move(2, 0, 0, 1)]);
    expect(
      r.state.board.cells.filter((x) => x?.kind === 'item' && !x.bubble && x.level === 2),
    ).toHaveLength(2);
    expect(bubbles(r.state)).toHaveLength(1);

    const gen = makeEngine((c) => {
      c.bubbles = { spawnRules: [{ source: 'generator', chance: 1 }], maxOnBoard: 1 };
    });
    const g = run(gen, gen.initialState(), [
      { type: 'tapGenerator', at: { x: 0, y: 0 } },
      { type: 'tapGenerator', at: { x: 0, y: 0 } },
    ]);
    expect(bubbles(g.state)).toHaveLength(1);
  });

  it('maxOnBoard = 0 — пузырей нет', () => {
    const e = mergeEngine((c) => (c.bubbles!.maxOnBoard = 0));
    expect(bubbles(run(e, e.initialState(), [move(0, 0, 1, 0)]).state)).toHaveLength(0);
  });

  it('до minLevel пузыри не появляются', () => {
    const e = mergeEngine((c) => {
      c.board.layout = ['ww.', 'ww.', '...'];
      c.levels = [
        { id: 4, ordersRequired: 1 },
        { id: 5, ordersRequired: 1 },
      ];
      c.bubbles!.minLevel = 5;
    });
    const before = run(e, e.initialState(), [move(0, 0, 1, 0)]).state;
    expect(bubbles(before)).toHaveLength(0);
    const after = run(e, before, [{ type: 'cheat', cheat: 'skipLevel' }, move(0, 1, 1, 1)]).state;
    expect(bubbles(after)).toHaveLength(1);
  });
});

describe('перемещение пузыря (bubbles.movable)', () => {
  const e = mergeEngine((c) => {
    c.board.legend.X = { item: 'wood', level: 3 };
    c.board.layout = ['ww.', 'X..', '...'];
    c.board.locks = [{ group: 'z', cells: [[2, 2]], content: { item: 'wood', level: 2 } }];
    c.levels = [{ id: 1, ordersRequired: 1, unlocks: ['z'] }];
    c.bubbles!.movable = true;
  });
  // После слияния: доска в (1, 0), пузырь-доска в (0, 0).
  const s0 = run(e, e.initialState(), [move(0, 0, 1, 0)]).state;

  it('в свободную клетку и обменом с предметом', () => {
    const moved = run(e, s0, [move(0, 0, 2, 1)]).state;
    expect(at(moved, 2, 1)).toBe('bubble:wood:2');
    const swapped = run(e, s0, [move(0, 0, 0, 1)]).state;
    expect([at(swapped, 0, 0), at(swapped, 0, 1)]).toEqual(['wood:3', 'bubble:wood:2']);
  });

  it('не сливается: с таким же предметом — обмен местами, в замок — нельзя', () => {
    const r = run(e, s0, [move(1, 0, 0, 0)]);
    expect([at(r.state, 0, 0), at(r.state, 1, 0)]).toEqual(['wood:2', 'bubble:wood:2']);
    expect(r.events.some((x) => x.type === 'merge')).toBe(false);
    expect(e.apply(s0, move(0, 0, 2, 2)).rejected).toBe('reject.locked');
  });

  it('без movable пузырь двигать нельзя', () => {
    const fixed = mergeEngine((c) => (c.bubbles!.movable = false));
    const s = run(fixed, fixed.initialState(), [move(0, 0, 1, 0)]).state;
    expect(fixed.apply(s, move(0, 0, 2, 2)).rejected).toBe('reject.bubble');
  });
});

describe('валидатор: пузыри', () => {
  const codes = (patch: (c: GameConfigInput) => void) => {
    const c = baseConfig();
    patch(c);
    return validateConfig(c).issues.map((i) => `${i.level}:${i.code}@${i.path}`);
  };

  it('вероятность задана без правила merge', () => {
    expect(codes((c) => (c.chains[0]!.levels[0]!.bubbleProbability = 0.5))).toContain(
      'warning:mergeBubbleNoRule@bubbles.spawnRules',
    );
  });

  it('повторное правило merge и maxOnBoard = 0', () => {
    const issues = codes((c) => {
      c.bubbles = { spawnRules: [{ source: 'merge' }, { source: 'merge' }], maxOnBoard: 0 };
    });
    expect(issues).toContain('warning:mergeBubbleDuplicate@bubbles.spawnRules[1]');
    expect(issues).toContain('warning:bubblesOff@bubbles.maxOnBoard');
  });
});
