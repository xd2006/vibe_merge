import { z } from 'zod';
import { t } from '@/i18n/ru';

z.config(z.locales.ru());

// ---------- Общие типы ----------

/** Идентификатор цепочки, генератора, группы замков, шаблона: латиница в нижнем регистре, цифры, `_`. */
export const IdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, { error: () => t('schema.idFormat') });

/**
 * Ссылки на id других элементов. Формат в JSON Schema подсказывает редактору показать
 * выбор из существующих id; на валидацию не влияет.
 */
const ref = (format: string) => IdSchema.meta({ format });
const ChainRef = ref('chainRef');
const GeneratorRef = ref('generatorRef');
const LockGroupRef = ref('lockGroupRef');
const TemplateRef = ref('templateRef');

const Level = z.int().min(1);

/** Диапазон `[min, max]` включительно. */
const range = (min: number) =>
  z
    .tuple([z.int().min(min), z.int().min(min)])
    .refine(([a, b]) => a <= b, { error: () => t('schema.rangeOrder') });

/** Число или формула на мини-языке выражений (проверяется отдельно, см. `expr`). */
export const FormulaSchema = z.union([z.number(), z.string().min(1)]).meta({ format: 'formula' });

const Weight = z.number().min(0);

/** Предмет цепочки с фиксированным уровнем или диапазоном уровней (ровно одно из двух). */
const levelSelector = <T extends z.core.$ZodLooseShape>(shape: T) =>
  z
    .strictObject({
      chain: ChainRef,
      level: Level.optional(),
      levelRange: range(1).optional(),
      ...shape,
    })
    .refine(
      (v: { level?: unknown; levelRange?: unknown }) =>
        (v.level === undefined) !== (v.levelRange === undefined),
      {
        error: () => t('schema.levelOrRange'),
      },
    );

const CellCoord = z.tuple([z.int().min(0), z.int().min(0)]);

// ---------- Блоки конфига ----------

const MetaSchema = z.strictObject({
  name: z.string().min(1),
  seed: z.int().default(1),
  artStyle: z.string().default(''),
});

const CurrenciesSchema = z.strictObject({
  hard: z.strictObject({ name: z.string().min(1), start: z.int().min(0).default(0) }),
});

const EnergySchema = z.strictObject({
  max: z.int().min(1),
  start: z.int().min(0),
  regen: z.strictObject({ amount: z.int().min(1), intervalSec: z.number().positive() }),
  allowOverMax: z.boolean().default(true),
});

const ChainSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  /** Ценность предмета; переменная `level`. */
  value: FormulaSchema.default('2 ^ level'),
  levels: z.array(z.strictObject({ name: z.string().min(1) })).min(1),
});

const GeneratorLevelSchema = z.strictObject({
  /** Название уровня генератора для интерфейса и арта; по умолчанию имя генератора. */
  name: z.string().min(1).optional(),
  energyCost: z.int().min(0),
  /** Сколько предметов выдаётся до кулдауна и сколько длится кулдаун. Без поля кулдауна нет. */
  cooldown: z.strictObject({ charges: z.int().min(1), seconds: z.number().positive() }).optional(),
  produces: z.array(z.strictObject({ chain: ChainRef, level: Level, weight: Weight })).min(1),
});

const GeneratorSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  levels: z.array(GeneratorLevelSchema).min(1),
});

const LegendEntrySchema = z.union([
  z.null(),
  z.strictObject({ item: ChainRef, level: Level }).meta({ title: 'Предмет' }),
  z.strictObject({ generator: GeneratorRef, level: Level }).meta({ title: 'Генератор' }),
]);

const BoardSchema = z.strictObject({
  width: z.int().min(1).max(20),
  height: z.int().min(1).max(20),
  /** Символ раскладки → содержимое клетки. */
  legend: z.record(z.string().length(1), LegendEntrySchema),
  /** Строки сверху вниз, по одному символу на клетку. */
  layout: z.array(z.string()),
  locks: z
    .array(
      z.strictObject({
        group: IdSchema,
        // DECISION: координаты клеток — [x, y]: столбец, затем строка; (0, 0) — левый верхний угол.
        cells: z.array(CellCoord).min(1),
        content: z.strictObject({ item: ChainRef, level: Level }),
      }),
    )
    .default([]),
});

const RewardSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('energy'), amount: FormulaSchema }).meta({ title: 'Энергия' }),
  z.strictObject({ type: z.literal('hard'), amount: FormulaSchema }).meta({ title: 'Хард-валюта' }),
  z
    .strictObject({
      type: z.literal('item'),
      chain: ChainRef,
      level: Level,
      count: z.int().min(1).default(1),
    })
    .meta({ title: 'Предмет' }),
]);

const BoardLevelSchema = z.strictObject({
  id: z.int().min(1),
  ordersRequired: z.int().min(1),
  unlocks: z.array(LockGroupRef).default([]),
  /** Потолок уровня предмета в заказах по цепочкам. */
  orderLevelCap: z.record(IdSchema, Level).optional(),
  reward: z.array(RewardSchema).default([]),
});

const ReachSource = z.enum(['generator', 'lockedCellsAfterUnlock', 'bubble', 'reward']);

const OrderTemplateSchema = z.strictObject({
  id: IdSchema,
  weight: Weight,
  boardLevels: range(1),
  maxRequirements: z.int().min(1),
  requirements: z
    .array(levelSelector({ count: z.union([z.int().min(1), range(1)]).default(1) }))
    .min(1),
  rewards: z.array(RewardSchema).default([]),
});

const OrdersSchema = z.strictObject({
  slots: z.int().min(1),
  refillDelaySec: z.number().min(0).default(0),
  allowFromStorage: z.boolean().default(false),
  fallbackTemplate: TemplateRef.optional(),
  reachability: z
    .strictObject({
      mode: z.enum(['auto', 'off']).default('auto'),
      maxMergeDepth: z.int().min(0).default(3),
      countSources: z.array(ReachSource).default(['generator', 'lockedCellsAfterUnlock']),
      onNoValidTemplate: z.enum(['fallbackTemplate', 'skipSlot', 'error']).default('skipSlot'),
    })
    .prefault({}),
  templates: z.array(OrderTemplateSchema).min(1),
});

const LifetimeSchema = z.union([
  z.number().positive(),
  z
    .strictObject({ min: z.number().positive(), max: z.number().positive() })
    .refine((v) => v.min <= v.max, { error: () => t('schema.rangeOrder') }),
  z.null(),
]);

const BubbleRuleSchema = z.discriminatedUnion('source', [
  z
    .strictObject({
      source: z.literal('generator'),
      chance: z.number().min(0).max(1),
      lifetimeSec: LifetimeSchema.default(null),
      onExpire: z.literal('vanish').default('vanish'),
    })
    .meta({ title: 'При генерации' }),
  z
    .strictObject({
      source: z.literal('timer'),
      everySec: z.number().positive(),
      maxOnBoard: z.int().min(1),
      lifetimeSec: LifetimeSchema.default(null),
      onExpire: z.literal('vanish').default('vanish'),
      content: z.array(levelSelector({ weight: Weight })).min(1),
    })
    .meta({ title: 'По таймеру' }),
]);

const BubblesSchema = z.strictObject({
  spawnRules: z.array(BubbleRuleSchema).default([]),
  popCost: z
    .strictObject({
      currency: z.literal('hard').default('hard'),
      /** Переменная `itemValue`. */
      formula: FormulaSchema.default('ceil(itemValue / 2)'),
    })
    .prefault({}),
});

const StorageSchema = z.strictObject({
  enabled: z.boolean().default(true),
  returnToBoard: z.boolean().default(true),
});

