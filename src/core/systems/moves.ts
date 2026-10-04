import type { Draft } from 'immer';
import { cellState, inBoard, indexOf } from '../board';
import { emitNow, newGenerator, newItem, subjectOf, type Ctx } from '../context';
import type { Cell, CellState, Entity, RejectReason } from '../types';
import { maybeBubbleOnMerge } from './bubbles';
import { closedReason, openLockedCell, refreshGates } from './cells';

function canMerge(ctx: Ctx, a: Entity, b: Entity): boolean {
  if (a.kind === 'item' && b.kind === 'item') {
    if (a.bubble || b.bubble) return false;
    const chain = ctx.rules.chains.get(a.chain)!;
    return (
      a.chain === b.chain &&
      a.level === b.level &&
      (a.level < chain.maxLevel || chain.mergesInto !== null)
    );
  }
  if (a.kind === 'generator' && b.kind === 'generator') {
    return (
      a.generator === b.generator &&
      a.level === b.level &&
      a.level < ctx.rules.generators.get(a.generator)!.maxLevel
    );
  }
  return false;
}

/** Предмет `a` (из открытой клетки) можно слить в заблокированную клетку с предметом `b`. */
export function canOpenLock(ctx: Ctx, a: Entity, b: Entity, target: CellState): boolean {
  return target.kind === 'locked' && canMerge(ctx, a, b);
}

/** Слияние `a` (из `fromIdx`) с предметом в `toIdx`; результат — в `toIdx`. */
function merge(ctx: Ctx, a: Draft<Entity>, fromIdx: number, toIdx: number, at: Cell): void {
  const { s } = ctx;
  // Исходная клетка освобождается до появления пузыря: копия может встать в неё.
  s.board.cells[fromIdx] = null;
  if (a.kind === 'item') {
    const chain = ctx.rules.chains.get(a.chain)!;
    const into = a.level >= chain.maxLevel ? chain.mergesInto : null;
    s.board.cells[toIdx] = into
      ? newGenerator(ctx, into.generator, into.level)
      : newItem(ctx, a.chain, a.level + 1);
    emitNow(ctx, {
      type: 'merge',
      kind: 'item',
      chain: a.chain,
      fromLevel: a.level,
      toLevel: a.level + 1,
      at,
      ...(into ? { intoGenerator: { ...into } } : {}),
    });
    if (!into) maybeBubbleOnMerge(ctx, a.chain, a.level + 1, at);
  } else {
    // Новый генератор стартует с полным запасом зарядов и без кулдауна.
    s.board.cells[toIdx] = newGenerator(ctx, a.generator, a.level + 1);
    emitNow(ctx, {
      type: 'merge',
      kind: 'generator',
      generator: a.generator,
      fromLevel: a.level,
      toLevel: a.level + 1,
      at,
    });
  }
}

export function move(ctx: Ctx, from: Cell, to: Cell): RejectReason | undefined {
  const { s } = ctx;
  if (!inBoard(s.board, from) || !inBoard(s.board, to)) return 'reject.outOfBoard';
  if (from.x === to.x && from.y === to.y) return 'reject.sameCell';
  const fromIdx = indexOf(s.board, from);
  const toIdx = indexOf(s.board, to);
  const a = s.board.cells[fromIdx] ?? null;
  if (!a) return 'reject.emptyCell';
  const fromState = cellState(s, fromIdx);
  if (fromState.kind !== 'open') return closedReason(fromState);
  const movable = ctx.rules.bubbles.movable;
  const aBubble = a.kind === 'item' && !!a.bubble;
  if (aBubble && !movable) return 'reject.bubble';
  const b = s.board.cells[toIdx] ?? null;
  const toState = cellState(s, toIdx);

  if (toState.kind !== 'open') {
    if (!b || aBubble || !canOpenLock(ctx, a, b, toState)) return closedReason(toState);
    // Слияние в заблокированную клетку открывает её; результат остаётся в ней.
    const subject = subjectOf(b)!;
    const group = s.board.gates[toIdx]?.group ?? null;
    const at = { ...to };
    merge(ctx, a, fromIdx, toIdx, at);
    emitNow(ctx, { type: 'lock_opened', group, subject, at });
    openLockedCell(ctx, at);
    return undefined;
  }

  if (!b) {
    s.board.cells[toIdx] = a;
    s.board.cells[fromIdx] = null;
    return undefined;
  }

  const bBubble = b.kind === 'item' && !!b.bubble;
  if (aBubble || bBubble) {
    // Пузырь не сливается; при `bubbles.movable` предметы просто меняются местами.
    if (!movable) return 'reject.bubble';
    s.board.cells[toIdx] = a;
    s.board.cells[fromIdx] = b;
    return undefined;
  }

  if (canMerge(ctx, a, b)) {
    merge(ctx, a, fromIdx, toIdx, { ...to });
    return undefined;
  }

  // DECISION: перенос на другой предмет меняет их местами (ТЗ этого не описывает).
  s.board.cells[toIdx] = a;
  s.board.cells[fromIdx] = b;
  return undefined;
}

/** Группы замков переходят из sealed в unlockable (при переходе на уровень). */
export function unlockGroups(ctx: Ctx, groups: readonly string[]): void {
  const changed = groups.filter((g) => ctx.s.lockGroups[g] === 'sealed');
  for (const g of changed) ctx.s.lockGroups[g] = 'unlockable';
  if (changed.length > 0) emitNow(ctx, { type: 'locks_unlockable', groups: changed });
  refreshGates(ctx);
}
