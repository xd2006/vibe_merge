import type { Draft } from 'immer';
import { cellOf, entityAt, inBoard, indexOf, nearestFreeCell } from '../board';
import { emitNow, freshGenerator, fullBag, newItem, place, type Ctx } from '../context';
import { pickWeighted } from '../rng';
import { generatorLevel, type GeneratorLevelRules, type Rules } from '../rules';
import type { Cell, GameState, GeneratorEntity, RejectReason } from '../types';
import { maybeBubbleOnGenerate } from './bubbles';
import { checkOpen } from './cells';
import { spendEnergy } from './energy';

/** Что выдаст следующий тап: в режиме мешка — из остатка мешка, в режиме весов — по весам. */
function pickProduce(ctx: Ctx, gen: Draft<GeneratorEntity>, lvl: GeneratorLevelRules) {
  if (lvl.mode === 'bag' && gen.bag) {
    const index = pickWeighted(
      ctx.s.rng.generators,
      lvl.produces.map((_, i) => i),
      (i) => gen.bag![i] ?? 0,
    );
    if (index === undefined) return null;
    gen.bag[index]! -= 1;
    return lvl.produces[index]!;
  }
  return pickWeighted(ctx.s.rng.generators, lvl.produces, (p) => p.weight) ?? null;
}

function startCooldown(ctx: Ctx, gen: Draft<GeneratorEntity>, at: Cell, ms: number): void {
  gen.cooldownUntil = ctx.s.nowMs + ms;
  emitNow(ctx, {
    type: 'generator_cooldown_started',
    generator: gen.generator,
    level: gen.level,
    at: { ...at },
    untilMs: gen.cooldownUntil,
  });
}

/**
 * Учёт тапа: заряды и кулдаун в режиме весов, циклы мешка, исчезновение после `uses`.
 * Возвращает true, если генератор исчез с поля.
 */
function afterTap(
  ctx: Ctx,
  gen: Draft<GeneratorEntity>,
  lvl: GeneratorLevelRules,
  at: Cell,
): boolean {
  const { s } = ctx;
  // Сюда доходим, только если тап «использовал» генератор: в режиме мешка — завершил цикл.
  if (lvl.mode === 'bag') {
    const empty = !gen.bag || gen.bag.every((n) => n <= 0);
    if (!empty) return false;
    // Мешок опустел — цикл пройден.
    gen.bag = fullBag(ctx.rules, gen.generator, gen.level);
    if (gen.cyclesLeft !== null && lvl.cooldown) {
      gen.cyclesLeft -= 1;
      if (gen.cyclesLeft <= 0) {
        gen.cyclesLeft = 0;
        startCooldown(ctx, gen, at, lvl.cooldown.ms);
      }
    }
  } else {
    if (gen.charges !== null && lvl.cooldown) {
      gen.charges -= 1;
      if (gen.charges <= 0) {
        gen.charges = 0;
        startCooldown(ctx, gen, at, lvl.cooldown.ms);
      }
    }
  }
  if (gen.usesLeft !== null) {
    gen.usesLeft -= 1;
    if (gen.usesLeft <= 0) {
      s.board.cells[indexOf(s.board, at)] = null;
      emitNow(ctx, {
        type: 'generator_depleted',
        generator: gen.generator,
        level: gen.level,
        at: { ...at },
      });
      return true;
    }
  }
  return false;
}

export function tapGenerator(ctx: Ctx, at: Cell): RejectReason | undefined {
  const { s, rules } = ctx;
  if (!inBoard(s.board, at)) return 'reject.outOfBoard';
  const gen = entityAt(s.board, at);
  if (!gen || gen.kind !== 'generator') return 'reject.notGenerator';
  const closed = checkOpen(ctx, at);
  if (closed) return closed;
  const lvl = generatorLevel(rules, gen.generator, gen.level);
  if (gen.cooldownUntil !== null) return 'reject.cooldown';
  if (s.energy.value < lvl.energyCost) return 'reject.noEnergy';
  const target = nearestFreeCell(s.board, at);
  if (!target) return 'reject.boardFull';

  const produced = pickProduce(ctx, gen, lvl);
  // Нулевая сумма весов или пустой мешок — ошибка конфига, её ловит валидатор.
  if (!produced) return 'reject.boardFull';

  if (lvl.energyCost > 0) {
    spendEnergy(ctx, lvl.energyCost);
    emitNow(ctx, {
      type: 'energy_spent',
      generator: gen.generator,
      level: gen.level,
      amount: lvl.energyCost,
    });
  }

  const item = newItem(ctx, produced.chain, produced.level);
  const inBubble = maybeBubbleOnGenerate(ctx, item);
  place(ctx, target, item);
  emitNow(ctx, {
    type: 'item_spawned',
    chain: produced.chain,
    level: produced.level,
    source: 'generator',
    generator: gen.generator,
    at: target,
    ...(inBubble ? { inBubble: true as const } : {}),
  });

  afterTap(ctx, gen, lvl, at);
  return undefined;
}

/** Кулдаун генератора в клетке `index` закончился: заряды и циклы восстанавливаются. */
export function endCooldown(ctx: Ctx, index: number): void {
  const e = ctx.s.board.cells[index];
  if (e?.kind !== 'generator') return;
  const fresh = freshGenerator(ctx.rules, e.generator, e.level);
  e.cooldownUntil = null;
  e.charges = fresh.charges;
  e.cyclesLeft = fresh.cyclesLeft;
  // Мешок и остаток `uses` не сбрасываются: мешок уже набран на новый цикл.
  emitNow(ctx, {
    type: 'generator_cooldown_ended',
    generator: e.generator,
    level: e.level,
    at: cellOf(ctx.s.board, index),
  });
}

/**
 * Цена пропуска кулдауна: падает пропорционально оставшемуся времени (с округлением вверх);
 * в последние `freeSkipSec` — бесплатно. `null` — генератор не на кулдауне.
 */
export function skipCooldownCost(rules: Rules, s: GameState, gen: GeneratorEntity): number | null {
  if (gen.cooldownUntil === null) return null;
  const cd = generatorLevel(rules, gen.generator, gen.level).cooldown;
  if (!cd) return null;
  const remaining = Math.max(0, gen.cooldownUntil - s.nowMs);
  if (remaining <= cd.freeSkipMs) return 0;
  return Math.ceil((cd.skipCost * remaining) / cd.ms);
}

export function skipCooldown(ctx: Ctx, at: Cell): RejectReason | undefined {
  const { s, rules } = ctx;
  if (!inBoard(s.board, at)) return 'reject.outOfBoard';
  const gen = entityAt(s.board, at);
  if (!gen || gen.kind !== 'generator') return 'reject.notGenerator';
  const closed = checkOpen(ctx, at);
  if (closed) return closed;
  const cost = skipCooldownCost(rules, s, gen);
  if (cost === null) return 'reject.notOnCooldown';
  if (s.hard < cost) return 'reject.noHard';
  const remainingMs = Math.max(0, gen.cooldownUntil! - s.nowMs);
  s.hard -= cost;
  emitNow(ctx, {
    type: 'generator_cooldown_skipped',
    generator: gen.generator,
    level: gen.level,
    at: { ...at },
    cost,
    remainingMs,
  });
  endCooldown(ctx, indexOf(s.board, at));
  return undefined;
}
