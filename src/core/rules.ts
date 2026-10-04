import { FORMULA_CONTEXTS, type GameConfig, type LegendEntry } from '@/config';
import { ExprError, compileFormula, type Formula } from '@/expr';
import { t } from '@/i18n/ru';
import type { Gate } from './types';

/**
 * Ошибка конфига, из-за которой ядро не может стартовать. Подробные проверки с подсказками —
 * в валидаторе; здесь только инварианты, без которых правила не работают.
 */
export class ConfigError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'ConfigError';
  }
}

export type Range = [number, number];

/** Сбор предмета: на склад или превращение в награды; `null` — не собирается. */
export type CollectRules = null | 'storage' | RewardRules[];

/** Свойства одного уровня цепочки. */
export interface ChainLevelRules {
  name: string;
  /** `undefined` — решают правила `itemActions`. */
  deletable: boolean | undefined;
  baseCost: number;
  bubbleProbability: number;
  collect: CollectRules;
  /** Ценность уровня вместо формулы цепочки; `null` — по формуле. */
  value: number | null;
}

export interface ChainRules {
  id: string;
  name: string;
  levelNames: string[];
  levels: ChainLevelRules[];
  maxLevel: number;
  value: Formula;
  /** Во что сливаются два предмета последнего уровня. */
  mergesInto: { generator: string; level: number } | null;
}

export interface GeneratorLevelRules {
  name: string;
  energyCost: number;
  /** `weights` — предмет за тап по весам; `bag` — мешок из точного количества за цикл. */
  mode: 'weights' | 'bag';
  cooldown: {
    /** Тапов до кулдауна (режим весов). */
    charges: number | null;
    /** Циклов мешка до кулдауна (режим мешка). */
    cycles: number | null;
    ms: number;
    skipCost: number;
    freeSkipMs: number;
  } | null;
  /** Тапов (весы) или циклов (мешок) до исчезновения генератора; `null` — бесконечно. */
  uses: number | null;
  deletable: boolean | undefined;
  /** В режиме мешка `weight` — количество предметов этого вида в мешке. */
  produces: { chain: string; level: number; weight: number }[];
}

export interface GeneratorRules {
  id: string;
  name: string;
  maxLevel: number;
  levels: GeneratorLevelRules[];
}

export type InitialCell =
  | null
  | { kind: 'item'; chain: string; level: number }
  | { kind: 'generator'; generator: string; level: number };

export type RewardRules =
  | { type: 'energy' | 'hard'; amount: Formula }
  | { type: 'resource'; resource: string; amount: Formula }
  | { type: 'item'; chain: string; level: number; count: number }
  | { type: 'generator'; generator: string; level: number; count: number };

export interface BoardLevelRules {
  id: number;
  ordersRequired: number;
  unlocks: string[];
  orderLevelCap: Record<string, number>;
  reward: RewardRules[];
}

export interface DifficultyCategoryRules {
  id: string;
  name: string;
  value: Range;
  rewards: { weight: number; reward: RewardRules }[];
}

export interface DifficultyRules {
  categories: DifficultyCategoryRules[];
  items: Range;
  /** По возрастанию `fromLevel`. */
  allocation: { fromLevel: number; slots: Record<string, number> }[];
}

export interface TemplateRules {
  id: string;
  weight: number;
  boardLevels: Range;
  maxRequirements: number;
  requirements: { chain: string; levels: Range; count: Range }[];
  rewards: RewardRules[];
}

/** Время жизни пузыря в мс: `null` — бессрочно. */
export type LifetimeRules = null | { minMs: number; maxMs: number };

export interface ItemActionRules {
  match: string;
  pickUp: boolean;
  delete: boolean;
  sell: Formula | null;
}

