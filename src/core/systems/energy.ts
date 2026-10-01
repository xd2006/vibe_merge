import type { Ctx } from '../context';

/** Запускает таймер восстановления, если энергия ниже максимума и таймер не идёт. */
export function ensureRegen(ctx: Ctx): void {
  const { s, rules } = ctx;
  if (s.energy.value < rules.energy.max && s.energy.nextRegenAt === null) {
    s.energy.nextRegenAt = s.nowMs + rules.energy.regenMs;
  }
}

export function regenStep(ctx: Ctx): void {
  const { s, rules } = ctx;
  const { max, regenAmount, regenMs } = rules.energy;
  if (s.energy.value < max) s.energy.value = Math.min(max, s.energy.value + regenAmount);
  // Пока энергия не ниже максимума (в том числе сверх него), восстановление не идёт.
  s.energy.nextRegenAt = s.energy.value < max ? s.nowMs + regenMs : null;
}

export function spendEnergy(ctx: Ctx, amount: number): void {
  ctx.s.energy.value -= amount;
  ensureRegen(ctx);
}

/** Добавляет энергию (награда): сверх максимума — только при `allowOverMax`. */
export function addEnergy(ctx: Ctx, amount: number): void {
  const { s, rules } = ctx;
  const { max, allowOverMax } = rules.energy;
  const target = s.energy.value + amount;
  s.energy.value = allowOverMax ? target : Math.max(s.energy.value, Math.min(max, target));
  if (s.energy.value >= max) s.energy.nextRegenAt = null;
  else ensureRegen(ctx);
}

/** Чит: энергия до максимума. */
export function refillEnergy(ctx: Ctx): void {
  const { s, rules } = ctx;
  if (s.energy.value < rules.energy.max) s.energy.value = rules.energy.max;
  s.energy.nextRegenAt = null;
}
