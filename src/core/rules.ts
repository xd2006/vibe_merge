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
  | { kind: 'generator'; generator: string; level: number };

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

  const { width, height, legend, layout } = config.board;
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
  };
}

export function generatorLevel(rules: Rules, id: string, level: number): GeneratorLevelRules {
  const lvl = rules.generators.get(id)?.levels[level - 1];
  if (!lvl) throw new Error(`Нет уровня ${level} у генератора ${id}`);
  return lvl;
}