/** Конфиг, подготовленный для ядра: справочники по id, скомпилированные формулы, разобранная доска. */
export interface Rules {
  config: GameConfig;
  chains: Map<string, ChainRules>;
  generators: Map<string, GeneratorRules>;
  energy: {
    max: number;
    start: number;
    regenAmount: number;
    regenMs: number;
    allowOverMax: boolean;
  };
  board: { width: number; height: number; initial: InitialCell[]; gates: (Gate | null)[] };
  lockGroups: string[];
  levels: BoardLevelRules[];
  orders: {
    mode: 'templates' | 'difficulty';
    /** Слоты режима шаблонов; в режиме сложности — 0, слоты задаёт `difficulty.allocation`. */
    slots: number;
    difficulty: DifficultyRules | null;
    refillMs: number;
    allowFromStorage: boolean;
    templates: TemplateRules[];
    fallback: TemplateRules | null;
    reach: { enabled: boolean; maxMergeDepth: number; sources: Set<string> };
    onNoValidTemplate: 'fallbackTemplate' | 'skipSlot' | 'error';
  };
  bubbles: {
    /** Правила появления при генерации; индекс — номер правила в `spawnRules`. */
    onGenerate: { rule: number; chance: number; lifetime: LifetimeRules }[];
    /** Правило «копия результата слияния»; шанс — `bubbleProbability` уровня цепочки. */
    onMerge: { rule: number; lifetime: LifetimeRules } | null;
    /** Общий лимит пузырей на доске; `null` — без лимита. */
    maxOnBoard: number | null;
    /** Пузыри появляются начиная с уровня с этим `id`; `null` — с любого. */
    minLevel: number | null;
    movable: boolean;
    timers: {
      rule: number;
      everyMs: number;
      maxOnBoard: number;
      lifetime: LifetimeRules;
      content: { chain: string; levels: Range; weight: number }[];
    }[];
    popCost: Formula;
  };
  storage: { enabled: boolean; returnToBoard: boolean };
  itemActions: ItemActionRules[];
}

/** Не меньше 1 мс: нулевой интервал зациклил бы обработку таймеров. */
const secToMs = (sec: number) => Math.max(1, Math.round(sec * 1000));

function formula(
  source: string | number,
  path: string,
  allowed: Parameters<typeof compileFormula>[1],
) {
  try {
    return compileFormula(source, allowed);
  } catch (e) {
    if (e instanceof ExprError) {
      throw new ConfigError(
        path,
        t('config.formula', { source: String(source), message: e.message }),
      );
    }
    throw e;
  }
}

const toRange = (v: number | readonly [number, number] | undefined, fallback: number): Range =>
  v === undefined ? [fallback, fallback] : typeof v === 'number' ? [v, v] : [v[0], v[1]];

