import { current, isDraft, type Draft } from 'immer';
import { activeItemAt, boardLevelId, emitNow, type Ctx } from '../context';
import { isReachable, reachableNow, type Reachable } from '../reach';
import { nextInt, pickWeighted, rollRange } from '../rng';
import { itemValue, type Rules, type TemplateRules } from '../rules';
import type { GameState, Order, OrderRequirement, RejectReason } from '../types';
import { onOrderCompleted } from './levels';
import { grantReward, resolveRewards } from './rewards';

interface Candidate {
  template: TemplateRules;
  /** Требования шаблона, у которых остались достижимые уровни. */
  requirements: { chain: string; levels: number[]; count: [number, number] }[];
}

/** Оставляет у требований шаблона только достижимые уровни; без требований шаблон не подходит. */
function candidate(rules: Rules, template: TemplateRules, reach: Reachable): Candidate | null {
  const requirements = template.requirements
    .map((r) => {
      const levels: number[] = [];
      for (let l = r.levels[0]; l <= r.levels[1]; l++) {
        if (isReachable(reach, r.chain, l)) levels.push(l);
      }
      return { chain: r.chain, levels, count: r.count };
    })
    .filter((r) => r.levels.length > 0 && rules.chains.has(r.chain));
  return requirements.length > 0 ? { template, requirements } : null;
}

/** Шаблоны, подходящие для текущего уровня доски с учётом достижимости (шаги 2–3 ТЗ). */
export function candidateTemplates(rules: Rules, s: GameState): Candidate[] {
  const level = boardLevelId(rules, s);
  const reach = reachableNow(rules, s);
  return rules.orders.templates
    .filter((tpl) => level >= tpl.boardLevels[0] && level <= tpl.boardLevels[1])
    .map((tpl) => candidate(rules, tpl, reach))
    .filter((c): c is Candidate => c !== null);
}

/** Разворачивает выбранный шаблон в заказ (шаги 5–6 ТЗ). */
function buildOrder(ctx: Ctx, c: Candidate): Order {
  const { s, rules } = ctx;
  const rng = s.rng.orders;
  // DECISION: если требований больше maxRequirements, берётся случайное подмножество
  // (порядок как в шаблоне); требования к одному и тому же предмету складываются.
  let chosen = c.requirements;
  if (chosen.length > c.template.maxRequirements) {
    const indices = chosen.map((_, i) => i);
    for (let i = 0; i < c.template.maxRequirements; i++) {
      const j = nextInt(rng, i, indices.length - 1);
      [indices[i], indices[j]] = [indices[j]!, indices[i]!];
    }
    const keep = new Set(indices.slice(0, c.template.maxRequirements));
    chosen = chosen.filter((_, i) => keep.has(i));
  }
  const requirements: OrderRequirement[] = [];
  for (const r of chosen) {
    const level = r.levels[nextInt(rng, 0, r.levels.length - 1)]!;
    const count = rollRange(rng, r.count);
    const same = requirements.find((x) => x.chain === r.chain && x.level === level);
    if (same) same.count += count;
    else requirements.push({ chain: r.chain, level, count });
  }
  const totalValue = requirements.reduce(
    (sum, r) => sum + itemValue(rules, r.chain, r.level) * r.count,
    0,
  );
  return {
    id: s.nextOrderId++,
    template: c.template.id,
    requirements,
    totalValue,
    rewards: resolveRewards(ctx, c.template.rewards, totalValue),
  };
}

/**
 * Пытается заполнить слот. Без подходящего шаблона поведение задаёт `onNoValidTemplate`.
 * Неудачная попытка не тратит случайные числа: повторы не сдвигают ход партии.
 */
function fillSlot(ctx: Ctx, index: number): void {
  const { s, rules } = ctx;
  const slot = s.orders.slots[index]!;
  slot.refillAt = null;
  slot.pending = false;
  if (s.orders.stopped) return;

  const candidates = candidateTemplates(rules, s);
  let picked = pickIfAny(ctx, candidates);
  if (!picked && rules.orders.onNoValidTemplate === 'fallbackTemplate' && rules.orders.fallback) {
    const fb = candidate(rules, rules.orders.fallback, reachableNow(rules, s));
    if (fb) picked = fb;
  }
  if (!picked) {
    if (rules.orders.onNoValidTemplate === 'error') {
      s.orders.stopped = true;
      emitNow(ctx, { type: 'orders_stopped' });
    } else {
      slot.pending = true;
    }
    return;
  }
  const order = buildOrder(ctx, picked);
  slot.order = order;
  emitNow(ctx, {
    type: 'order_created',
    orderId: order.id,
    template: order.template,
    requirements: order.requirements.map((r) => ({ ...r })),
  });
}

