import { entityAt, inBoard, indexOf } from '../board';
import {
  addToStorage,
  boardLevelId,
  emitNow,
  newGenerator,
  newItem,
  place,
  subjectOf,
  toAmount,
  type Ctx,
} from '../context';
import {
  chainLevel,
  itemValue,
  type CollectRules,
  type ItemActionRules,
  type Rules,
} from '../rules';
import { checkOpen } from './cells';
import { grantReward, resolveRewards } from './rewards';
import type { Cell, Entity, GameState, ItemAction, RejectReason, Subject } from '../types';

/** Совпадает ли предмет с шаблоном `цепочка.уровень`, `цепочка.*`, `generator.id` или `*`. */
export function matchesPattern(pattern: string, subject: Subject): boolean {
  if (pattern === '*') return true;
  const [head, tail] = pattern.split('.') as [string, string];
  if (head === 'generator') return subject.kind === 'generator' && subject.generator === tail;
  if (subject.kind !== 'item' || subject.chain !== head) return false;
  return tail === '*' || Number(tail) === subject.level;
}

/** Первое совпавшее правило `itemActions` (правила проверяются сверху вниз). */
export function actionRuleFor(rules: Rules, subject: Subject): ItemActionRules | null {
  return rules.itemActions.find((r) => matchesPattern(r.match, subject)) ?? null;
}

export interface AvailableActions {
  pickUp: boolean;
  delete: boolean;
  /** Сколько хард-валюты даст продажа; `null` — продажа недоступна. */
  sell: number | null;
  /** Сбор двойным тапом: на склад или в награды; `null` — не собирается. */
  collect: CollectRules;
}

/** Флаг `deletable` у уровня цепочки или генератора; `undefined` — не задан. */
function deletableFlag(rules: Rules, subject: Subject): boolean | undefined {
  if (subject.kind === 'item') return chainLevel(rules, subject.chain, subject.level)?.deletable;
  return rules.generators.get(subject.generator)?.levels[subject.level - 1]?.deletable;
}

/** Какие действия доступны для сущности на доске (для интерфейса и проверки команд). */
export function availableActions(rules: Rules, s: GameState, e: Entity): AvailableActions {
  const none = { pickUp: false, delete: false, sell: null, collect: null };
  const subject = subjectOf(e);
  if (!subject || (e.kind === 'item' && e.bubble)) return none;
  const rule = actionRuleFor(rules, subject);
  const collect =
    subject.kind === 'item'
      ? (chainLevel(rules, subject.chain, subject.level)?.collect ?? null)
      : null;
  // Флаг объекта важнее правил itemActions.
  const del = deletableFlag(rules, subject) ?? rule?.delete ?? false;
  if (!rule) return { ...none, delete: del, collect };
  const value = subject.kind === 'item' ? itemValue(rules, subject.chain, subject.level) : 0;
  return {
    collect,
    pickUp: rule.pickUp && rules.storage.enabled,
    delete: del,
    sell: rule.sell
      ? toAmount(
          rule.sell({
            itemValue: value,
            level: subject.level,
            boardLevel: boardLevelId(rules, s),
            ordersDone: s.level.totalOrdersDone,
          }),
        )
      : null,
  };
}

export function itemAction(ctx: Ctx, at: Cell, action: ItemAction): RejectReason | undefined {
  const { s, rules } = ctx;
  if (!inBoard(s.board, at)) return 'reject.outOfBoard';
  const e = entityAt(s.board, at);
  if (!e) return 'reject.emptyCell';
  const closed = checkOpen(ctx, at);
  if (closed) return closed;
  if (e.kind === 'item' && e.bubble) return 'reject.bubble';
  const subject = subjectOf(e)!;
  const actions = availableActions(rules, s, e);
  const cell = { ...at };

  if (action === 'pickUp') {
    if (!rules.storage.enabled) return 'reject.storageDisabled';
    if (!actions.pickUp) return 'reject.notAllowed';
    // DECISION: генератор на кулдауне забрать нельзя — из хранилища он вернулся бы с полными зарядами.
    if (e.kind === 'generator' && e.cooldownUntil !== null) return 'reject.cooldown';
    addToStorage(ctx, subject);
    emitNow(ctx, { type: 'item_picked', subject, at: cell });
  } else if (action === 'delete') {
    if (!actions.delete) return 'reject.notAllowed';
    emitNow(ctx, { type: 'item_deleted', subject, at: cell });
  } else {
    if (actions.sell === null) return 'reject.notAllowed';
    s.hard += actions.sell;
    emitNow(ctx, { type: 'item_sold', subject, at: cell, amount: actions.sell });
  }
  s.board.cells[indexOf(s.board, at)] = null;
  return undefined;
}

/**
 * Сбор предмета двойным тапом: специя уходит на склад (без награды), призовой предмет
 * превращается в награды. Остальные предметы не собираются.
 */
export function collect(ctx: Ctx, at: Cell): RejectReason | undefined {
  const { s, rules } = ctx;
  if (!inBoard(s.board, at)) return 'reject.outOfBoard';
  const e = entityAt(s.board, at);
  if (!e) return 'reject.emptyCell';
  const closed = checkOpen(ctx, at);
  if (closed) return closed;
  if (e.kind !== 'item') return 'reject.notCollectable';
  if (e.bubble) return 'reject.bubble';
  const how = availableActions(rules, s, e).collect;
  if (!how) return 'reject.notCollectable';

  const cell = { ...at };
  const { chain, level } = e;
  s.board.cells[indexOf(s.board, at)] = null;
  if (how === 'storage') {
    // DECISION: собранная специя попадает на склад даже при выключенном хранилище
    // (`storage.enabled` управляет только действием «Забрать»).
    addToStorage(ctx, { kind: 'item', chain, level });
    emitNow(ctx, { type: 'item_collected', chain, level, at: cell, to: 'storage' });
  } else {
    emitNow(ctx, { type: 'item_collected', chain, level, at: cell, to: 'reward' });
    for (const reward of resolveRewards(ctx, how, 0)) grantReward(ctx, reward, 'collect');
  }
  return undefined;
}

export function returnFromStorage(ctx: Ctx, key: string, to: Cell): RejectReason | undefined {
  const { s, rules } = ctx;
  if (!rules.storage.enabled || !rules.storage.returnToBoard) return 'reject.returnDisabled';
  const index = s.storage.findIndex((st) => st.key === key);
  const stack = s.storage[index];
  if (!stack || stack.count <= 0) return 'reject.notInStorage';
  if (!inBoard(s.board, to)) return 'reject.outOfBoard';
  const closed = checkOpen(ctx, to);
  if (closed) return closed;
  if (entityAt(s.board, to)) return 'reject.cellOccupied';

  const subject: Subject =
    stack.kind === 'item'
      ? { kind: 'item', chain: stack.chain, level: stack.level }
      : { kind: 'generator', generator: stack.generator, level: stack.level };
  place(
    ctx,
    to,
    subject.kind === 'item'
      ? newItem(ctx, subject.chain, subject.level)
      : newGenerator(ctx, subject.generator, subject.level),
  );
  stack.count -= 1;
  if (stack.count === 0) s.storage.splice(index, 1);
  emitNow(ctx, { type: 'item_returned', subject, at: { ...to } });
  return undefined;
}
