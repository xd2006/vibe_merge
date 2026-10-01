import { cellOf, entityAt, inBoard, nearestFreeCell } from '../board';
import { emitNow, newItem, place, type Ctx } from '../context';
import { pickWeighted } from '../rng';
import { generatorLevel } from '../rules';
import type { Cell, RejectReason } from '../types';
import { maybeBubbleOnGenerate } from './bubbles';
import { spendEnergy } from './energy';

export function tapGenerator(ctx: Ctx, at: Cell): RejectReason | undefined {
  const { s, rules } = ctx;
  if (!inBoard(s.board, at)) return 'reject.outOfBoard';
  const gen = entityAt(s.board, at);
  if (!gen || gen.kind !== 'generator') return 'reject.notGenerator';
  const lvl = generatorLevel(rules, gen.generator, gen.level);
  if (gen.cooldownUntil !== null) return 'reject.cooldown';
  if (s.energy.value < lvl.energyCost) return 'reject.noEnergy';
  const target = nearestFreeCell(s.board, at);
  if (!target) return 'reject.boardFull';

  const produced = pickWeighted(s.rng.generators, lvl.produces, (p) => p.weight);
  // Нулевая сумма весов — ошибка конфига, её ловит валидатор.
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

  if (gen.charges !== null && lvl.cooldown) {
    gen.charges -= 1;
    if (gen.charges <= 0) {
      gen.charges = 0;
      gen.cooldownUntil = s.nowMs + lvl.cooldown.ms;
      emitNow(ctx, {
        type: 'generator_cooldown_started',
        generator: gen.generator,
        level: gen.level,
        at: { ...at },
        untilMs: gen.cooldownUntil,
      });
    }
  }
  return undefined;
}

/** Кулдаун генератора в клетке `index` закончился: заряды восстанавливаются. */
export function endCooldown(ctx: Ctx, index: number): void {
  const e = ctx.s.board.cells[index];
  if (e?.kind !== 'generator') return;
  const lvl = generatorLevel(ctx.rules, e.generator, e.level);
  e.cooldownUntil = null;
  e.charges = lvl.cooldown ? lvl.cooldown.charges : null;
  emitNow(ctx, {
    type: 'generator_cooldown_ended',
    generator: e.generator,
    level: e.level,
    at: cellOf(ctx.s.board, index),
  });
}
