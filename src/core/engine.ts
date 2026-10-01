import { produce, type Draft } from 'immer';
import type { GameConfig } from '@/config';
import { cellOf, entityAt, inBoard, indexOf, nearestFreeCell } from './board';
import { RNG_STREAMS, pickWeighted, seedRng, type RngState, type RngStream } from './rng';
import { compileRules, generatorLevel, type Rules } from './rules';
import type {
  ApplyResult,
  Command,
  Entity,
  GameEvent,
  GameState,
  GeneratorEntity,
  RejectReason,
} from './types';

export interface Engine {
  rules: Rules;
  initialState(): GameState;
  /** Чистая функция: то же состояние и команда всегда дают тот же результат. */
  apply(state: GameState, command: Command): ApplyResult;
}

type Emit = (event: GameEvent) => void;
type Handler<C extends Command> = (
  draft: Draft<GameState>,
  command: C,
  emit: Emit,
) => RejectReason | undefined;

export function createEngine(config: GameConfig): Engine {
  const rules = compileRules(config);

  function initialState(): GameState {
    const rng = Object.fromEntries(
      RNG_STREAMS.map((s) => [s, seedRng(config.meta.seed, s)]),
    ) as Record<RngStream, RngState>;
    let nextUid = 1;
    const cells = rules.board.initial.map((c): Entity | null => {
      if (!c) return null;
      if (c.kind === 'item') return { uid: nextUid++, ...c };
      const cooldown = generatorLevel(rules, c.generator, c.level).cooldown;
      return {
        uid: nextUid++,
        ...c,
        charges: cooldown ? cooldown.charges : null,
        cooldownUntil: null,
      };
    });
    const { start, max, regenMs } = rules.energy;
    return {
      version: 1,
      nowMs: 0,
      nextUid,
      rng,
      board: { width: rules.board.width, height: rules.board.height, cells },
      energy: { value: start, nextRegenAt: start < max ? regenMs : null },
    };
  }

  // ---------- Энергия ----------

  /** Запускает таймер восстановления, если энергия ниже максимума и таймер не идёт. */
  function ensureRegen(s: Draft<GameState>) {
    if (s.energy.value < rules.energy.max && s.energy.nextRegenAt === null) {
      s.energy.nextRegenAt = s.nowMs + rules.energy.regenMs;
    }
  }

  function regenStep(s: Draft<GameState>) {
    const { max, regenAmount, regenMs } = rules.energy;
    if (s.energy.value < max) s.energy.value = Math.min(max, s.energy.value + regenAmount);
    // Пока энергия не ниже максимума (в том числе сверх него), восстановление не идёт.
    s.energy.nextRegenAt = s.energy.value < max ? s.nowMs + regenMs : null;
  }

  // ---------- Генераторы ----------

  function freshGenerator(s: Draft<GameState>, generator: string, level: number): GeneratorEntity {
    const cooldown = generatorLevel(rules, generator, level).cooldown;
    return {
      uid: s.nextUid++,
      kind: 'generator',
      generator,
      level,
      charges: cooldown ? cooldown.charges : null,
      cooldownUntil: null,
    };
  }

  const tapGenerator: Handler<Extract<Command, { type: 'tapGenerator' }>> = (s, { at }, emit) => {
    if (!inBoard(s.board, at)) return 'reject.outOfBoard';
    const gen = entityAt(s.board, at);
    if (!gen || gen.kind !== 'generator') return 'reject.notGenerator';
    const lvl = generatorLevel(rules, gen.generator, gen.level);
    if (gen.cooldownUntil !== null) return 'reject.cooldown';
    if (s.energy.value < lvl.energyCost) return 'reject.noEnergy';
    const target = nearestFreeCell(s.board, at);
    if (!target) return 'reject.boardFull';

    const produced = pickWeighted(s.rng.generators, lvl.produces, (p) => p.weight);
    // Веса проверены схемой (не отрицательные); нулевая сумма весов ловится валидатором.
    if (!produced) return 'reject.boardFull';

    const t = s.nowMs;
    if (lvl.energyCost > 0) {
      s.energy.value -= lvl.energyCost;
      ensureRegen(s);
      emit({
        type: 'energy_spent',
        t,
        generator: gen.generator,
        level: gen.level,
        amount: lvl.energyCost,
      });
    }

    s.board.cells[indexOf(s.board, target)] = {
      uid: s.nextUid++,
      kind: 'item',
      chain: produced.chain,
      level: produced.level,
    };
    emit({
      type: 'item_spawned',
      t,
      chain: produced.chain,
      level: produced.level,
      source: 'generator',
      generator: gen.generator,
      at: target,
    });

    if (gen.charges !== null && lvl.cooldown) {
      gen.charges -= 1;
      if (gen.charges <= 0) {
        gen.charges = 0;
        gen.cooldownUntil = t + lvl.cooldown.ms;
        emit({
          type: 'generator_cooldown_started',
          t,
          generator: gen.generator,
          level: gen.level,
          at: { ...at },
          untilMs: gen.cooldownUntil,
        });
      }
    }
    return undefined;
  };

  // ---------- Перемещение и слияние ----------

  function canMerge(a: Entity, b: Entity): boolean {
    if (a.kind === 'item' && b.kind === 'item') {
      return (
        a.chain === b.chain && a.level === b.level && a.level < rules.chains.get(a.chain)!.maxLevel
      );
    }
    if (a.kind === 'generator' && b.kind === 'generator') {
      return (
        a.generator === b.generator &&
        a.level === b.level &&
        a.level < rules.generators.get(a.generator)!.maxLevel
      );
    }
    return false;
  }

  const move: Handler<Extract<Command, { type: 'move' }>> = (s, { from, to }, emit) => {
    if (!inBoard(s.board, from) || !inBoard(s.board, to)) return 'reject.outOfBoard';
    if (from.x === to.x && from.y === to.y) return 'reject.sameCell';
    const fromIdx = indexOf(s.board, from);
    const toIdx = indexOf(s.board, to);
    const a = s.board.cells[fromIdx] ?? null;
    if (!a) return 'reject.emptyCell';
    const b = s.board.cells[toIdx] ?? null;

    if (!b) {
      s.board.cells[toIdx] = a;
      s.board.cells[fromIdx] = null;
      return undefined;
    }

    if (canMerge(a, b)) {
      const at = { ...to };
      if (a.kind === 'item') {
        s.board.cells[toIdx] = {
          uid: s.nextUid++,
          kind: 'item',
          chain: a.chain,
          level: a.level + 1,
        };
        emit({
          type: 'merge',
          t: s.nowMs,
          kind: 'item',
          chain: a.chain,
          fromLevel: a.level,
          toLevel: a.level + 1,
          at,
        });
      } else if (a.kind === 'generator') {
        // Новый генератор стартует с полным запасом зарядов и без кулдауна.
        s.board.cells[toIdx] = freshGenerator(s, a.generator, a.level + 1);
        emit({
          type: 'merge',
          t: s.nowMs,
          kind: 'generator',
          generator: a.generator,
          fromLevel: a.level,
          toLevel: a.level + 1,
          at,
        });
      }
      s.board.cells[fromIdx] = null;
      return undefined;
    }

    // DECISION: перенос на другой предмет меняет их местами (ТЗ этого не описывает).
    s.board.cells[toIdx] = a;
    s.board.cells[fromIdx] = b;
    return undefined;
  };

  // ---------- Время ----------

  type Timer = { at: number; order: number; run: () => void };

  /** Таймеры, которые сработают не позже `limit`, в порядке срабатывания. */
  function nextTimer(s: Draft<GameState>, limit: number, emit: Emit): Timer | null {
    let best: Timer | null = null;
    const consider = (timer: Timer) => {
      if (timer.at > limit) return;
      if (!best || timer.at < best.at || (timer.at === best.at && timer.order < best.order))
        best = timer;
    };

    const regenAt = s.energy.nextRegenAt;
    if (regenAt !== null) consider({ at: regenAt, order: -1, run: () => regenStep(s) });

    s.board.cells.forEach((e, i) => {
      if (e?.kind !== 'generator' || e.cooldownUntil === null) return;
      consider({
        at: e.cooldownUntil,
        order: i,
        run: () => {
          const lvl = generatorLevel(rules, e.generator, e.level);
          e.cooldownUntil = null;
          e.charges = lvl.cooldown ? lvl.cooldown.charges : null;
          emit({
            type: 'generator_cooldown_ended',
            t: s.nowMs,
            generator: e.generator,
            level: e.level,
            at: cellOf(s.board, i),
          });
        },
      });
    });
    return best;
  }

  /**
   * Продвигает время, обрабатывая таймеры строго по порядку. Поэтому `tick(a)` + `tick(b)`
   * даёт то же состояние, что `tick(a + b)`: от частоты кадров результат не зависит.
   */
  const tick: Handler<Extract<Command, { type: 'tick' }>> = (s, { dtMs }, emit) => {
    const target = s.nowMs + Math.max(0, Math.floor(dtMs));
    for (let timer = nextTimer(s, target, emit); timer; timer = nextTimer(s, target, emit)) {
      s.nowMs = timer.at;
      timer.run();
    }
    s.nowMs = target;
    return undefined;
  };

  // ---------- Применение команды ----------

  function apply(state: GameState, command: Command): ApplyResult {
    const events: GameEvent[] = [];
    const emit: Emit = (e) => events.push(e);
    let rejected: RejectReason | undefined;
    const next = produce(state, (draft) => {
      switch (command.type) {
        case 'tick':
          rejected = tick(draft, command, emit);
          break;
        case 'move':
          rejected = move(draft, command, emit);
          break;
        case 'tapGenerator':
          rejected = tapGenerator(draft, command, emit);
          break;
      }
    });
    // При отказе возвращается исходное состояние, даже если обработчик успел что-то изменить в черновике.
    if (rejected) return { state, events: [], rejected };
    return { state: next, events };
  }

  return { rules, initialState, apply };
}