const ItemActionSchema = z.strictObject({
  /** `цепочка.уровень`, `цепочка.*`, `generator.id` или `*`. */
  match: z.string().regex(/^(\*|[a-z][a-z0-9_]*\.(\*|\d+)|generator\.[a-z][a-z0-9_]*)$/, {
    error: () => t('schema.matchPattern'),
  }),
  pickUp: z.boolean().default(false),
  delete: z.boolean().default(false),
  sell: z
    .strictObject({ currency: z.literal('hard').default('hard'), amount: FormulaSchema })
    .optional(),
});

const CheatsSchema = z.strictObject({
  addHard: z
    .strictObject({ enabled: z.boolean().default(true), amount: z.int().min(1).default(100) })
    .prefault({}),
  refillEnergy: z.strictObject({ enabled: z.boolean().default(true) }).prefault({}),
  skipLevel: z.strictObject({ enabled: z.boolean().default(true) }).prefault({}),
  skipTime: z
    .strictObject({
      enabled: z.boolean().default(true),
      minutes: z.array(z.number().positive()).default([10, 60, 240]),
    })
    .prefault({}),
});

const CounterSource = z.enum(['merge', 'generator', 'reward', 'bubblePop', 'orderDelivered']);

const TelemetrySchema = z.strictObject({
  counters: z
    .array(
      z.strictObject({
        id: IdSchema,
        name: z.string().min(1),
        match: levelSelector({}),
        sources: z.array(CounterSource).min(1),
      }),
    )
    .default([]),
  energySpent: z
    .strictObject({ total: z.boolean().default(true), byGenerator: z.boolean().default(true) })
    .prefault({}),
});

const ArtMode = z.enum(['auto', 'manual']);
const ChromaKey = z.enum(['green', 'magenta']);
// DECISION: ключ арта предмета — `цепочка:уровень`, генератора — `generator.id:уровень`
// (префикс как в шаблонах itemActions, чтобы id цепочки и генератора не путались).
const ArtKey = z
  .string()
  .regex(/^(generator\.)?[a-z][a-z0-9_]*:\d+$/, { error: () => t('schema.artKey') });

const ArtSchema = z.strictObject({
  mode: ArtMode.default('manual'),
  chromaKey: ChromaKey.default('green'),
  targetSizePx: z.int().min(32).max(1024).default(256),
  promptTemplate: z
    .string()
    .default(
      '{artStyle}. Single object: {itemName} ({chainName}, level {level} of {maxLevel}). Centered, fully visible, solid {chromaKey} background, no shadow, no text.',
    ),
  items: z
    .record(ArtKey, z.strictObject({ mode: ArtMode.optional(), chromaKey: ChromaKey.optional() }))
    .default({}),
  overrides: z.record(ArtKey, z.string().min(1)).default({}),
});

// ---------- Конфиг целиком ----------

export const GameConfigSchema = z.strictObject({
  /** Ссылка на JSON Schema для подсказок в редакторах кода. */
  $schema: z.string().optional(),
  meta: MetaSchema,
  currencies: CurrenciesSchema.prefault({ hard: { name: 'Гемы' } }),
  energy: EnergySchema,
  chains: z.array(ChainSchema).min(1),
  generators: z.array(GeneratorSchema).min(1),
  board: BoardSchema,
  levels: z.array(BoardLevelSchema).min(1),
  orders: OrdersSchema,
  bubbles: BubblesSchema.prefault({}),
  storage: StorageSchema.prefault({}),
  itemActions: z.array(ItemActionSchema).default([]),
  cheats: CheatsSchema.prefault({}),
  telemetry: TelemetrySchema.prefault({}),
  art: ArtSchema.prefault({}),
});

/** Конфиг после разбора: значения по умолчанию подставлены. */
export type GameConfig = z.output<typeof GameConfigSchema>;
/** Конфиг в том виде, как его пишет дизайнер. */
export type GameConfigInput = z.input<typeof GameConfigSchema>;

export type Chain = GameConfig['chains'][number];
export type Generator = GameConfig['generators'][number];
export type GeneratorLevel = Generator['levels'][number];
export type LegendEntry = GameConfig['board']['legend'][string];
export type Reward = z.output<typeof RewardSchema>;
