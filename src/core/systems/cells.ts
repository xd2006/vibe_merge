import { cellOf, cellState, indexOf, neighbours } from '../board';
import { boardLevelId, emitNow, type Ctx } from '../context';
import type { Cell, CellState, RejectReason } from '../types';

/**
 * Снимает выполненные условия клеток: уровень достигнут, группа замков открыта.
 * Клетка без оставшихся ограничений становится открытой (`gates[i] = null`).
 * Вызывается в начале партии и при каждом переходе на уровень.
 */
export function refreshGates(ctx: Ctx): void {
  const { s, rules } = ctx;
  const level = boardLevelId(rules, s);
  s.board.gates.forEach((g, i) => {
    if (!g) return;
    if (g.requiredLevel !== null && level >= g.requiredLevel) g.requiredLevel = null;
    const groupOpen = g.group === null || s.lockGroups[g.group] === 'unlockable';
    if (g.requiredLevel === null && groupOpen && !g.closed && !g.locked) {
      s.board.gates[i] = null;
    }
  });
}

/**
 * Заблокированная клетка открыта слиянием: снимаем блокировку и расчищаем «песок»
 * в соседних клетках (по вертикали и горизонтали), если те уже не закрыты по уровню.
 * DECISION: «песок» расчищает только слияние в заблокированную клетку — по спеке
 * «мердж в открытой клетке не меняет состояние соседних закрытых клеток».
 */
export function openLockedCell(ctx: Ctx, at: Cell): void {
  const { s } = ctx;
  const gate = s.board.gates[indexOf(s.board, at)];
  if (gate) gate.locked = false;
  const uncovered: Cell[] = [];
  for (const n of neighbours(s.board, at)) {
    const g = s.board.gates[indexOf(s.board, n)];
    const groupOpen = !g?.group || s.lockGroups[g.group] === 'unlockable';
    if (g && g.closed && g.requiredLevel === null && groupOpen) {
      g.closed = false;
      uncovered.push(cellOf(s.board, indexOf(s.board, n)));
    }
  }
  if (uncovered.length > 0) emitNow(ctx, { type: 'cells_uncovered', cells: uncovered });
  refreshGates(ctx);
}

/** Причина отказа для закрытой клетки. */
export function closedReason(state: CellState): RejectReason {
  switch (state.kind) {
    case 'level':
      return 'reject.cellLevel';
    case 'closed':
      return 'reject.cellClosed';
    default:
      return 'reject.locked';
  }
}

/** Отказ, если клетка не открыта; `undefined` — можно взаимодействовать. */
export function checkOpen(ctx: Ctx, at: Cell): RejectReason | undefined {
  const state = cellState(ctx.s, indexOf(ctx.s.board, at));
  return state.kind === 'open' ? undefined : closedReason(state);
}
