// Этап S3 (Spice merge): состояния клеток поля — закрыта до уровня, «песок», заблокирована.
import { describe, expect, it } from 'vitest';
import type { GameConfigInput } from '@/config';
import { validateConfig } from '@/validator';
import { cellState } from '../board';
import { at, baseConfig, makeEngine, run } from '../test-utils';

const move = (fx: number, fy: number, tx: number, ty: number) => ({
  type: 'move' as const,
  from: { x: fx, y: fy },
  to: { x: tx, y: ty },
});
const tap = { type: 'tapGenerator' as const, at: { x: 0, y: 0 } };
const skipLevel = { type: 'cheat' as const, cheat: 'skipLevel' as const };
const twoLevels = (c: GameConfigInput) => {
  c.levels = [
    { id: 1, ordersRequired: 1 },
    { id: 2, ordersRequired: 1 },
  ];
};

describe('клетка, закрытая до уровня', () => {
  const engine = () =>
    makeEngine((c) => {
      twoLevels(c);
      c.board.layout = ['S..', 'w..', '..w'];
      c.board.cells = [
        { cell: [2, 2], requiredLevel: 2 },
        { cell: [1, 2], requiredLevel: 2 },
        { cell: [2, 0], requiredLevel: 1 },
      ];
    });

  it('закрыта до нужного уровня; клетка текущего уровня открыта сразу', () => {
    const e = engine();
    const s = e.initialState();
    expect([at(s, 2, 2), at(s, 1, 2), at(s, 2, 0)]).toEqual(['closed:wood:1', 'closed:.', '.']);
    expect(cellState(s, 8)).toEqual({ kind: 'level', level: 2 });
    expect(e.apply(s, move(2, 2, 1, 1)).rejected).toBe('reject.cellLevel');
    expect(e.apply(s, move(0, 1, 2, 2)).rejected).toBe('reject.cellLevel');
  });

  it('генератор не кладёт предметы в закрытые клетки', () => {
    const e = engine();
    // Свободных открытых клеток 5: (1,0), (2,0), (1,1), (2,1), (0,2).
    const r = run(e, e.initialState(), [tap, tap, tap, tap, tap]);
    expect([at(r.state, 2, 2), at(r.state, 1, 2)]).toEqual(['closed:wood:1', 'closed:.']);
    expect(e.apply(r.state, tap).rejected).toBe('reject.boardFull');
  });

  it('открывается при переходе на уровень', () => {
    const e = engine();
    const r = run(e, e.initialState(), [skipLevel]);
    expect([at(r.state, 2, 2), at(r.state, 1, 2)]).toEqual(['wood:1', '.']);
    expect(r.state.board.gates.every((g) => g === null)).toBe(true);
    expect(at(run(e, r.state, [move(0, 1, 2, 2)]).state, 2, 2)).toBe('wood:2');
  });

  it('предмет в закрытой клетке не засчитывается в заказ', () => {
    const e = makeEngine((c) => {
      twoLevels(c);
      c.board.layout = ['S..', '...', '..w'];
      c.board.cells = [{ cell: [2, 2], requiredLevel: 2 }];
    });
    expect(e.apply(e.initialState(), { type: 'deliverOrder', slot: 0 }).rejected).toBe(
      'reject.orderNotReady',
    );
  });
});

