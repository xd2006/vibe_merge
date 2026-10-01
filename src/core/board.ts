import type { Cell, Entity, GameState } from './types';

type Board = GameState['board'];

export const inBoard = (b: Board, c: Cell) =>
  Number.isInteger(c.x) &&
  Number.isInteger(c.y) &&
  c.x >= 0 &&
  c.y >= 0 &&
  c.x < b.width &&
  c.y < b.height;

export const indexOf = (b: Board, c: Cell) => c.y * b.width + c.x;

export const cellOf = (b: Board, index: number): Cell => ({
  x: index % b.width,
  y: Math.floor(index / b.width),
});

export const entityAt = (b: Board, c: Cell): Entity | null => b.cells[indexOf(b, c)] ?? null;

/**
 * Ближайшая свободная клетка к `origin`.
 * DECISION: расстояние — манхэттенское; при равенстве выигрывает клетка выше, затем левее
 * (порядок чтения), чтобы выбор был детерминированным и предсказуемым для дизайнера.
 */
export function nearestFreeCell(b: Board, origin: Cell): Cell | null {
  let best: Cell | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < b.cells.length; i++) {
    if (b.cells[i] !== null) continue;
    const c = cellOf(b, i);
    const d = Math.abs(c.x - origin.x) + Math.abs(c.y - origin.y);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}
