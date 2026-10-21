// Апгрейд генератора: предмет `upgrade` сливается с генератором своего уровня и даёт следующий.
import { describe, expect, it } from 'vitest';
import { at, makeEngine, run } from '../test-utils';

const move = (fx: number, fy: number, tx: number, ty: number) => ({
  type: 'move' as const,
  from: { x: fx, y: fy },
  to: { x: tx, y: ty },
});

/** `saw` уровня 1 (S) и предмет wood:2 (W) в соседних клетках; апгрейд saw:1 → предмет wood:2. */
const engine = makeEngine((c) => {
  c.board.layout = ['SW.', 'w..', '...'];
  c.generators[0]!.levels[0]!.upgrade = { item: 'wood', level: 2 };
});

describe('апгрейд генератора предметом', () => {
  it('предмет, перенесённый на генератор, расходуется и повышает его уровень', () => {
    const r = run(engine, engine.initialState(), [move(1, 0, 0, 0)]);
    expect(at(r.state, 0, 0)).toBe('saw:2');
    expect(at(r.state, 1, 0)).toBe('.');
    expect(r.events.find((e) => e.type === 'merge')).toMatchObject({
      kind: 'generator',
      generator: 'saw',
      fromLevel: 1,
      toLevel: 2,
      upgradeItem: { chain: 'wood', level: 2 },
    });
  });

  it('генератор, перенесённый на предмет, даёт тот же результат — в клетке предмета', () => {
    const r = run(engine, engine.initialState(), [move(0, 0, 1, 0)]);
    expect(at(r.state, 1, 0)).toBe('saw:2');
    expect(at(r.state, 0, 0)).toBe('.');
  });

  it('предмет не того уровня или цепочки не улучшает генератор — они меняются местами', () => {
    const r = run(engine, engine.initialState(), [move(0, 1, 0, 0)]);
    expect(at(r.state, 0, 0)).toBe('wood:1');
    expect(at(r.state, 0, 1)).toBe('saw:1');
    expect(r.events.some((e) => e.type === 'merge')).toBe(false);
  });

  it('новый генератор стартует с полным запасом зарядов', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['SW.', '...', '...'];
      c.generators[0]!.levels[0]!.upgrade = { item: 'wood', level: 2 };
      c.generators[0]!.levels[1]!.uses = 5;
    });
    const r = run(e, e.initialState(), [move(1, 0, 0, 0)]);
    const gen = r.state.board.cells.find((cell) => cell?.kind === 'generator');
    expect(gen).toMatchObject({ generator: 'saw', level: 2 });
  });

  it('на последнем уровне генератор не улучшается', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['SW.', '...', '...'];
      c.generators[0]!.levels[1]!.upgrade = { item: 'wood', level: 2 };
      c.board.legend.S = { generator: 'saw', level: 2 };
    });
    const r = e.apply(e.initialState(), move(1, 0, 0, 0));
    expect(at(r.state, 0, 0)).toBe('wood:2');
    expect(at(r.state, 1, 0)).toBe('saw:2');
  });

  it('без поля upgrade предмет генератор не улучшает', () => {
    const e = makeEngine((c) => (c.board.layout = ['SW.', '...', '...']));
    const r = e.apply(e.initialState(), move(1, 0, 0, 0));
    expect(at(r.state, 0, 0)).toBe('wood:2');
  });
});