describe('«песок» и заблокированные клетки', () => {
  // (0,0) w открыт, (1,0) w заблокирован, (2,0) W под «песком»;
  // (1,1) «песок» до уровня 2, (2,1) «песок» не рядом с замком, (1,2) «песок» рядом с (0,2).
  const engine = () =>
    makeEngine((c) => {
      twoLevels(c);
      c.board.layout = ['wwW', 'w..', 'w..'];
      c.board.cells = [
        { cell: [1, 0], locked: true },
        { cell: [2, 0], closed: true },
        { cell: [1, 1], closed: true, requiredLevel: 2 },
        { cell: [2, 1], closed: true },
        { cell: [1, 2], closed: true },
      ];
    });

  it('закрытый и заблокированный предмет нельзя двигать', () => {
    const e = engine();
    const s = e.initialState();
    expect([at(s, 1, 0), at(s, 2, 0)]).toEqual(['lock:wood:1', 'closed:wood:2']);
    expect(e.apply(s, move(1, 0, 2, 2)).rejected).toBe('reject.locked');
    expect(e.apply(s, move(2, 0, 2, 2)).rejected).toBe('reject.cellClosed');
    expect(e.apply(s, move(0, 1, 2, 1)).rejected).toBe('reject.cellClosed');
  });

  it('слияние в открытой клетке не расчищает соседний «песок»', () => {
    const e = engine();
    const r = run(e, e.initialState(), [move(0, 1, 0, 2)]);
    expect([at(r.state, 0, 2), at(r.state, 1, 2)]).toEqual(['wood:2', 'closed:.']);
    expect(r.events.some((ev) => ev.type === 'cells_uncovered')).toBe(false);
  });

  it('слияние в заблокированную клетку открывает её и расчищает соседний «песок»', () => {
    const e = engine();
    const r = run(e, e.initialState(), [move(0, 0, 1, 0)]);
    expect([at(r.state, 1, 0), at(r.state, 2, 0)]).toEqual(['wood:2', 'wood:2']);
    // Клетка, закрытая ещё и по уровню, и клетка не по соседству остаются закрытыми.
    expect([at(r.state, 1, 1), at(r.state, 2, 1)]).toEqual(['closed:.', 'closed:.']);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'lock_opened', group: null, at: { x: 1, y: 0 } }),
    );
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'cells_uncovered', cells: [{ x: 2, y: 0 }] }),
    );
    // Расчищенный предмет снова участвует в игре.
    expect(at(run(e, r.state, [move(2, 0, 1, 0)]).state, 1, 0)).toBe('wood:3');
  });

  it('уровень снимает только своё условие: «песок» остаётся', () => {
    const e = engine();
    const s = run(e, e.initialState(), [skipLevel]).state;
    expect(cellState(s, 4)).toEqual({ kind: 'closed' });
  });

  it('заблокированный генератор открывается слиянием с таким же генератором', () => {
    const e = makeEngine((c) => {
      c.board.layout = ['SS.', '...', '...'];
      c.board.cells = [{ cell: [0, 0], locked: true }];
    });
    const s = e.initialState();
    expect(e.apply(s, tap).rejected).toBe('reject.locked');
    const r = run(e, s, [move(1, 0, 0, 0)]);
    expect(at(r.state, 0, 0)).toBe('saw:2');
    expect(e.apply(r.state, tap).rejected).toBeUndefined();
  });
});

describe('валидатор: board.cells', () => {
  const issuesOf = (patch: (c: GameConfigInput) => void) => {
    const c = baseConfig();
    patch(c);
    return validateConfig(c)
      .issues.filter((i) => i.level === 'error')
      .map((i) => `${i.code}@${i.path}`);
  };

  it('вне доски, повтор, неизвестный уровень, пустая и максимальная заблокированная клетка', () => {
    expect(
      issuesOf((c) => {
        c.board.layout = ['S.X', '...', '...'];
        c.board.cells = [
          { cell: [3, 0] },
          { cell: [1, 1], requiredLevel: 7 },
          { cell: [1, 1] },
          { cell: [2, 2], locked: true },
          { cell: [2, 0], locked: true },
        ];
      }),
    ).toEqual([
      'lockCell@board.cells[0].cell',
      'unknownLevel@board.cells[1].requiredLevel',
      'cellDuplicate@board.cells[2].cell',
      'lockedEmpty@board.cells[3].locked',
      'lockedMaxLevel@board.cells[4].locked',
    ]);
  });

  it('заблокированный генератор максимального уровня — ошибка', () => {
    expect(
      issuesOf((c) => {
        c.board.legend.T = { generator: 'saw', level: 2 };
        c.board.layout = ['T..', '...', '...'];
        c.board.cells = [{ cell: [0, 0], locked: true }];
      }),
    ).toEqual(['lockedMaxLevel@board.cells[0].locked']);
  });
});
