import type { Draft } from 'immer';
import { cellOf, indexOf } from './board';
import { generatorLevel, type Rules } from './rules';
import type {
  Cell,
  Entity,
  GameEvent,
  GameState,
  GeneratorEntity,
  ItemEntity,
  StorageStack,
  Subject,
} from './types';

/** Всё, что нужно системе ядра для обработки команды: правила, черновик состояния, журнал. */
export interface Ctx {
  rules: Rules;
  s: Draft<GameState>;
  emit: (event: GameEvent) => void;
}

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Событие с текущим игровым временем. */
export function emitNow(ctx: Ctx, event: DistributiveOmit<GameEvent, 't'>): void {
  ctx.emit({ ...event, t: ctx.s.nowMs } as GameEvent);
}

export function newItem(ctx: Ctx, chain: string, level: number): ItemEntity {
  return { uid: ctx.s.nextUid++, kind: 'item', chain, level };
}

/** Полный мешок уровня генератора (количество каждого вида, как в `produces`). */
export function fullBag(rules: Rules, generator: string, level: number): number[] {
  return generatorLevel(rules, generator, level).produces.map((p) => p.weight);
}

/** Состояние нового генератора: полный запас зарядов и циклов, без кулдауна. */
export function freshGenerator(
  rules: Rules,
  generator: string,
  level: number,
): Omit<GeneratorEntity, 'uid' | 'kind' | 'generator' | 'level'> {
  const lvl = generatorLevel(rules, generator, level);
  const bag = lvl.mode === 'bag';
  return {
    charges: !bag && lvl.cooldown ? lvl.cooldown.charges : null,
    bag: bag ? fullBag(rules, generator, level) : null,
    cyclesLeft: bag && lvl.cooldown ? lvl.cooldown.cycles : null,
    usesLeft: lvl.uses,
    cooldownUntil: null,
  };
}

/** Генератор с полным запасом зарядов и без кулдауна. */
export function newGenerator(ctx: Ctx, generator: string, level: number): GeneratorEntity {
  return {
    uid: ctx.s.nextUid++,
    kind: 'generator',
    generator,
    level,
    ...freshGenerator(ctx.rules, generator, level),
  };
}

export function subjectOf(e: Entity): Subject | null {
  if (e.kind === 'item') return { kind: 'item', chain: e.chain, level: e.level };
  if (e.kind === 'generator') return { kind: 'generator', generator: e.generator, level: e.level };
  return null;
}

export function subjectKey(s: Subject): string {
  return s.kind === 'item' ? `item:${s.chain}:${s.level}` : `generator:${s.generator}:${s.level}`;
}

/** Обычный предмет (не в пузыре) — его можно сливать, сдавать и т. п. */
export const isFreeItem = (e: Entity | null | undefined): e is ItemEntity =>
  e?.kind === 'item' && !e.bubble;

/** Первая свободная клетка в порядке чтения. */
export function firstFreeCell(s: Draft<GameState>): Cell | null {
  const i = s.board.cells.findIndex((c) => c === null);
  return i < 0 ? null : cellOf(s.board, i);
}

export function freeCells(s: Draft<GameState>): Cell[] {
  const out: Cell[] = [];
  s.board.cells.forEach((c, i) => {
    if (c === null) out.push(cellOf(s.board, i));
  });
  return out;
}

export function place(ctx: Ctx, at: Cell, entity: Entity): void {
  ctx.s.board.cells[indexOf(ctx.s.board, at)] = entity;
}

export function addToStorage(ctx: Ctx, subject: Subject, count = 1): void {
  const key = subjectKey(subject);
  const stack = ctx.s.storage.find((st) => st.key === key);
  if (stack) {
    stack.count += count;
    return;
  }
  ctx.s.storage.push({ ...subject, key, count } as StorageStack);
  // Стабильный порядок: по типу, id и уровню — так стопки не прыгают в интерфейсе.
  ctx.s.storage.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Номер текущего уровня доски (поле `id` уровня) — переменная `boardLevel` в формулах. */
export function boardLevelId(rules: Rules, s: GameState | Draft<GameState>): number {
  return rules.levels[s.level.index]?.id ?? 1;
}

/** Целое неотрицательное значение формулы награды или стоимости. */
export const toAmount = (v: number) => Math.max(0, Math.round(v));
