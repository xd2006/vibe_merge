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
  /** Режим весов: сколько тапов осталось до кулдауна; `null`, если кулдауна нет. */
  charges: number | null;
  /** Режим мешка: сколько предметов каждого вида (как в `produces`) осталось в текущем цикле. */
  bag: number[] | null;
  /** Режим мешка: сколько циклов осталось до кулдауна; `null`, если кулдауна нет. */
  cyclesLeft: number | null;
  /** Сколько тапов (весы) или циклов (мешок) осталось до исчезновения; `null` — бесконечно. */
  usesLeft: number | null;
  /** Время окончания кулдауна (игровое время, мс); `null`, если генератор не на кулдауне. */
  cooldownUntil: number | null;
}

export type Entity = ItemEntity | GeneratorEntity;

/**
 * Ограничения клетки. Пока хоть одно действует, с клеткой и её содержимым нельзя
 * взаимодействовать (кроме открытия заблокированной клетки слиянием).
 */
export interface Gate {
  /** Клетка закрыта, пока уровень игрока (`id` уровня) ниже этого. */
  requiredLevel: number | null;
  /** Клетка закрыта, пока группа замков не стала `unlockable` (`board.locks` MVP). */
  group: string | null;
  /** «Песок»: открывается слиянием в соседней заблокированной клетке. */
  closed: boolean;
  /** Заблокирована: открывается слиянием такого же предмета в неё. */
  locked: boolean;
}

/** Действующее состояние клетки (с учётом уровня и групп). */
export type CellState =
  | { kind: 'open' }
  | { kind: 'level'; level: number }
  | { kind: 'group'; group: string }
  | { kind: 'closed' }
  | { kind: 'locked' };

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
  | { type: 'resource'; resource: string; amount: number }
  | { type: 'item'; chain: string; level: number; count: number }
  | { type: 'generator'; generator: string; level: number; count: number };

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
  /** Категория сложности слота (режим `difficulty`); `null` — заказы по шаблонам. */
  category: string | null;
}

/** Состояние группы замков. Открытые клетки — обычные клетки, у группы отдельного статуса нет. */
export type LockGroupState = 'sealed' | 'unlockable';

export interface GameState {
  version: 4;
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
    /** Ограничения клеток (тот же индекс); `null` — клетка открыта. */
    gates: (Gate | null)[];
  };
  energy: {
    value: number;
    /** Когда начислится следующая порция энергии; `null`, если восстановление не идёт. */
    nextRegenAt: number | null;
  };
  hard: number;
  /** Дополнительные ресурсы по id (`currencies.resources`). */
  resources: Record<string, number>;
  storage: StorageStack[];
  /**
   * Генераторы-награды, которым не хватило места на доске: ставятся в первую свободную
   * клетку, как только она освободится (по порядку получения).
   */
  rewardQueue: Subject[];
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
  /** Пропуск кулдауна генератора за хард-валюту. */
  | { type: 'skipCooldown'; at: Cell }
  /** Сбор предмета двойным тапом: на склад или в награду. */
  | { type: 'collect'; at: Cell }
  | { type: 'popBubble'; at: Cell }
  | { type: 'itemAction'; at: Cell; action: ItemAction }
  | { type: 'returnFromStorage'; key: string; to: Cell }
  | { type: 'deliverOrder'; slot: number }
  | CheatCommand;

export type RewardSource = 'order' | 'level' | 'collect';

export type SpawnSource = 'generator' | 'reward' | 'bubbleTimer' | 'bubbleMerge' | 'collect';

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
  | {
      type: 'merge';
      kind: 'item';
      chain: string;
      fromLevel: number;
      toLevel: number;
      at: Cell;
      /** Два предмета последнего уровня слились в генератор (`chains[].mergesInto`). */
      intoGenerator?: { generator: string; level: number };
    }
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
  | {
      type: 'generator_cooldown_skipped';
      generator: string;
      level: number;
      at: Cell;
      cost: number;
      /** Сколько оставалось до конца кулдауна, мс. */
      remainingMs: number;
    }
  | { type: 'generator_depleted'; generator: string; level: number; at: Cell }
  | { type: 'generator_placed'; generator: string; level: number; at: Cell }
  | {
      type: 'item_collected';
      chain: string;
      level: number;
      at: Cell;
      /** `storage` — на склад; `reward` — предмет превратился в награды (`reward_granted`). */
      to: 'storage' | 'reward';
    }
  /** Заблокированная клетка открыта слиянием; `subject` — что было в клетке до слияния. */
  | { type: 'lock_opened'; group: string | null; subject: Subject; at: Cell }
  /** «Песок» расчищен в этих клетках (слиянием в соседней заблокированной клетке). */
  | { type: 'cells_uncovered'; cells: Cell[] }
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
  | { type: 'reward_granted'; reward: ResolvedReward; source: RewardSource }
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
