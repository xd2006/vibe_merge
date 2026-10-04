import { boardLevelId, type Ctx } from '../context';
import { isReachable, reachableNow } from '../reach';
import { nextInt, pickWeighted, type RngState } from '../rng';
import {
  itemValue,
  type DifficultyCategoryRules,
  type DifficultyRules,
  type Range,
  type Rules,
} from '../rules';
import type { GameState, Order, OrderRequirement, OrderSlot } from '../types';
import { resolveRewards } from './rewards';

/** Предмет, который может попасть в заказ по сложности, и его ценность. */
export interface PoolItem {
  chain: string;
  level: number;
  value: number;
}

/** Предметы, собираемые на склад (специи), для которых `ok` — обычно «достижим сейчас». */
export function spicePool(rules: Rules, ok: (chain: string, level: number) => boolean): PoolItem[] {
  const pool: PoolItem[] = [];
  for (const c of rules.chains.values()) {
    c.levels.forEach((l, li) => {
      const level = li + 1;
      if (l.collect === 'storage' && ok(c.id, level)) {
        pool.push({ chain: c.id, level, value: itemValue(rules, c.id, level) });
      }
    });
  }
  return pool;
}

/** Потолок перебора: больше вариантов для случайного выбора не нужно. */
const MAX_COMBOS = 5000;

/**
 * Все наборы из `size` предметов пула (с повторами, без учёта порядка), сумма ценности
 * которых попадает в `value`. Порядок перебора детерминирован.
 */
export function difficultyCombos(pool: readonly PoolItem[], value: Range, size: number) {
  const out: number[][] = [];
  const pick: number[] = [];
  const walk = (from: number, sum: number) => {
    if (out.length >= MAX_COMBOS || sum > value[1]) return;
    if (pick.length === size) {
      if (sum >= value[0]) out.push([...pick]);
      return;
    }
    for (let i = from; i < pool.length; i++) {
      pick.push(i);
      walk(i, sum + pool[i]!.value);
      pick.pop();
    }
  };
  walk(0, 0);
  return out;
}

/** Есть ли хотя бы один заказ категории с суммой `value` из предметов пула. */
export function categoryFeasible(pool: readonly PoolItem[], value: Range, items: Range): boolean {
  for (let n = items[0]; n <= items[1]; n++) {
    if (difficultyCombos(pool, value, n).length > 0) return true;
  }
  return false;
}

/**
 * Число слотов каждой категории на уровне `levelId`: строка с наибольшим `fromLevel`,
 * не превышающим уровень.
 * DECISION: уровни ниже первой строки берут первую строку.
 */
export function allocationAt(d: DifficultyRules, levelId: number): Record<string, number> {
  let row = d.allocation[0]!;
  for (const r of d.allocation) if (r.fromLevel <= levelId) row = r;
  return row.slots;
}

/**
 * Приводит слоты к распределению текущего уровня. Недостающие слоты добавляются (рядом со
 * слотами своей категории, в порядке категорий) и заполняются при ближайшей попытке.
 * DECISION: лишний слот с заказом остаётся до сдачи заказа и убирается после неё.
 */
export function syncSlots(ctx: Ctx): void {
  const { s, rules } = ctx;
  const d = rules.orders.difficulty;
  if (!d) return;
  const target = allocationAt(d, boardLevelId(rules, s));
  const slots = s.orders.slots;
  const rank = (id: string | null) => d.categories.findIndex((c) => c.id === id);
  d.categories.forEach((cat, r) => {
    const want = target[cat.id] ?? 0;
    let have = slots.filter((sl) => sl.category === cat.id).length;
    for (let i = slots.length - 1; i >= 0 && have > want; i--) {
      if (slots[i]!.category === cat.id && !slots[i]!.order) {
        slots.splice(i, 1);
        have--;
      }
    }
    for (; have < want; have++) {
      const at = slots.findIndex((sl) => rank(sl.category) > r);
      const slot: OrderSlot = { order: null, refillAt: null, pending: true, category: cat.id };
      slots.splice(at < 0 ? slots.length : at, 0, slot);
    }
  });
}

/**
 * Заказ категории: `items` предметов из достижимых специй, сумма ценности в диапазоне
 * категории, награда — одна по весам. `null` — подходящего набора нет (случайные числа не тратятся).
 * DECISION: один и тот же предмет может повторяться; сначала случайно выбирается число
 * предметов (из тех, для которых есть наборы), затем набор — равновероятно.
 */
export function buildDifficultyOrder(ctx: Ctx, categoryId: string): Order | null {
  const d = ctx.rules.orders.difficulty!;
  const cat = d.categories.find((c) => c.id === categoryId);
  return cat ? composeOrder(ctx, cat, d.items, ctx.s.rng.orders) : null;
}

/**
 * Заказ на сумму в диапазоне `cat.value` из `items` достижимых специй и одна награда по весам
 * (общее для заказов по сложности и бонусного заказа). `null` — набора нет, `rng` не тронут.
 */
export function composeOrder(
  ctx: Ctx,
  cat: DifficultyCategoryRules,
  items: Range,
  rng: RngState,
): Order | null {
  const { s, rules } = ctx;
  const reach = reachableNow(rules, s as GameState);
  const pool = spicePool(rules, (chain, level) => isReachable(reach, chain, level));
  const bySize: number[][][] = [];
  for (let n = items[0]; n <= items[1]; n++) {
    const combos = difficultyCombos(pool, cat.value, n);
    if (combos.length > 0) bySize.push(combos);
  }
  if (bySize.length === 0) return null;

  const combos = bySize[nextInt(rng, 0, bySize.length - 1)]!;
  const combo = combos[nextInt(rng, 0, combos.length - 1)]!;
  const requirements: OrderRequirement[] = [];
  let totalValue = 0;
  for (const i of combo) {
    const item = pool[i]!;
    totalValue += item.value;
    const same = requirements.find((r) => r.chain === item.chain && r.level === item.level);
    if (same) same.count++;
    else requirements.push({ chain: item.chain, level: item.level, count: 1 });
  }
  const reward = cat.rewards.some((r) => r.weight > 0)
    ? pickWeighted(rng, cat.rewards, (r) => r.weight)?.reward
    : undefined;
  return {
    id: s.nextOrderId++,
    // DECISION: в режиме сложности поле `template` заказа — id категории (так метрики
    // по шаблонам показывают разбивку по категориям).
    template: cat.id,
    requirements,
    totalValue,
    rewards: reward ? resolveRewards(ctx, [reward], totalValue) : [],
  };
}
