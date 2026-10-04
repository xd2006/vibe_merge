import { current, isDraft } from 'immer';
import { isOpenCell } from '../board';
import { emitNow, type Ctx } from '../context';
import { isReachable, reachableNow } from '../reach';
import { nextInt, pickWeighted, rollRange } from '../rng';
import type { GameState, Order, RejectReason } from '../types';
import { categoryFeasible, composeOrder, spicePool } from './difficulty';
import { consumeRequirements, orderStatus } from './orders';
import { grantReward } from './rewards';

/**
 * Назначает, через сколько выполненных заказов появится следующий бонусный заказ.
 * DECISION: отсчёт идёт с момента, когда предыдущий бонусный заказ закончился (сдан или
 * исчез), — пока бонусный заказ висит, следующий не копится.
 */
export function resetBonusQueue(ctx: Ctx): void {
  const { s, rules } = ctx;
  const b = rules.orders.bonus;
  s.bonus.dueAtOrders = b ? s.level.totalOrdersDone + rollRange(s.rng.bonus, b.afterOrders) : null;
}

/** Все генераторы на поле стоят в открытых клетках. */
export function generatorsOpen(s: Pick<GameState, 'board'>): boolean {
  return s.board.cells.every((e, i) => e?.kind !== 'generator' || isOpenCell(s.board, i));
}

/**
 * Появление бонусного заказа, если подошла очередь и выполнены условия. Вызывается после
 * каждой команды и каждого таймера; неудачная попытка не тратит случайные числа.
 * DECISION: тир выбирается по весу среди тиров, для которых сейчас собирается набор специй;
 * если ни один не собирается, заказ ждёт.
 */
export function maybeStartBonus(ctx: Ctx): void {
  const { s, rules } = ctx;
  const b = rules.orders.bonus;
  const due = s.bonus.dueAtOrders;
  if (!b || s.bonus.active || due === null || s.level.totalOrdersDone < due) return;
  if (b.requireOpenGenerators && !generatorsOpen(s)) return;

  const reach = reachableNow(rules, s as GameState);
  const pool = spicePool(rules, (chain, level) => isReachable(reach, chain, level));
  const tiers = b.tiers.filter((t) => t.weight > 0 && categoryFeasible(pool, t.value, b.items));
  if (tiers.length === 0) return;
  const rng = s.rng.bonus;
  const tier = pickWeighted(rng, tiers, (t) => t.weight)!;
  const order = composeOrder(ctx, tier, b.items, rng)!;
  const expiresAt = s.nowMs + nextInt(rng, b.durationMs[0], b.durationMs[1]);
  s.bonus.active = { order, tier: tier.id, expiresAt };
  emitNow(ctx, {
    type: 'bonus_order_created',
    orderId: order.id,
    tier: tier.id,
    requirements: order.requirements.map((r) => ({ ...r })),
    totalValue: order.totalValue,
    expiresAt,
  });
}

/** Время бонусного заказа вышло (таймер). */
export function expireBonus(ctx: Ctx): void {
  const { s } = ctx;
  const active = s.bonus.active;
  if (!active) return;
  emitNow(ctx, { type: 'bonus_order_expired', orderId: active.order.id, tier: active.tier });
  s.bonus.active = null;
  resetBonusQueue(ctx);
}

/**
 * Сдача бонусного заказа.
 * DECISION: бонусный заказ не засчитывается в заказы уровня и в очередь следующего бонусного.
 */
export function deliverBonus(ctx: Ctx): RejectReason | undefined {
  const { s, rules } = ctx;
  const active = s.bonus.active;
  if (!active) return 'reject.noOrder';
  if (!orderStatus(rules, s, active.order).ready) return 'reject.orderNotReady';
  consumeRequirements(ctx, active.order);
  const done: Order = isDraft(active.order) ? current(active.order) : active.order;
  emitNow(ctx, {
    type: 'bonus_order_completed',
    orderId: done.id,
    tier: active.tier,
    requirements: done.requirements,
    rewards: done.rewards,
    totalValue: done.totalValue,
  });
  s.bonus.active = null;
  for (const reward of done.rewards) grantReward(ctx, reward, 'bonus');
  resetBonusQueue(ctx);
  return undefined;
}
