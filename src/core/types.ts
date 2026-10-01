import type { StringKey } from '@/i18n/ru';
import type { RngState, RngStream } from './rng';

export interface Cell {
  x: number;
  y: number;
}

export interface Bubble {
  /** Когда пузырь исчезнет вместе с предметом (игровое время, мс); `null` — бессрочно. */
  expiresAt: number | null;
  /** Номер правила в `bubbles.spawnRules`, по которому появился пузырь. */
  rule: number;
}

export interface ItemEntity {
  /** Уникален в пределах партии; рендер по нему отслеживает предмет между состояниями. */
  uid: number;
  kind: 'item';
  chain: string;
  level: number;
  /** Предмет заперт в пузыре: его нельзя двигать, сливать и сдавать, пока пузырь не лопнут. */
  bubble?: Bubble;
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

/** Заблокированная клетка с предметом-замком; открывается слиянием с таким же предметом. */
export interface LockEntity {
  uid: number;
  kind: 'lock';
  group: string;
  chain: string;
  level: number;
}

export type Entity = ItemEntity | GeneratorEntity | LockEntity;

/** Что за предмет, без состояния: для событий, хранилища и интерфейса. */
export type Subject =
  | { kind: 'item'; chain: string; level: number }
  | { kind: 'generator'; generator: string; level: number };

export type StorageStack = Subject & {
  /** `item:wood:2` или `generator:sawmill:1`. */
  key: string;
  count: number;
};

export interface OrderRequirement {
  chain: string;
  level: number;
  count: number;
}

export type ResolvedReward =
  | { type: 'energy'; amount: number }
  | { type: 'hard'; amount: number }
  | { type: 'item'; chain: string; level: number; count: number };

export interface Order {
  id: number;
  template: string;
  requirements: OrderRequirement[];
  totalValue: number;
  rewards: ResolvedReward[];
}

export interface OrderSlot {
  order: Order | null;
  /** Когда слот пополнится (игровое время, мс); `null`, если ничего не ждёт. */
  refillAt: number | null;
  /** Подходящего шаблона не нашлось (`skipSlot`): слот ждёт смены условий. */
  pending: boolean;
}

/** Состояние группы замков. Открытые клетки — обычные клетки, у группы отдельного статуса нет. */
export type LockGroupState = 'sealed' | 'unlockable';

export interface GameState {
  version: 1;
  /** Игровое время с начала партии, мс. Меняется только командой `tick`. */
  nowMs: number;
  nextUid: number;
  nextOrderId: number;
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
  hard: number;
  storage: StorageStack[];
  level: {
    /** Индекс текущего уровня в `levels`. */
    index: number;
    /** Заказов выполнено на текущем уровне. */
    ordersDone: number;
    /** Заказов выполнено за партию. */
    totalOrdersDone: number;
    /** Последний уровень пройден; заказы продолжают генерироваться. */
    completedAll: boolean;
  };
  lockGroups: Record<string, LockGroupState>;
  orders: {
    slots: OrderSlot[];
    /** Генерация остановлена (`onNoValidTemplate: error`). */
    stopped: boolean;
  };
  /** Время следующего появления пузыря по таймеру; индекс как в `rules.bubbles.timers`. */
  bubbleTimers: number[];
}

export type CheatCommand =
  | { type: 'cheat'; cheat: 'addHard' | 'refillEnergy' | 'skipLevel' }
  | { type: 'cheat'; cheat: 'skipTime'; minutes: number };

export type ItemAction = 'pickUp' | 'delete' | 'sell';

export type Command =
  | { type: 'tick'; dtMs: number }
  /** Перенос предмета. На такой же предмет — слияние, на другой — обмен местами. */
  | { type: 'move'; from: Cell; to: Cell }
  | { type: 'tapGenerator'; at: Cell }
  | { type: 'popBubble'; at: Cell }
  | { type: 'itemAction'; at: Cell; action: ItemAction }
  | { type: 'returnFromStorage'; key: string; to: Cell }
  | { type: 'deliverOrder'; slot: number }
  | CheatCommand;

export type SpawnSource = 'generator' | 'reward' | 'bubbleTimer';

type EventBody =
  | { type: 'energy_spent'; generator: string; level: number; amount: number }
  | {
      type: 'item_spawned';
      chain: string;
      level: number;
      source: SpawnSource;
      /** Для источника `generator`. */
      generator?: string;
      /** Клетка; нет, если предмет ушёл в хранилище (награда при полной доске). */
      at?: Cell;
      inBubble?: true;
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
  | { type: 'generator_cooldown_ended'; generator: string; level: number; at: Cell }
  | { type: 'lock_opened'; group: string; chain: string; level: number; at: Cell }
  | { type: 'locks_unlockable'; groups: string[] }
  | { type: 'bubble_popped'; chain: string; level: number; cost: number; at: Cell }
  | { type: 'bubble_expired'; chain: string; level: number; at: Cell }
  | { type: 'item_picked'; subject: Subject; at: Cell }
  | { type: 'item_deleted'; subject: Subject; at: Cell }
  | { type: 'item_sold'; subject: Subject; at: Cell; amount: number }
  | { type: 'item_returned'; subject: Subject; at: Cell }
  | { type: 'order_created'; orderId: number; template: string; requirements: OrderRequirement[] }
  | {
      type: 'order_completed';
      orderId: number;
      template: string;
      requirements: OrderRequirement[];
      rewards: ResolvedReward[];
      totalValue: number;
    }
  | { type: 'orders_stopped' }
  | { type: 'reward_granted'; reward: ResolvedReward; source: 'order' | 'level' }
  | { type: 'level_completed'; level: number; last: boolean }
  | { type: 'cheat_used'; name: CheatCommand['cheat']; amount?: number; minutes?: number };

/**
 * Событие журнала; `t` — игровое время события, мс. Всё, что вызвано читом,
 * помечено `cheat: true`, чтобы такие записи можно было отфильтровать при анализе.
 */
export type GameEvent = EventBody & { t: number; cheat?: true };
export type GameEventType = GameEvent['type'];

export type RejectReason = Extract<StringKey, `reject.${string}`>;

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  /** Причина отказа; при отказе состояние не меняется. Ключ строки для `t()`. */
  rejected?: RejectReason;
}
