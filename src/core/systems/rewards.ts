import {
  addToStorage,
  boardLevelId,
  emitNow,
  firstFreeCell,
  newItem,
  place,
  toAmount,
  type Ctx,
} from '../context';
import type { RewardRules } from '../rules';
import type { ResolvedReward } from '../types';
import { addEnergy } from './energy';

/** Вычисляет формулы награды. `totalValue` — сумма ценностей требований заказа (для уровня 0). */
export function resolveRewards(
  ctx: Ctx,
  rewards: readonly RewardRules[],
  totalValue: number,
): ResolvedReward[] {
  const vars = {
    totalValue,
    boardLevel: boardLevelId(ctx.rules, ctx.s),
    ordersDone: ctx.s.level.totalOrdersDone,
  };
  return rewards.map((r) =>
    r.type === 'item'
      ? { ...r }
      : ({ type: r.type, amount: toAmount(r.amount(vars)) } as ResolvedReward),
  );
}

export function grantReward(ctx: Ctx, reward: ResolvedReward, source: 'order' | 'level'): void {
  const { s } = ctx;
  if (reward.type !== 'item') {
    if (reward.type === 'energy') addEnergy(ctx, reward.amount);
    else s.hard += reward.amount;
  } else {
    for (let i = 0; i < reward.count; i++) {
      // DECISION: предмет-награда кладётся в первую свободную клетку (порядок чтения);
      // если места нет — в хранилище (даже при выключенном хранилище, чтобы награда не пропала).
      const at = firstFreeCell(s);
      if (at) place(ctx, at, newItem(ctx, reward.chain, reward.level));
      else addToStorage(ctx, { kind: 'item', chain: reward.chain, level: reward.level });
      emitNow(ctx, {
        type: 'item_spawned',
        chain: reward.chain,
        level: reward.level,
        source: 'reward',
        ...(at ? { at } : {}),
      });
    }
  }
  emitNow(ctx, { type: 'reward_granted', reward: { ...reward }, source });
}
