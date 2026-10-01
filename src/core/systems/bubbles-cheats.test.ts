import { describe, expect, it } from 'vitest';
import { at, makeEngine, run } from '../test-utils';
import { orderStatus } from './orders';

const tap = { type: 'tapGenerator' as const, at: { x: 0, y: 0 } };
const tick = (dtMs: number) => ({ type: 'tick' as const, dtMs });

describe('пузыри от генератора', () => {
  const engine = makeEngine((c) => {
    c.board.layout = ['Sw.', '...', '...'];
    c.bubbles = { spawnRules: [{ source: 'generator', chance: 1, lifetimeSec: 10 }] };
  });
  const bubbled = run(engine, engine.initialState(), [tap]);

  it('предмет появляется в пузыре со сроком жизни', () => {
    expect(at(bubbled.state, 0, 1)).toBe('bubble:wood:1');
    expect(bubbled.state.board.cells[3]).toMatchObject({ bubble: { expiresAt: 10_000, rule: 0 } });
    expect(bubbled.events.at(-1)).toMatchObject({ type: 'item_spawned', inBubble: true });
  });

  it('предмет в пузыре нельзя двигать, сливать, сдавать и убирать', () => {
    const s = bubbled.state;
    const mv = (from: [number, number], to: [number, number]) =>
      engine.apply(s, {
        type: 'move',
        from: { x: from[0], y: from[1] },
        to: { x: to[0], y: to[1] },
      }).rejected;
    expect(mv([0, 1], [2, 2])).toBe('reject.bubble');
    expect(mv([1, 0], [0, 1])).toBe('reject.bubble');
    expect(
      engine.apply(s, { type: 'itemAction', at: { x: 0, y: 1 }, action: 'pickUp' }).rejected,
    ).toBe('reject.bubble');
    // В заказ засчитывается только свободная ветка (1, 0).
    const status = orderStatus(engine.rules, s, s.orders.slots[0]!.order!);
    expect(status.requirements[0]).toMatchObject({ onBoard: 1 });
  });

  it('лопается за хард-валюту по формуле; без валюты — отказ', () => {
    // ceil(itemValue / 2) = ceil(2 / 2) = 1.
    expect(engine.apply(bubbled.state, { type: 'popBubble', at: { x: 0, y: 1 } }).rejected).toBe(
      'reject.noHard',
    );
    const popped = run(engine, bubbled.state, [
      { type: 'cheat', cheat: 'addHard' },
      { type: 'popBubble', at: { x: 0, y: 1 } },
    ]);
    expect(popped.state.hard).toBe(99);
    expect(at(popped.state, 0, 1)).toBe('wood:1');
    expect(popped.events.at(-1)).toMatchObject({ type: 'bubble_popped', cost: 1 });
  });

  it('по истечении срока исчезает вместе с предметом', () => {
    const almost = run(engine, bubbled.state, [tick(9_999)]);
    expect(at(almost.state, 0, 1)).toBe('bubble:wood:1');
    const gone = run(engine, almost.state, [tick(1)]);
    expect(at(gone.state, 0, 1)).toBe('.');
    expect(gone.events).toContainEqual(
      expect.objectContaining({ type: 'bubble_expired', t: 10_000, at: { x: 0, y: 1 } }),
    );
  });

  it('бессрочный пузырь не исчезает', () => {
    const e = makeEngine((c) => {
      c.bubbles = { spawnRules: [{ source: 'generator', chance: 1, lifetimeSec: null }] };
    });
    const s = run(e, e.initialState(), [tap, tick(10_000_000)]).state;
    expect(at(s, 1, 0)).toBe('bubble:wood:1');
  });
});

describe('пузыри по таймеру', () => {
  const engine = makeEngine((c) => {
    c.chains[0]!.levels.push({ name: 'w4' });
    c.bubbles = {
      spawnRules: [
        {
          source: 'timer',
          everySec: 10,
          maxOnBoard: 1,
          lifetimeSec: null,
          content: [{ chain: 'wood', levelRange: [2, 3], weight: 1 }],
        },
      ],
    };
  });
  const bubbles = (s: ReturnType<typeof engine.initialState>) =>
    s.board.cells.filter((e) => e?.kind === 'item' && e.bubble);

  it('появляются по таймеру, не больше maxOnBoard', () => {
    const one = run(engine, engine.initialState(), [tick(10_000)]);
    expect(bubbles(one.state)).toHaveLength(1);
    const item = bubbles(one.state)[0]!;
    expect(item.kind === 'item' && item.level >= 2 && item.level <= 3).toBe(true);
    expect(one.events[0]).toMatchObject({ type: 'item_spawned', source: 'bubbleTimer' });
    expect(bubbles(run(engine, one.state, [tick(50_000)]).state)).toHaveLength(1);
  });

  it('на полной доске появление пропускается', () => {
    const full = makeEngine((c) => {
      c.board.layout = ['Sww', 'www', 'www'];
      c.bubbles = {
        spawnRules: [
          {
            source: 'timer',
            everySec: 10,
            maxOnBoard: 5,
            content: [{ chain: 'wood', level: 1, weight: 1 }],
          },
        ],
      };
    });
    const r = run(full, full.initialState(), [tick(30_000)]);
    expect(r.events).toEqual([]);
    expect(r.state.bubbleTimers).toEqual([40_000]);
  });
});

describe('читы', () => {
  const engine = makeEngine((c) => {
    c.energy = { max: 10, start: 2, regen: { amount: 1, intervalSec: 60 } };
    c.levels = [
      { id: 1, ordersRequired: 5 },
      { id: 2, ordersRequired: 5 },
    ];
  });

  it('addHard и refillEnergy', () => {
    const { state, events } = run(engine, engine.initialState(), [
      { type: 'cheat', cheat: 'addHard' },
      { type: 'cheat', cheat: 'refillEnergy' },
    ]);
    expect(state.hard).toBe(100);
    expect(state.energy).toEqual({ value: 10, nextRegenAt: null });
    expect(events.map((e) => [e.type, e.cheat])).toEqual([
      ['cheat_used', true],
      ['cheat_used', true],
    ]);
  });

  it('skipLevel засчитывает уровень; после последнего — отказ', () => {
    const s = run(engine, engine.initialState(), [
      { type: 'cheat', cheat: 'skipLevel' },
      { type: 'cheat', cheat: 'skipLevel' },
    ]).state;
    expect(s.level).toMatchObject({ index: 1, completedAll: true });
    expect(engine.apply(s, { type: 'cheat', cheat: 'skipLevel' }).rejected).toBe(
      'reject.allLevelsDone',
    );
  });

  it('skipTime сдвигает время; все события помечены как чит', () => {
    const { state, events } = run(engine, engine.initialState(), [
      { type: 'cheat', cheat: 'skipTime', minutes: 3 },
    ]);
    expect(state.nowMs).toBe(180_000);
    expect(state.energy.value).toBe(5);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.cheat === true)).toBe(true);
  });

  it('выключенный чит отклоняется', () => {
    const e = makeEngine((c) => {
      c.cheats = { addHard: { enabled: false } };
    });
    expect(e.apply(e.initialState(), { type: 'cheat', cheat: 'addHard' }).rejected).toBe(
      'reject.cheatDisabled',
    );
  });
});
