import { describe, expect, it } from 'vitest';
import { at, makeEngine, run } from '../test-utils';
import { availableActions, matchesPattern } from './storage';

const move = (fx: number, fy: number, tx: number, ty: number) => ({
  type: 'move' as const,
  from: { x: fx, y: fy },
  to: { x: tx, y: ty },
});
const action = (x: number, y: number, a: 'pickUp' | 'delete' | 'sell') => ({
  type: 'itemAction' as const,
  at: { x, y },
  action: a,
});

describe('замки', () => {
  const engine = makeEngine((c) => {
    c.board.layout = ['Sw.', 'W..', '...'];
    c.board.locks = [{ group: 'z', cells: [[2, 2]], content: { item: 'wood', level: 1 } }];
    c.levels = [
      { id: 1, ordersRequired: 3 },
      { id: 2, ordersRequired: 3, unlocks: ['z'] },
    ];
  });

  it('пока группа не открыта уровнем, клетка запечатана', () => {
    const s = engine.initialState();
    expect(at(s, 2, 2)).toBe('lock:wood:1');
    expect(s.lockGroups).toEqual({ z: 'sealed' });
    expect(engine.apply(s, move(1, 0, 2, 2)).rejected).toBe('reject.locked');
    expect(engine.apply(s, move(2, 2, 2, 1)).rejected).toBe('reject.locked');
  });

  it('уровень открывает группу; слияние с замком открывает клетку и оставляет результат', () => {
    const lvl2 = run(engine, engine.initialState(), [{ type: 'cheat', cheat: 'skipLevel' }]);
    expect(lvl2.state.lockGroups).toEqual({ z: 'unlockable' });
    expect(lvl2.events.map((e) => e.type)).toContain('locks_unlockable');

    // Неподходящий предмет (доска вместо ветки) не открывает замок.
    expect(engine.apply(lvl2.state, move(0, 1, 2, 2)).rejected).toBe('reject.locked');

    const opened = run(engine, lvl2.state, [move(1, 0, 2, 2)]);
    expect(at(opened.state, 2, 2)).toBe('wood:2');
    expect(at(opened.state, 1, 0)).toBe('.');
    expect(opened.events.map((e) => e.type)).toEqual(['merge', 'lock_opened']);
    expect(opened.events[1]).toMatchObject({ group: 'z', at: { x: 2, y: 2 } });
    // Открытая клетка — обычная: предмет можно двигать.
    run(engine, opened.state, [move(2, 2, 2, 1)]);
  });

  it('генератор не кладёт предметы в клетку замка', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['S..', '...', '...'];
      c.board.locks = [
        {
          group: 'z',
          cells: [
            [1, 0],
            [0, 1],
          ],
          content: { item: 'wood', level: 1 },
        },
      ];
      c.levels = [{ id: 1, ordersRequired: 1 }];
    });
    const { state } = run(e, e.initialState(), [{ type: 'tapGenerator', at: { x: 0, y: 0 } }]);
    expect(at(state, 2, 0)).toBe('wood:1');
  });
});

