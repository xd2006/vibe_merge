import type { StringKey } from '@/i18n/ru';
import type { RngState, RngStream } from './rng';

export interface Cell {
  x: number;
  y: number;
}

export interface ItemEntity {
  /** Уникален в пределах партии; рендер по нему отслеживает предмет между состояниями. */
  uid: number;
  kind: 'item';
  chain: string;
  level: number;
}

export interface GeneratorEntity {
  uid: number;
  kind: 'generator';
  generator: string;
  level: number;
  /** Сколько предметов осталось до кулдауна; `null`, если у уровня нет кулдауна. */
  charges: number | null;
  /** Время окончания кулдауна (игровое время, мс); `null`, если генератор не на кулдауне. */
  cooldownUntil: number | null;
}

export type Entity = ItemEntity | GeneratorEntity;

export interface GameState {
  version: 1;
  /** Игровое время с начала партии, мс. Меняется только командой `tick`. */
  nowMs: number;
  nextUid: number;
  rng: Record<RngStream, RngState>;
  board: {
    width: number;
    height: number;
    /** Клетки построчно: индекс `y * width + x`. */
    cells: (Entity | null)[];
  };
  energy: {
    value: number;
    /** Когда начислится следующая порция энергии; `null`, если восстановление не идёт. */
    nextRegenAt: number | null;
  };
}

export type Command =
  | { type: 'tick'; dtMs: number }
  /** Перенос предмета. На такой же предмет — слияние, на другой — обмен местами. */
  | { type: 'move'; from: Cell; to: Cell }
  | { type: 'tapGenerator'; at: Cell };

type EventBody =
  | { type: 'energy_spent'; generator: string; level: number; amount: number }
  | {
      type: 'item_spawned';
      chain: string;
      level: number;
      source: 'generator';
      generator: string;
      at: Cell;
    }
  | { type: 'merge'; kind: 'item'; chain: string; fromLevel: number; toLevel: number; at: Cell }
  | {
      type: 'merge';
      kind: 'generator';
      generator: string;
      fromLevel: number;
      toLevel: number;
      at: Cell;
    }
  | {
      type: 'generator_cooldown_started';
      generator: string;
      level: number;
      at: Cell;
      untilMs: number;
    }
  | { type: 'generator_cooldown_ended'; generator: string; level: number; at: Cell };

/** Событие журнала; `t` — игровое время события, мс. */
export type GameEvent = EventBody & { t: number };
export type GameEventType = GameEvent['type'];

export type RejectReason = Extract<
  StringKey,
  | 'reject.noEnergy'
  | 'reject.boardFull'
  | 'reject.cooldown'
  | 'reject.notGenerator'
  | 'reject.emptyCell'
  | 'reject.sameCell'
  | 'reject.outOfBoard'
>;

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  /** Причина отказа; при отказе состояние не меняется. Ключ строки для `t()`. */
  rejected?: RejectReason;
}
