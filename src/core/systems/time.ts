import type { Ctx } from '../context';
import { expireBonus, maybeStartBonus } from './bonus';
import { expireBubble, spawnTimerBubble } from './bubbles';
import { regenStep } from './energy';
import { endCooldown } from './generators';
import { refillSlot, retryPendingSlots } from './orders';

interface Timer {
  at: number;
  /** Порядок при совпадении времени: категория, затем индекс. */
  order: number;
  run: () => void;
}

// Категории таймеров в порядке обработки при одинаковом времени.
const ENERGY = 0;
const COOLDOWN = 1;
const BUBBLE_EXPIRE = 2;
const BUBBLE_SPAWN = 3;
const ORDER_REFILL = 4;
const BONUS_EXPIRE = 5;
const order = (category: number, index: number) => category * 1_000_000 + index;

/** Ближайший таймер, который сработает не позже `limit`. */
function nextTimer(ctx: Ctx, limit: number): Timer | null {
  const { s } = ctx;
  let best: Timer | null = null;
  const consider = (timer: Timer) => {
    if (timer.at > limit) return;
    if (!best || timer.at < best.at || (timer.at === best.at && timer.order < best.order)) {
      best = timer;
    }
  };

  if (s.energy.nextRegenAt !== null) {
    consider({ at: s.energy.nextRegenAt, order: order(ENERGY, 0), run: () => regenStep(ctx) });
  }
  s.board.cells.forEach((e, i) => {
    if (e?.kind === 'generator' && e.cooldownUntil !== null) {
      consider({ at: e.cooldownUntil, order: order(COOLDOWN, i), run: () => endCooldown(ctx, i) });
    }
    if (e?.kind === 'item' && e.bubble && e.bubble.expiresAt !== null) {
      consider({
        at: e.bubble.expiresAt,
        order: order(BUBBLE_EXPIRE, i),
        run: () => expireBubble(ctx, i),
      });
    }
  });
  s.bubbleTimers.forEach((at, i) => {
    consider({ at, order: order(BUBBLE_SPAWN, i), run: () => spawnTimerBubble(ctx, i) });
  });
  s.orders.slots.forEach((slot, i) => {
    if (slot.refillAt !== null) {
      consider({ at: slot.refillAt, order: order(ORDER_REFILL, i), run: () => refillSlot(ctx, i) });
    }
  });
  if (s.bonus.active) {
    const at = s.bonus.active.expiresAt;
    consider({ at, order: order(BONUS_EXPIRE, 0), run: () => expireBonus(ctx) });
  }
  return best;
}

/**
 * Продвигает время, обрабатывая таймеры строго по порядку. Поэтому `tick(a)` + `tick(b)`
 * даёт то же состояние, что `tick(a + b)`: от частоты кадров результат не зависит.
 * Это же делает офлайн-прогресс одним длинным тиком.
 */
export function advanceTime(ctx: Ctx, dtMs: number): void {
  const target = ctx.s.nowMs + Math.max(0, Math.floor(dtMs));
  for (let timer = nextTimer(ctx, target); timer; timer = nextTimer(ctx, target)) {
    ctx.s.nowMs = timer.at;
    timer.run();
    // Таймер мог изменить условия (например, появился предмет) — ожидающие слоты пробуют снова.
    retryPendingSlots(ctx);
    maybeStartBonus(ctx);
  }
  ctx.s.nowMs = target;
}
