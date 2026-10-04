import { cellOf, entityAt, inBoard, indexOf, nearestFreeCell } from '../board';
import { boardLevelId, emitNow, freeCells, newItem, place, toAmount, type Ctx } from '../context';
import { nextFloat, nextInt, pickWeighted } from '../rng';
import { chainLevel, itemValue, type LifetimeRules, type Rules } from '../rules';
import type { Cell, GameState, ItemEntity, RejectReason } from '../types';

function expiresAt(ctx: Ctx, lifetime: LifetimeRules): number | null {
  if (!lifetime) return null;
  const ms =
    lifetime.minMs === lifetime.maxMs
      ? lifetime.minMs
      : nextInt(ctx.s.rng.bubbles, lifetime.minMs, lifetime.maxMs);
  return ctx.s.nowMs + ms;
}

/** Общие условия появления пузыря: уровень не ниже `minLevel`, на доске меньше `maxOnBoard`. */
function bubblesAllowed(ctx: Ctx): boolean {
  const { s, rules } = ctx;
  const { minLevel, maxOnBoard } = rules.bubbles;
  if (minLevel !== null && boardLevelId(rules, s) < minLevel) return false;
  if (maxOnBoard === null) return true;
  const onBoard = s.board.cells.filter((e) => e?.kind === 'item' && e.bubble).length;
  return onBoard < maxOnBoard;
}

/**
 * Пузырь при генерации: правила проверяются по порядку, срабатывает первое.
 * Возвращает true, если предмет оказался в пузыре.
 */
export function maybeBubbleOnGenerate(ctx: Ctx, item: ItemEntity): boolean {
  if (ctx.rules.bubbles.onGenerate.length === 0 || !bubblesAllowed(ctx)) return false;
  for (const rule of ctx.rules.bubbles.onGenerate) {
    if (nextFloat(ctx.s.rng.bubbles) < rule.chance) {
      item.bubble = { expiresAt: expiresAt(ctx, rule.lifetime), rule: rule.rule };
      return true;
    }
  }
  return false;
}

/** Появление пузыря по таймеру `index` (индекс в `rules.bubbles.timers`). */
export function spawnTimerBubble(ctx: Ctx, index: number): void {
  const { s, rules } = ctx;
  const timer = rules.bubbles.timers[index]!;
  s.bubbleTimers[index] = s.nowMs + timer.everyMs;

  const onBoard = s.board.cells.filter(
    (e) => e?.kind === 'item' && e.bubble?.rule === timer.rule,
  ).length;
  if (onBoard >= timer.maxOnBoard || !bubblesAllowed(ctx)) return;
  // Нет свободных клеток — появление пропускается (ТЗ, раздел 8).
  const free = freeCells(s);
  if (free.length === 0) return;

  const content = pickWeighted(s.rng.bubbles, timer.content, (c) => c.weight);
  if (!content) return;
  const maxLevel = rules.chains.get(content.chain)!.maxLevel;
  const level = nextInt(s.rng.bubbles, content.levels[0], Math.min(content.levels[1], maxLevel));
  // DECISION: пузырь по таймеру появляется в случайной свободной клетке.
  const at = free[nextInt(s.rng.bubbles, 0, free.length - 1)]!;
  const item = newItem(ctx, content.chain, level);
  item.bubble = { expiresAt: expiresAt(ctx, timer.lifetime), rule: timer.rule };
  place(ctx, at, item);
  emitNow(ctx, {
    type: 'item_spawned',
    chain: item.chain,
    level: item.level,
    source: 'bubbleTimer',
    at,
    inBubble: true,
  });
}

/**
 * Копия результата слияния в пузыре (ТЗ Spice merge, «Объект в пузыре»): с вероятностью
 * `bubbleProbability` уровня цепочки результата копия появляется в ближайшей к слиянию
 * свободной клетке. Нет места — копия не появляется.
 */
export function maybeBubbleOnMerge(ctx: Ctx, chain: string, level: number, at: Cell): void {
  const { s, rules } = ctx;
  const rule = rules.bubbles.onMerge;
  const chance = chainLevel(rules, chain, level)?.bubbleProbability ?? 0;
  if (!rule || chance <= 0 || !bubblesAllowed(ctx)) return;
  if (nextFloat(s.rng.bubbles) >= chance) return;
  const target = nearestFreeCell(s.board, at);
  if (!target) return;
  const item = newItem(ctx, chain, level);
  item.bubble = { expiresAt: expiresAt(ctx, rule.lifetime), rule: rule.rule };
  place(ctx, target, item);
  emitNow(ctx, {
    type: 'item_spawned',
    chain,
    level,
    source: 'bubbleMerge',
    at: target,
    inBubble: true,
  });
}

/** Пузырь в клетке `index` истёк: предмет исчезает вместе с ним (`onExpire: vanish`). */
export function expireBubble(ctx: Ctx, index: number): void {
  const e = ctx.s.board.cells[index];
  if (e?.kind !== 'item' || !e.bubble) return;
  ctx.s.board.cells[index] = null;
  emitNow(ctx, {
    type: 'bubble_expired',
    chain: e.chain,
    level: e.level,
    at: cellOf(ctx.s.board, index),
  });
}

/** Стоимость лопания пузыря с предметом `chain:level`. */
export function popCost(rules: Rules, s: GameState, chain: string, level: number): number {
  return toAmount(
    rules.bubbles.popCost({
      itemValue: itemValue(rules, chain, level),
      level,
      boardLevel: boardLevelId(rules, s),
      ordersDone: s.level.totalOrdersDone,
      baseCost: chainLevel(rules, chain, level)?.baseCost ?? 0,
    }),
  );
}

export function popBubble(ctx: Ctx, at: Cell): RejectReason | undefined {
  const { s, rules } = ctx;
  if (!inBoard(s.board, at)) return 'reject.outOfBoard';
  const e = entityAt(s.board, at);
  if (e?.kind !== 'item' || !e.bubble) return 'reject.notBubble';
  if (s.board.gates[indexOf(s.board, at)]) return 'reject.locked';
  const cost = popCost(rules, s, e.chain, e.level);
  if (s.hard < cost) return 'reject.noHard';
  s.hard -= cost;
  const item = s.board.cells[indexOf(s.board, at)] as ItemEntity;
  delete item.bubble;
  emitNow(ctx, { type: 'bubble_popped', chain: e.chain, level: e.level, cost, at: { ...at } });
  return undefined;
}
