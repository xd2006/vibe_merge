/**
 * Достижимость предметов (ТЗ, раздел 7): заказ не может требовать предмет, который игрок
 * не может получить на текущем уровне доски. Используется ядром при генерации заказов
 * и валидатором при проверке конфига.
 */
import { cellState } from '../board';
import { orderRewards, type Rules } from '../rules';
import type { GameState } from '../types';

export interface ItemLevel {
  chain: string;
  level: number;
}

/** Откуда игрок может получить предметы. */
export interface ReachSources {
  /** Источники: от их уровня можно дойти слиянием на `maxMergeDepth` уровней вверх. */
  sources: ItemLevel[];
  /** Уже имеющиеся предметы (доска, хранилище): доступны ровно своего уровня. */
  existing: ItemLevel[];
}

/** Достижимые уровни по цепочкам. */
export type Reachable = Map<string, Set<number>>;

/**
 * Источники из заблокированных клеток: после открытия в клетке остаётся предмет уровнем выше
 * содержимого замка. `locks` — содержимое замков. Замок открывается слиянием, поэтому он
 * считается источником, только если ту же цепочку можно получить иначе (`base`: генератор,
 * пузырь, награда или имеющийся предмет) на уровне не выше содержимого и в пределах глубины слияния.
 * DECISION: открытие одного замка не делает достижимыми другие (каскад не учитывается).
 */
export function openableLockSources(
  rules: Rules,
  base: ReachSources,
  locks: readonly ItemLevel[],
): ItemLevel[] {
  const depth = rules.orders.reach.maxMergeDepth;
  const feeds = (lock: ItemLevel) => (x: ItemLevel) =>
    x.chain === lock.chain && x.level <= lock.level && lock.level - x.level <= depth;
  return locks
    .filter((l) => base.sources.some(feeds(l)) || base.existing.some(feeds(l)))
    .map((l) => ({ chain: l.chain, level: l.level + 1 }));
}

/** Источники для текущего состояния партии с учётом `orders.reachability.countSources`. */
export function sourcesFromState(rules: Rules, s: GameState): ReachSources {
  const counted = rules.orders.reach.sources;
  const sources: ItemLevel[] = [];
  const existing: ItemLevel[] = [];
  const locks: ItemLevel[] = [];

  const generatorOutput = (generator: string, level: number) => {
    const lvl = rules.generators.get(generator)?.levels[level - 1];
    lvl?.produces.forEach((p) => p.weight > 0 && sources.push({ chain: p.chain, level: p.level }));
  };

  s.board.cells.forEach((e, i) => {
    if (!e) return;
    const state = cellState(s, i);
    if (state.kind === 'locked') {
      if (e.kind === 'item' && counted.has('lockedCellsAfterUnlock')) {
        locks.push({ chain: e.chain, level: e.level });
      }
      return;
    }
    // Закрытые по уровню и «песок» пока недоступны — не источники и не имеющиеся предметы.
    if (state.kind !== 'open') return;
    if (e.kind === 'generator' && counted.has('generator')) generatorOutput(e.generator, e.level);
    if (e.kind === 'item' && !e.bubble) existing.push({ chain: e.chain, level: e.level });
  });
  for (const st of s.storage) {
    if (st.kind === 'item') existing.push({ chain: st.chain, level: st.level });
    // Генератор из хранилища можно вернуть на доску, только если возврат разрешён.
    else if (counted.has('generator') && rules.storage.returnToBoard) {
      generatorOutput(st.generator, st.level);
    }
  }
  if (counted.has('bubble')) {
    for (const timer of rules.bubbles.timers) {
      for (const c of timer.content) {
        for (let l = c.levels[0]; l <= c.levels[1]; l++) sources.push({ chain: c.chain, level: l });
      }
    }
  }
  if (counted.has('reward')) {
    const rewards = [...orderRewards(rules), ...(rules.levels[s.level.index]?.reward ?? [])];
    for (const r of rewards)
      if (r.type === 'item') sources.push({ chain: r.chain, level: r.level });
  }
  sources.push(...openableLockSources(rules, { sources, existing }, locks));
  return { sources, existing };
}

/**
 * Достижимые уровни: от каждого источника уровня L — уровни L…L+maxMergeDepth,
 * плюс уже имеющиеся предметы; всё не выше максимума цепочки и `orderLevelCap`.
 * При выключенной проверке (`mode: off`) достижимы все уровни (потолок всё равно действует).
 */
export function reachableLevels(
  rules: Rules,
  input: ReachSources,
  cap: Record<string, number> = {},
): Reachable {
  const out: Reachable = new Map();
  const limit = (chain: string) =>
    Math.min(rules.chains.get(chain)?.maxLevel ?? 0, cap[chain] ?? Infinity);
  const add = (chain: string, from: number, to: number) => {
    const set = out.get(chain) ?? new Set<number>();
    for (let l = Math.max(1, from); l <= Math.min(to, limit(chain)); l++) set.add(l);
    if (set.size > 0) out.set(chain, set);
  };

  if (!rules.orders.reach.enabled) {
    for (const chain of rules.chains.keys()) add(chain, 1, Infinity);
    return out;
  }
  const depth = rules.orders.reach.maxMergeDepth;
  for (const src of input.sources) add(src.chain, src.level, src.level + depth);
  for (const it of input.existing) add(it.chain, it.level, it.level);
  return out;
}

/** Достижимость для текущего состояния и уровня доски. */
export function reachableNow(rules: Rules, s: GameState): Reachable {
  const cap = rules.levels[s.level.index]?.orderLevelCap ?? {};
  return reachableLevels(rules, sourcesFromState(rules, s), cap);
}

export const isReachable = (r: Reachable, chain: string, level: number) =>
  r.get(chain)?.has(level) ?? false;
