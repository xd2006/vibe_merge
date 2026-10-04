import type { ResolvedReward, RewardRules, Rules, Subject } from '@/core';
import type { GameSession } from './session';

/** Название предмета цепочки для интерфейса: имя уровня или имя цепочки. */
export function itemName(rules: Rules, chain: string, level: number): string {
  const c = rules.chains.get(chain);
  return c?.levelNames[level - 1] ?? c?.name ?? chain;
}

export function generatorName(rules: Rules, generator: string, level: number): string {
  const g = rules.generators.get(generator);
  return g?.levels[level - 1]?.name ?? g?.name ?? generator;
}

export function subjectName(rules: Rules, s: Subject): string {
  return s.kind === 'item'
    ? itemName(rules, s.chain, s.level)
    : generatorName(rules, s.generator, s.level);
}

export function resourceName(session: GameSession, id: string): string {
  return session.config.currencies.resources.find((r) => r.id === id)?.name ?? id;
}

/** Короткая запись награды: «⚡ 3», «💎 2», «Кристаллы 1», «Доска ×2». */
export function rewardText(session: GameSession, r: RewardRules | ResolvedReward): string {
  const rules = session.engine.rules;
  const s = session.state;
  // Формулы наград сбора считаются так же, как в ядре (totalValue = 0).
  const amount = (a: number | ((v: Record<string, number>) => number)) =>
    typeof a === 'number'
      ? a
      : Math.max(
          0,
          Math.round(
            a({
              totalValue: 0,
              boardLevel: rules.levels[s.level.index]?.id ?? 1,
              ordersDone: s.level.totalOrdersDone,
            }),
          ),
        );
  switch (r.type) {
    case 'energy':
      return `⚡ ${amount(r.amount)}`;
    case 'hard':
      return `💎 ${amount(r.amount)}`;
    case 'resource':
      return `${resourceName(session, r.resource)} ${amount(r.amount)}`;
    case 'item':
      return `${itemName(rules, r.chain, r.level)} ×${r.count}`;
    case 'generator':
      return `${generatorName(rules, r.generator, r.level)} ×${r.count}`;
  }
}
