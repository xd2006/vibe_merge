import {
  addToStorage,
  boardLevelId,
  emitNow,
  firstFreeCell,
  newGenerator,
  newItem,
  place,
  toAmount,
  type Ctx,
} from '../context';
import type { RewardRules } from '../rules';
import type { ResolvedReward, RewardSource } from '../types';
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
  return rewards.map((r): ResolvedReward => {
    if (r.type === 'item' || r.type === 'generator') return { ...r };
    if (r.type === 'resource') {
      return { type: 'resource', resource: r.resource, amount: toAmount(r.amount(vars)) };
    }
    return { type: r.type, amount: toAmount(r.amount(vars)) } as ResolvedReward;
  });
}

/** Ставит генератор в первую свободную клетку или в очередь, если места нет. */
function placeGenerator(ctx: Ctx, generator: string, level: number): void {
  const at = firstFreeCell(ctx.s);
  if (!at) {
    // DECISION: генератор-награда ждёт места в очереди, а не уходит на склад: со склада
    // его можно не вернуть (`storage.returnToBoard: false`), а генератор нужен на поле.
    ctx.s.rewardQueue.push({ kind: 'generator', generator, level });
    return;
  }
  place(ctx, at, newGenerator(ctx, generator, level));
  emitNow(ctx, { type: 'generator_placed', generator, level, at });
}

/** Ставит ожидающие награды-генераторы в освободившиеся клетки (по порядку получения). */
export function placeQueuedRewards(ctx: Ctx): void {
  const { s } = ctx;
  while (s.rewardQueue.length > 0 && firstFreeCell(s)) {
    const next = s.rewardQueue.shift()!;
    if (next.kind === 'generator') placeGenerator(ctx, next.generator, next.level);
  }
}

export function grantReward(ctx: Ctx, reward: ResolvedReward, source: RewardSource): void {
  const { s } = ctx;
  switch (reward.type) {
    case 'energy':
      addEnergy(ctx, reward.amount);
      break;
    case 'hard':
      s.hard += reward.amount;
      break;
    case 'resource':
      s.resources[reward.resource] = (s.resources[reward.resource] ?? 0) + reward.amount;
      break;
    case 'generator':
      for (let i = 0; i < reward.count; i++) placeGenerator(ctx, reward.generator, reward.level);
      break;
    case 'item':
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
      break;
  }
  emitNow(ctx, { type: 'reward_granted', reward: { ...reward }, source });
}