export function compileRules(config: GameConfig): Rules {
  const chains = new Map<string, ChainRules>();
  config.chains.forEach((c, i) => {
    chains.set(c.id, {
      id: c.id,
      name: c.name,
      levelNames: c.levels.map((l) => l.name),
      // Сбор с наградами компилируется ниже, когда известны все цепочки и генераторы.
      levels: c.levels.map((l) => ({
        name: l.name,
        deletable: l.deletable,
        baseCost: l.baseCost ?? 0,
        bubbleProbability: l.bubbleProbability ?? 0,
        collect: null,
        value: l.value ?? null,
      })),
      maxLevel: c.levels.length,
      value: formula(c.value, `chains[${i}].value`, FORMULA_CONTEXTS.chainValue),
      mergesInto: c.mergesInto ? { ...c.mergesInto } : null,
    });
  });

  const checkItem = (chain: string, level: number, path: string) => {
    const c = chains.get(chain);
    if (!c) throw new ConfigError(path, t('config.unknownChain', { id: chain }));
    if (level > c.maxLevel) {
      throw new ConfigError(path, t('config.levelTooHigh', { level, max: c.maxLevel, id: chain }));
    }
  };
  const checkChain = (chain: string, path: string) => {
    if (!chains.has(chain)) throw new ConfigError(path, t('config.unknownChain', { id: chain }));
  };

  const generators = new Map<string, GeneratorRules>();
  config.generators.forEach((g, gi) => {
    generators.set(g.id, {
      id: g.id,
      name: g.name,
      maxLevel: g.levels.length,
      levels: g.levels.map((l, li) => {
        l.produces.forEach((p, pi) =>
          checkItem(p.chain, p.level, `generators[${gi}].levels[${li}].produces[${pi}]`),
        );
        const mode = l.produces.some((p) => p.count !== undefined) ? 'bag' : 'weights';
        return {
          name: l.name ?? g.name,
          energyCost: l.energyCost,
          mode,
          cooldown: l.cooldown
            ? {
                charges: l.cooldown.charges ?? null,
                cycles: l.cooldown.cycles ?? null,
                ms: secToMs(l.cooldown.seconds),
                skipCost: l.cooldown.skipCost ?? 0,
                freeSkipMs: Math.round(l.cooldown.freeSkipSec * 1000),
              }
            : null,
          uses: l.uses ?? null,
          deletable: l.deletable,
          produces: l.produces.map((p) => ({
            chain: p.chain,
            level: p.level,
            weight: (mode === 'bag' ? p.count : p.weight) ?? 0,
          })),
        };
      }),
    });
  });

  const checkGenerator = (id: string, level: number, path: string) => {
    const g = generators.get(id);
    if (!g) throw new ConfigError(path, t('config.unknownGenerator', { id }));
    if (level > g.maxLevel) {
      throw new ConfigError(path, t('config.levelTooHigh', { level, max: g.maxLevel, id }));
    }
  };

  // ---------- Доска и замки ----------

  const { width, height, legend, layout, locks } = config.board;
  if (layout.length !== height) {
    throw new ConfigError(
      'board.layout',
      t('config.layoutRows', { actual: layout.length, expected: height }),
    );
  }
  const initial: InitialCell[] = [];
  layout.forEach((row, y) => {
    const symbols = [...row];
    if (symbols.length !== width) {
      throw new ConfigError(
        `board.layout[${y}]`,
        t('config.layoutCols', { row: y, actual: symbols.length, expected: width }),
      );
    }
    for (const ch of symbols) {
      if (!(ch in legend)) {
        throw new ConfigError(
          `board.layout[${y}]`,
          t('config.unknownSymbol', { char: ch, row: y }),
        );
      }
      const entry: LegendEntry = legend[ch] ?? null;
      if (entry === null) initial.push(null);
      else if ('item' in entry) {
        checkItem(entry.item, entry.level, `board.legend.${ch}`);
        initial.push({ kind: 'item', chain: entry.item, level: entry.level });
      } else {
        checkGenerator(entry.generator, entry.level, `board.legend.${ch}`);
        initial.push({ kind: 'generator', generator: entry.generator, level: entry.level });
      }
    }
  });

  // Замки MVP (`board.locks`): предмет в клетке + ограничение «группа» и «заблокирована».
  const gates: (Gate | null)[] = initial.map(() => null);
  const lockGroups: string[] = [];
  locks.forEach((lock, li) => {
    checkItem(lock.content.item, lock.content.level, `board.locks[${li}].content`);
    if (!lockGroups.includes(lock.group)) lockGroups.push(lock.group);
    lock.cells.forEach(([x, y], ci) => {
      const path = `board.locks[${li}].cells[${ci}]`;
      if (x >= width || y >= height) throw new ConfigError(path, t('config.lockOutside', { x, y }));
      const index = y * width + x;
      if (initial[index] !== null) throw new ConfigError(path, t('config.lockOverlap', { x, y }));
      initial[index] = { kind: 'item', chain: lock.content.item, level: lock.content.level };
      gates[index] = { requiredLevel: null, group: lock.group, closed: false, locked: true };
    });
  });

  // Состояния клеток (поле Spice merge).
  config.board.cells.forEach((c, ci) => {
    const [x, y] = c.cell;
    const path = `board.cells[${ci}].cell`;
    if (x >= width || y >= height) throw new ConfigError(path, t('config.lockOutside', { x, y }));
    const index = y * width + x;
    if (gates[index]) throw new ConfigError(path, t('config.cellDuplicate', { x, y }));
    if (c.locked && !initial[index]) throw new ConfigError(path, t('config.lockedEmpty', { x, y }));
    const requiredLevel = c.requiredLevel > 0 ? c.requiredLevel : null;
    if (requiredLevel === null && !c.closed && !c.locked) return;
    gates[index] = { requiredLevel, group: null, closed: c.closed, locked: c.locked };
  });

  // ---------- Награды, уровни, заказы ----------

  const resourceIds = new Set(config.currencies.resources.map((r) => r.id));
  const reward = (r: GameConfig['levels'][number]['reward'][number], path: string): RewardRules => {
    if (r.type === 'item') {
      checkItem(r.chain, r.level, path);
      return { type: 'item', chain: r.chain, level: r.level, count: r.count };
    }
    if (r.type === 'generator') {
      checkGenerator(r.generator, r.level, path);
      return { type: 'generator', generator: r.generator, level: r.level, count: r.count };
    }
    const amount = formula(r.amount, `${path}.amount`, FORMULA_CONTEXTS.reward);
    if (r.type === 'resource') {
      if (!resourceIds.has(r.resource)) {
        throw new ConfigError(`${path}.resource`, t('config.unknownResource', { id: r.resource }));
      }
      return { type: 'resource', resource: r.resource, amount };
    }
    return { type: r.type, amount };
  };

  // Сбор предметов и переход цепочки в генератор — теперь, когда известны генераторы и ресурсы.
  config.chains.forEach((c, ci) => {
    const rules = chains.get(c.id)!;
    c.levels.forEach((l, li) => {
      if (l.collect === undefined) return;
      rules.levels[li]!.collect =
        l.collect === 'storage'
          ? 'storage'
          : l.collect.map((r, ri) => reward(r, `chains[${ci}].levels[${li}].collect[${ri}]`));
    });
    if (c.mergesInto)
      checkGenerator(c.mergesInto.generator, c.mergesInto.level, `chains[${ci}].mergesInto`);
  });

  const levels: BoardLevelRules[] = config.levels.map((l, li) => {
    l.unlocks.forEach((group, gi) => {
      if (!lockGroups.includes(group)) {
        throw new ConfigError(
          `levels[${li}].unlocks[${gi}]`,
          t('config.unknownLockGroup', { id: group }),
        );
      }
    });
    Object.keys(l.orderLevelCap ?? {}).forEach((chain) =>
      checkChain(chain, `levels[${li}].orderLevelCap.${chain}`),
    );
    return {
      id: l.id,
      ordersRequired: l.ordersRequired,
      unlocks: [...l.unlocks],
      orderLevelCap: { ...(l.orderLevelCap ?? {}) },
      reward: l.reward.map((r, ri) => reward(r, `levels[${li}].reward[${ri}]`)),
    };
  });

  const { orders } = config;
  const templates: TemplateRules[] = orders.templates.map((tpl, ti) => ({
    id: tpl.id,
    weight: tpl.weight,
    boardLevels: [tpl.boardLevels[0], tpl.boardLevels[1]],
    maxRequirements: tpl.maxRequirements,
    requirements: tpl.requirements.map((r, ri) => {
      checkChain(r.chain, `orders.templates[${ti}].requirements[${ri}]`);
      return {
        chain: r.chain,
        levels: toRange(r.levelRange ?? r.level, 1),
        count: toRange(r.count, 1),
      };
    }),
    rewards: tpl.rewards.map((r, ri) => reward(r, `orders.templates[${ti}].rewards[${ri}]`)),
  }));
  if (orders.mode === 'templates') {
    if (orders.slots === undefined) throw new ConfigError('orders.slots', t('config.ordersSlots'));
    if (templates.length === 0) throw new ConfigError('orders.templates', t('config.noTemplates'));
  }
  let difficulty: DifficultyRules | null = null;
  if (orders.mode === 'difficulty') {
    const d = orders.difficulty;
    if (!d) throw new ConfigError('orders.difficulty', t('config.noDifficulty'));
    const categoryIds = new Set(d.categories.map((cat) => cat.id));
    d.allocation.forEach((row, ri) =>
      Object.keys(row.slots).forEach((id) => {
        if (!categoryIds.has(id)) {
          throw new ConfigError(
            `orders.difficulty.allocation[${ri}].slots.${id}`,
            t('config.unknownCategory', { id }),
          );
        }
      }),
    );
    difficulty = {
      categories: d.categories.map((cat, ci) => ({
        id: cat.id,
        name: cat.name,
        value: [cat.value[0], cat.value[1]],
        rewards: cat.rewards.map((r, ri) => ({
          weight: r.weight,
          reward: reward(r.reward, `orders.difficulty.categories[${ci}].rewards[${ri}].reward`),
        })),
      })),
      items: [d.itemsPerOrder[0], d.itemsPerOrder[1]],
      allocation: d.allocation
        .map((row) => ({ fromLevel: row.fromLevel, slots: { ...row.slots } }))
        .sort((a, b) => a.fromLevel - b.fromLevel),
    };
  }
  let fallback: TemplateRules | null = null;
  if (orders.fallbackTemplate !== undefined) {
    fallback = templates.find((tpl) => tpl.id === orders.fallbackTemplate) ?? null;
    if (!fallback) {
      throw new ConfigError(
        'orders.fallbackTemplate',
        t('config.unknownTemplate', { id: orders.fallbackTemplate }),
      );
    }
  }

  // ---------- Пузыри ----------

  const lifetime = (v: number | { min: number; max: number } | null): LifetimeRules =>
    v === null
      ? null
      : typeof v === 'number'
        ? { minMs: secToMs(v), maxMs: secToMs(v) }
        : { minMs: secToMs(v.min), maxMs: secToMs(v.max) };

  const onGenerate: Rules['bubbles']['onGenerate'] = [];
  const timers: Rules['bubbles']['timers'] = [];
  let onMerge: Rules['bubbles']['onMerge'] = null;
  config.bubbles.spawnRules.forEach((rule, ri) => {
    if (rule.source === 'generator') {
      onGenerate.push({ rule: ri, chance: rule.chance, lifetime: lifetime(rule.lifetimeSec) });
    } else if (rule.source === 'merge') {
      // DECISION: действует первое правило `merge`; остальные игнорируются (валидатор предупреждает).
      onMerge ??= { rule: ri, lifetime: lifetime(rule.lifetimeSec) };
    } else {
      timers.push({
        rule: ri,
        everyMs: secToMs(rule.everySec),
        maxOnBoard: rule.maxOnBoard,
        lifetime: lifetime(rule.lifetimeSec),
        content: rule.content.map((c, ci) => {
          checkChain(c.chain, `bubbles.spawnRules[${ri}].content[${ci}]`);
          return { chain: c.chain, levels: toRange(c.levelRange ?? c.level, 1), weight: c.weight };
        }),
      });
    }
  });

  // ---------- Действия над предметами ----------

  const itemActions: ItemActionRules[] = config.itemActions.map((a, ai) => ({
    match: a.match,
    pickUp: a.pickUp,
    delete: a.delete,
    sell: a.sell
      ? formula(a.sell.amount, `itemActions[${ai}].sell.amount`, FORMULA_CONTEXTS.sell)
      : null,
  }));

  const { energy } = config;
  return {
    config,
    chains,
    generators,
    energy: {
      max: energy.max,
      start: energy.allowOverMax ? energy.start : Math.min(energy.start, energy.max),
      regenAmount: energy.regen.amount,
      regenMs: secToMs(energy.regen.intervalSec),
      allowOverMax: energy.allowOverMax,
    },
    board: { width, height, initial, gates },
    lockGroups,
    levels,
    orders: {
      mode: orders.mode,
      slots: orders.mode === 'templates' ? (orders.slots ?? 0) : 0,
      difficulty,
      refillMs: Math.round(orders.refillDelaySec * 1000),
      allowFromStorage: orders.allowFromStorage,
      templates,
      fallback,
      reach: {
        enabled: orders.reachability.mode === 'auto',
        maxMergeDepth: orders.reachability.maxMergeDepth,
        sources: new Set(orders.reachability.countSources),
      },
      onNoValidTemplate: orders.reachability.onNoValidTemplate,
    },
    bubbles: {
      onGenerate,
      timers,
      onMerge,
      maxOnBoard: config.bubbles.maxOnBoard ?? null,
      minLevel: config.bubbles.minLevel ?? null,
      movable: config.bubbles.movable,
      popCost: formula(
        config.bubbles.popCost.formula,
        'bubbles.popCost.formula',
        FORMULA_CONTEXTS.popCost,
      ),
    },
    storage: { ...config.storage },
    itemActions,
  };
}

