import { FORMULA_CONTEXTS, type GameConfig, type LegendEntry } from '@/config';
import { ExprError, compileFormula, type Formula } from '@/expr';
import { t } from '@/i18n/ru';

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

export interface ChainRules {
  id: string;
  name: string;
  levelNames: string[];
  maxLevel: number;
  value: Formula;
}

export interface GeneratorLevelRules {
  name: string;
  energyCost: number;
  cooldown: { charges: number; ms: number } | null;
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
  | { kind: 'generator'; generator: string; level: number }
  | { kind: 'lock'; group: string; chain: string; level: number };

export type RewardRules =
  | { type: 'energy' | 'hard'; amount: Formula }
  | { type: 'item'; chain: string; level: number; count: number };

export interface BoardLevelRules {
  id: number;
  ordersRequired: number;
  unlocks: string[];
  orderLevelCap: Record<string, number>;
  reward: RewardRules[];
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
  board: { width: number; height: number; initial: InitialCell[] };
  lockGroups: string[];
  levels: BoardLevelRules[];
  orders: {
    slots: number;
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
      maxLevel: c.levels.length,
      value: formula(c.value, `chains[${i}].value`, FORMULA_CONTEXTS.chainValue),
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
        return {
          name: l.name ?? g.name,
          energyCost: l.energyCost,
          cooldown: l.cooldown
            ? { charges: l.cooldown.charges, ms: secToMs(l.cooldown.seconds) }
            : null,
          produces: l.produces.map((p) => ({ ...p })),
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

  const lockGroups: string[] = [];
  locks.forEach((lock, li) => {
    checkItem(lock.content.item, lock.content.level, `board.locks[${li}].content`);
    if (!lockGroups.includes(lock.group)) lockGroups.push(lock.group);
    lock.cells.forEach(([x, y], ci) => {
      const path = `board.locks[${li}].cells[${ci}]`;
      if (x >= width || y >= height) throw new ConfigError(path, t('config.lockOutside', { x, y }));
      const index = y * width + x;
      if (initial[index] !== null) throw new ConfigError(path, t('config.lockOverlap', { x, y }));
      initial[index] = {
        kind: 'lock',
        group: lock.group,
        chain: lock.content.item,
        level: lock.content.level,
      };
    });
  });

  // ---------- Награды, уровни, заказы ----------

  const reward = (r: GameConfig['levels'][number]['reward'][number], path: string): RewardRules => {
    if (r.type === 'item') {
      checkItem(r.chain, r.level, path);
      return { type: 'item', chain: r.chain, level: r.level, count: r.count };
    }
    return { type: r.type, amount: formula(r.amount, `${path}.amount`, FORMULA_CONTEXTS.reward) };
  };

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
  config.bubbles.spawnRules.forEach((rule, ri) => {
    if (rule.source === 'generator') {
      onGenerate.push({ rule: ri, chance: rule.chance, lifetime: lifetime(rule.lifetimeSec) });
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
    board: { width, height, initial },
    lockGroups,
    levels,
    orders: {
      slots: orders.slots,
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
  return rules.chains.get(chain)?.value({ level }) ?? 0;
}