describe('действия над предметами', () => {
  const engine = makeEngine((c) => {
    c.board.layout = ['Sww', 'WX.', '...'];
    c.itemActions = [
      { match: 'generator.saw', pickUp: true },
      { match: 'wood.3' },
      { match: 'wood.*', pickUp: true, delete: true, sell: { amount: 'itemValue' } },
    ];
    c.generators[0]!.levels[0]!.cooldown = { charges: 1, seconds: 60 };
  });

  it('шаблоны match', () => {
    const wood2 = { kind: 'item' as const, chain: 'wood', level: 2 };
    const saw = { kind: 'generator' as const, generator: 'saw', level: 1 };
    expect(matchesPattern('*', wood2)).toBe(true);
    expect(matchesPattern('wood.*', wood2)).toBe(true);
    expect(matchesPattern('wood.2', wood2)).toBe(true);
    expect(matchesPattern('wood.3', wood2)).toBe(false);
    expect(matchesPattern('stone.*', wood2)).toBe(false);
    expect(matchesPattern('generator.saw', saw)).toBe(true);
    expect(matchesPattern('generator.saw', wood2)).toBe(false);
    expect(matchesPattern('wood.*', saw)).toBe(false);
  });

  it('действует первое совпавшее правило', () => {
    const s = engine.initialState();
    // wood.3 совпадает с правилом без действий раньше, чем с wood.*.
    expect(availableActions(engine.rules, s, s.board.cells[4]!)).toEqual({
      pickUp: false,
      delete: false,
      sell: null,
    });
    expect(engine.apply(s, action(1, 1, 'delete')).rejected).toBe('reject.notAllowed');
    expect(availableActions(engine.rules, s, s.board.cells[1]!)).toEqual({
      pickUp: true,
      delete: true,
      sell: 2,
    });
  });

  it('забрать складывает предметы в стопки', () => {
    const { state, events } = run(engine, engine.initialState(), [
      action(1, 0, 'pickUp'),
      action(2, 0, 'pickUp'),
      action(0, 1, 'pickUp'),
    ]);
    expect(state.storage).toEqual([
      { kind: 'item', chain: 'wood', level: 1, key: 'item:wood:1', count: 2 },
      { kind: 'item', chain: 'wood', level: 2, key: 'item:wood:2', count: 1 },
    ]);
    expect([at(state, 1, 0), at(state, 2, 0), at(state, 0, 1)]).toEqual(['.', '.', '.']);
    expect(events.every((e) => e.type === 'item_picked')).toBe(true);
  });

  it('продать и удалить', () => {
    const sold = run(engine, engine.initialState(), [action(0, 1, 'sell')]);
    expect(sold.state.hard).toBe(4);
    expect(sold.events[0]).toMatchObject({ type: 'item_sold', amount: 4 });
    const deleted = run(engine, engine.initialState(), [action(1, 0, 'delete')]);
    expect(at(deleted.state, 1, 0)).toBe('.');
    expect(deleted.events[0]).toMatchObject({ type: 'item_deleted' });
  });

  it('генератор: забрать можно, но не на кулдауне; удалить нельзя', () => {
    const s = engine.initialState();
    expect(engine.apply(s, action(0, 0, 'delete')).rejected).toBe('reject.notAllowed');
    const onCooldown = run(engine, s, [{ type: 'tapGenerator', at: { x: 0, y: 0 } }]).state;
    expect(engine.apply(onCooldown, action(0, 0, 'pickUp')).rejected).toBe('reject.cooldown');
    const picked = run(engine, s, [action(0, 0, 'pickUp')]).state;
    expect(picked.storage[0]).toMatchObject({ key: 'generator:saw:1', count: 1 });
  });

  it('возврат на выбранную свободную клетку', () => {
    const s = run(engine, engine.initialState(), [
      action(0, 0, 'pickUp'),
      action(1, 0, 'pickUp'),
    ]).state;
    expect(
      engine.apply(s, { type: 'returnFromStorage', key: 'item:wood:1', to: { x: 2, y: 0 } })
        .rejected,
    ).toBe('reject.cellOccupied');
    expect(
      engine.apply(s, { type: 'returnFromStorage', key: 'item:wood:5', to: { x: 0, y: 2 } })
        .rejected,
    ).toBe('reject.notInStorage');
    const back = run(engine, s, [
      { type: 'returnFromStorage', key: 'item:wood:1', to: { x: 0, y: 2 } },
      { type: 'returnFromStorage', key: 'generator:saw:1', to: { x: 1, y: 2 } },
    ]);
    expect([at(back.state, 0, 2), at(back.state, 1, 2)]).toEqual(['wood:1', 'saw:1']);
    expect(back.state.storage).toEqual([]);
    expect(back.state.board.cells[7]).toMatchObject({ charges: 1, cooldownUntil: null });
    expect(back.events.map((e) => e.type)).toEqual(['item_returned', 'item_returned']);
  });

  it('без returnToBoard хранилище только склад; выключенное хранилище не принимает предметы', () => {
    const readOnly = makeEngine((c) => {
      c.board.layout = ['Sw.', '...', '...'];
      c.itemActions = [{ match: '*', pickUp: true }];
      c.storage = { returnToBoard: false };
    });
    const s = run(readOnly, readOnly.initialState(), [action(1, 0, 'pickUp')]).state;
    expect(
      readOnly.apply(s, { type: 'returnFromStorage', key: 'item:wood:1', to: { x: 1, y: 0 } })
        .rejected,
    ).toBe('reject.returnDisabled');

    const disabled = makeEngine((c) => {
      c.board.layout = ['Sw.', '...', '...'];
      c.itemActions = [{ match: '*', pickUp: true }];
      c.storage = { enabled: false };
    });
    expect(disabled.apply(disabled.initialState(), action(1, 0, 'pickUp')).rejected).toBe(
      'reject.storageDisabled',
    );
  });
});
