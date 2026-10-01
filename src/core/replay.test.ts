import { describe, expect, it } from 'vitest';
import demo from '../../presets/demo.json';
import { GameConfigSchema } from '@/config';
import { appendCommand, createEngine, hashState, replay, type Command } from '.';
import { nextInt, seedRng } from './rng';

const engine = createEngine(GameConfigSchema.parse(demo));

/** Псевдослучайный, но фиксированный журнал команд: тапы, переносы и тики по демо-доске. */
function scriptedSession(seed: number, length: number): Command[] {
  const r = seedRng(seed, 'test-script');
  const { width, height } = engine.rules.board;
  const cell = () => ({ x: nextInt(r, 0, width - 1), y: nextInt(r, 0, height - 1) });
  const generators = [
    { x: 1, y: 2 },
    { x: 5, y: 2 },
    { x: 6, y: 7 },
  ];
  const log: Command[] = [];
  for (let i = 0; i < length; i++) {
    const kind = nextInt(r, 0, 9);
    if (kind < 4) log.push({ type: 'tapGenerator', at: generators[nextInt(r, 0, 2)]! });
    else if (kind < 8) log.push({ type: 'move', from: cell(), to: cell() });
    else log.push({ type: 'tick', dtMs: nextInt(r, 1, 120_000) });
  }
  return log;
}

describe('детерминизм', () => {
  it('одинаковые конфиг, seed и журнал дают одинаковый хеш состояния', () => {
    const log = scriptedSession(1, 500);
    const a = replay(engine, log);
    const b = replay(engine, log);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.events).toEqual(b.events);
    // Сценарий содержательный: что-то сгенерировано и слито.
    expect(a.events.some((e) => e.type === 'item_spawned')).toBe(true);
    expect(a.events.some((e) => e.type === 'merge')).toBe(true);
  });

  it('другой seed конфига даёт другую партию', () => {
    const log = scriptedSession(1, 200);
    const other = createEngine(
      GameConfigSchema.parse({ ...demo, meta: { ...demo.meta, seed: 1 } }),
    );
    expect(hashState(replay(other, log).state)).not.toBe(hashState(replay(engine, log).state));
  });

  it('склейка тиков в журнале не меняет результат', () => {
    const log = scriptedSession(2, 300);
    const withSplitTicks = log.flatMap<Command>((c) =>
      c.type === 'tick'
        ? [
            { type: 'tick', dtMs: 1 },
            { type: 'tick', dtMs: c.dtMs - 1 },
          ]
        : [c],
    );
    const merged: Command[] = [];
    for (const c of withSplitTicks) appendCommand(merged, c);
    expect(merged.length).toBeLessThan(withSplitTicks.length);
    expect(hashState(replay(engine, merged).state)).toBe(
      hashState(replay(engine, withSplitTicks).state),
    );
  });

  it('хеш не зависит от порядка ключей', () => {
    const s = engine.initialState();
    const reordered = Object.fromEntries(Object.entries(s).reverse()) as typeof s;
    expect(hashState(reordered)).toBe(hashState(s));
  });
});
