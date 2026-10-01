import type { Rules, Subject } from '@/core';

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