function pickIfAny(ctx: Ctx, candidates: Candidate[]): Candidate | null {
  if (candidates.length === 0) return null;
  if (!candidates.some((c) => c.template.weight > 0)) return null;
  return pickWeighted(ctx.s.rng.orders, candidates, (c) => c.template.weight) ?? null;
}

/** Таймер пополнения слота `index` сработал. */
export function refillSlot(ctx: Ctx, index: number): void {
  fillSlot(ctx, index);
}

/** Повторная попытка для слотов, ожидающих смены условий (`skipSlot`). */
export function retryPendingSlots(ctx: Ctx): void {
  ctx.s.orders.slots.forEach((slot, i) => {
    if (slot.pending && !slot.order) fillSlot(ctx, i);
  });
}

/** Заполняет все слоты в начале партии. */
export function fillAllSlots(ctx: Ctx): void {
  ctx.s.orders.slots.forEach((_, i) => fillSlot(ctx, i));
}

// ---------- Сдача заказа ----------

export interface RequirementStatus extends OrderRequirement {
  onBoard: number;
  inStorage: number;
  /** Сколько засчитывается в заказ (хранилище — только при `allowFromStorage`). */
  available: number;
}

/** Сколько требуемых предметов есть у игрока; пузыри и замки не считаются. */
export function orderStatus(
  rules: Rules,
  s: GameState | Draft<GameState>,
  order: Order,
): { requirements: RequirementStatus[]; ready: boolean } {
  const requirements = order.requirements.map((r) => {
    // Предметы в пузырях и закрытых клетках в заказы не засчитываются.
    const onBoard = s.board.cells.filter((_, i) => {
      const e = activeItemAt(s, i);
      return !!e && e.chain === r.chain && e.level === r.level;
    }).length;
    const inStorage =
      s.storage.find((st) => st.kind === 'item' && st.chain === r.chain && st.level === r.level)
        ?.count ?? 0;
    const available = onBoard + (rules.orders.allowFromStorage ? inStorage : 0);
    return { ...r, onBoard, inStorage, available };
  });
  return { requirements, ready: requirements.every((r) => r.available >= r.count) };
}

export function deliverOrder(ctx: Ctx, slotIndex: number): RejectReason | undefined {
  const { s, rules } = ctx;
  const slot = s.orders.slots[slotIndex];
  const order = slot?.order;
  if (!slot || !order) return 'reject.noOrder';
  const status = orderStatus(rules, s, order);
  if (!status.ready) return 'reject.orderNotReady';

  // DECISION: сначала списываются предметы с доски (в порядке чтения), затем из хранилища.
  for (const r of order.requirements) {
    let left = r.count;
    for (let i = 0; i < s.board.cells.length && left > 0; i++) {
      const e = activeItemAt(s, i);
      if (e && e.chain === r.chain && e.level === r.level) {
        s.board.cells[i] = null;
        left--;
      }
    }
    if (left > 0) {
      const st = s.storage.find(
        (x) => x.kind === 'item' && x.chain === r.chain && x.level === r.level,
      )!;
      st.count -= left;
      if (st.count === 0) s.storage.splice(s.storage.indexOf(st), 1);
    }
  }

  const done: Order = isDraft(order) ? current(order) : order;
  emitNow(ctx, {
    type: 'order_completed',
    orderId: done.id,
    template: done.template,
    requirements: done.requirements,
    rewards: done.rewards,
    totalValue: done.totalValue,
  });
  slot.order = null;
  slot.refillAt = s.nowMs + rules.orders.refillMs;
  for (const reward of done.rewards) grantReward(ctx, reward, 'order');
  onOrderCompleted(ctx);
  // Нулевая задержка — новый заказ сразу.
  if (rules.orders.refillMs === 0) refillSlot(ctx, slotIndex);
  return undefined;
}
