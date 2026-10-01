import { inBoard, indexOf } from '../board';
import { emitNow, newGenerator, newItem, type Ctx } from '../context';
import type { Cell, Entity, LockEntity, RejectReason } from '../types';

function canMerge(ctx: Ctx, a: Entity, b: Entity): boolean {
  if (a.kind === 'item' && b.kind === 'item') {
    if (a.bubble || b.bubble) return false;
    return (
      a.chain === b.chain &&
      a.level === b.level &&
      a.level < ctx.rules.chains.get(a.chain)!.maxLevel
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

/** Предмет `a` открывает замок `lock`: группа открыта для слияния, предмет совпадает с содержимым. */
export function canOpenLock(ctx: Ctx, a: Entity, lock: LockEntity): boolean {
  return (
    ctx.s.lockGroups[lock.group] === 'unlockable' &&
    a.kind === 'item' &&
    !a.bubble &&
    a.chain === lock.chain &&
    a.level === lock.level &&
    a.level < ctx.rules.chains.get(a.chain)!.maxLevel
  );
}

export function move(ctx: Ctx, from: Cell, to: Cell): RejectReason | undefined {
  const { s } = ctx;
  if (!inBoard(s.board, from) || !inBoard(s.board, to)) return 'reject.outOfBoard';
  if (from.x === to.x && from.y === to.y) return 'reject.sameCell';
  const fromIdx = indexOf(s.board, from);
  const toIdx = indexOf(s.board, to);
  const a = s.board.cells[fromIdx] ?? null;
  if (!a) return 'reject.emptyCell';
  if (a.kind === 'lock') return 'reject.locked';
  if (a.kind === 'item' && a.bubble) return 'reject.bubble';
  const b = s.board.cells[toIdx] ?? null;

  if (!b) {
    s.board.cells[toIdx] = a;
    s.board.cells[fromIdx] = null;
    return undefined;
  }

  if (b.kind === 'lock') {
    if (!canOpenLock(ctx, a, b) || a.kind !== 'item') return 'reject.locked';
    // Клетка открывается, результат слияния остаётся в ней как обычный предмет.
    s.board.cells[toIdx] = newItem(ctx, a.chain, a.level + 1);
    s.board.cells[fromIdx] = null;
    const at = { ...to };
    emitNow(ctx, {
      type: 'merge',
      kind: 'item',
      chain: a.chain,
      fromLevel: a.level,
      toLevel: a.level + 1,
      at,
    });
    emitNow(ctx, { type: 'lock_opened', group: b.group, chain: b.chain, level: b.level, at });
    return undefined;
  }
  if (b.kind === 'item' && b.bubble) return 'reject.bubble';

  if (canMerge(ctx, a, b)) {
    const at = { ...to };
    if (a.kind === 'item') {
      s.board.cells[toIdx] = newItem(ctx, a.chain, a.level + 1);
      emitNow(ctx, {
        type: 'merge',
        kind: 'item',
        chain: a.chain,
        fromLevel: a.level,
        toLevel: a.level + 1,
        at,
      });
    } else if (a.kind === 'generator') {
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
    s.board.cells[fromIdx] = null;
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
}
