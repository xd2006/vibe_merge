import { emitNow, type Ctx } from '../context';
import type { RejectReason } from '../types';
import { unlockGroups } from './moves';
import { grantReward, resolveRewards } from './rewards';

/** Учитывает выполненный заказ; при наборе `ordersRequired` завершает уровень. */
export function onOrderCompleted(ctx: Ctx): void {
  const { s, rules } = ctx;
  s.level.totalOrdersDone += 1;
  if (s.level.completedAll) return;
  s.level.ordersDone += 1;
  if (s.level.ordersDone >= rules.levels[s.level.index]!.ordersRequired) completeLevel(ctx);
}

/**
 * Завершает текущий уровень: награда, переход на следующий и открытие его групп замков.
 * После последнего уровня игра продолжается, заказы генерируются бесконечно.
 */
export function completeLevel(ctx: Ctx): RejectReason | undefined {
  const { s, rules } = ctx;
  if (s.level.completedAll) return 'reject.allLevelsDone';
  const level = rules.levels[s.level.index]!;
  const last = s.level.index === rules.levels.length - 1;
  emitNow(ctx, { type: 'level_completed', level: level.id, last });
  for (const reward of resolveRewards(ctx, level.reward, 0)) grantReward(ctx, reward, 'level');

  s.level.ordersDone = 0;
  if (last) {
    s.level.completedAll = true;
    return undefined;
  }
  s.level.index += 1;
  unlockGroups(ctx, rules.levels[s.level.index]!.unlocks);
  return undefined;
}