export function generatorLevel(rules: Rules, id: string, level: number): GeneratorLevelRules {
  const lvl = rules.generators.get(id)?.levels[level - 1];
  if (!lvl) throw new Error(`Нет уровня ${level} у генератора ${id}`);
  return lvl;
}

/** Ценность предмета по формуле цепочки. */
export function itemValue(rules: Rules, chain: string, level: number): number {
  const c = rules.chains.get(chain);
  if (!c) return 0;
  return c.levels[level - 1]?.value ?? c.value({ level });
}

/** Все награды, которые могут дать заказы: шаблонов и категорий сложности. */
export function orderRewards(rules: Rules): RewardRules[] {
  return [
    ...rules.orders.templates.flatMap((tpl) => tpl.rewards),
    ...(rules.orders.difficulty?.categories.flatMap((c) => c.rewards.map((r) => r.reward)) ?? []),
  ];
}

export function chainLevel(rules: Rules, chain: string, level: number): ChainLevelRules | null {
  return rules.chains.get(chain)?.levels[level - 1] ?? null;
}

/** Предмет последнего уровня, который не сливается дальше (для значка «максимальный уровень»). */
export function isFinalItem(rules: Rules, chain: string, level: number): boolean {
  const c = rules.chains.get(chain);
  return !!c && level >= c.maxLevel && !c.mergesInto;
}
