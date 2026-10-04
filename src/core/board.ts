import type { Cell, CellState, Entity, GameState } from './types';

type Board = GameState['board'];
type Size = { width: number; height: number };

export const inBoard = (b: Size, c: Cell) =>
  Number.isInteger(c.x) &&
  Number.isInteger(c.y) &&
  c.x >= 0 &&
  c.y >= 0 &&
  c.x < b.width &&
  c.y < b.height;

export const indexOf = (b: { width: number }, c: Cell) => c.y * b.width + c.x;

export const cellOf = (b: { width: number }, index: number): Cell => ({
  x: index % b.width,
  y: Math.floor(index / b.width),
});

export const entityAt = (b: Board, c: Cell): Entity | null => b.cells[indexOf(b, c)] ?? null;

/**
 * Действующее состояние клетки. Выполненные условия снимаются из состояния (`refreshGates`),
 * группа замков остаётся в ограничении для событий, но после открытия группы не мешает.
 * Порядок — приоритет из спеки: уровень → группа → «песок» → заблокирована.
 */
export function cellState(s: Pick<GameState, 'board' | 'lockGroups'>, index: number): CellState {
  const g = s.board.gates[index];
  if (!g) return { kind: 'open' };
  if (g.requiredLevel !== null) return { kind: 'level', level: g.requiredLevel };
  if (g.group !== null && s.lockGroups[g.group] !== 'unlockable')
    return { kind: 'group', group: g.group };
  if (g.closed) return { kind: 'closed' };
  if (g.locked) return { kind: 'locked' };
  return { kind: 'open' };
}

/** С клеткой и её содержимым можно взаимодействовать. */
export const isOpenCell = (b: Board, index: number) => !b.gates[index];

/** Клетка открыта и пуста — сюда можно положить предмет. */
export const isFreeCell = (b: Board, index: number) => b.cells[index] === null && !b.gates[index];

/** Соседи по вертикали и горизонтали (без диагоналей). */
export function neighbours(b: Size, c: Cell): Cell[] {
  return [
    { x: c.x, y: c.y - 1 },
    { x: c.x - 1, y: c.y },
    { x: c.x + 1, y: c.y },
    { x: c.x, y: c.y + 1 },
  ].filter((n) => inBoard(b, n));
}

/**
 * Ближайшая свободная клетка к `origin`.
 * DECISION: расстояние — манхэттенское; при равенстве выигрывает клетка выше, затем левее
 * (порядок чтения), чтобы выбор был детерминированным и предсказуемым для дизайнера.
 */
export function nearestFreeCell(b: Board, origin: Cell): Cell | null {
  let best: Cell | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < b.cells.length; i++) {
    if (!isFreeCell(b, i)) continue;
    const c = cellOf(b, i);
    const d = Math.abs(c.x - origin.x) + Math.abs(c.y - origin.y);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}
