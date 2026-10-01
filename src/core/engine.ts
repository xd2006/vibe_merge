import { produce } from 'immer';
import type { GameConfig } from '@/config';
import type { Ctx } from './context';
import { RNG_STREAMS, seedRng, type RngState, type RngStream } from './rng';
import { compileRules, generatorLevel, type Rules } from './rules';
import { popBubble } from './systems/bubbles';
import { cheat } from './systems/cheats';
import { tapGenerator } from './systems/generators';
import { move, unlockGroups } from './systems/moves';
import { deliverOrder, fillAllSlots, retryPendingSlots } from './systems/orders';
import { itemAction, returnFromStorage } from './systems/storage';
import { advanceTime } from './systems/time';
import type { ApplyResult, Command, Entity, GameEvent, GameState, RejectReason } from './types';

export interface Engine {
  rules: Rules;
  initialState(): GameState;
  /** Чистая функция: то же состояние и команда всегда дают тот же результат. */
  apply(state: GameState, command: Command): ApplyResult;
}

export function createEngine(config: GameConfig): Engine {
  const rules = compileRules(config);

  function initialState(): GameState {
    const rng = Object.fromEntries(
      RNG_STREAMS.map((s) => [s, seedRng(config.meta.seed, s)]),
    ) as Record<RngStream, RngState>;
    let nextUid = 1;
    const cells = rules.board.initial.map((c): Entity | null => {
      if (!c) return null;
      if (c.kind !== 'generator') return { uid: nextUid++, ...c };
      const cooldown = generatorLevel(rules, c.generator, c.level).cooldown;
      return {
        uid: nextUid++,
        ...c,
        charges: cooldown ? cooldown.charges : null,
        cooldownUntil: null,
      };
    });
    const { start, max, regenMs } = rules.energy;
    const base: GameState = {
      version: 1,
      nowMs: 0,
      nextUid,
      nextOrderId: 1,
      rng,
      board: { width: rules.board.width, height: rules.board.height, cells },
      energy: { value: start, nextRegenAt: start < max ? regenMs : null },
      hard: config.currencies.hard.start,
      storage: [],
      level: { index: 0, ordersDone: 0, totalOrdersDone: 0, completedAll: false },
      lockGroups: Object.fromEntries(rules.lockGroups.map((g) => [g, 'sealed' as const])),
      orders: {
        slots: Array.from({ length: rules.orders.slots }, () => ({
          order: null,
          refillAt: null,
          pending: false,
        })),
        stopped: false,
      },
      bubbleTimers: rules.bubbles.timers.map((timer) => timer.everyMs),
    };
    // Начальные события (первые заказы) не нужны вызывающему: это часть стартового состояния.
    return produce(base, (s) => {
      const ctx: Ctx = { rules, s, emit: () => {} };
      unlockGroups(ctx, rules.levels[0]!.unlocks);
      fillAllSlots(ctx);
    });
  }

  function handle(ctx: Ctx, command: Command): RejectReason | undefined {
    switch (command.type) {
      case 'tick':
        advanceTime(ctx, command.dtMs);
        return undefined;
      case 'move':
        return move(ctx, command.from, command.to);
      case 'tapGenerator':
        return tapGenerator(ctx, command.at);
      case 'popBubble':
        return popBubble(ctx, command.at);
      case 'itemAction':
        return itemAction(ctx, command.at, command.action);
      case 'returnFromStorage':
        return returnFromStorage(ctx, command.key, command.to);
      case 'deliverOrder':
        return deliverOrder(ctx, command.slot);
      case 'cheat':
        return cheat(ctx, command);
    }
  }

  function apply(state: GameState, command: Command): ApplyResult {
    const events: GameEvent[] = [];
    const emit = (e: GameEvent) =>
      events.push(command.type === 'cheat' ? { ...e, cheat: true } : e);
    let rejected: RejectReason | undefined;
    const next = produce(state, (s) => {
      const ctx: Ctx = { rules, s, emit };
      rejected = handle(ctx, command);
      // Команда могла изменить условия достижимости — ожидающие слоты заказов пробуют снова.
      if (!rejected) retryPendingSlots(ctx);
    });
    // При отказе возвращается исходное состояние, даже если обработчик успел что-то изменить в черновике.
    if (rejected) return { state, events: [], rejected };
    return { state: next, events };
  }

  return { rules, initialState, apply };
}
