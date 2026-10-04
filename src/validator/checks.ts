import { FORMULA_CONTEXTS, type GameConfig } from '@/config';
import { compileRules } from '@/core';
import { reachableLevels, type ItemLevel } from '@/core/reach';
import { checkFormula, type FormulaVariable } from '@/expr';
import { t, type StringKey } from '@/i18n/ru';
import { hasErrors, type Issue } from './issues';

type Params = Record<string, string | number>;

/** Логические проверки конфига, прошедшего схему (ТЗ, раздел 12). */
export function semanticIssues(c: GameConfig): Issue[] {
  const issues: Issue[] = [];
  const push =
    (level: Issue['level']) =>
    (
      path: string,
      code: string,
      msg: StringKey,
      params: Params,
      hint: StringKey,
      hintParams: Params = {},
    ) =>
      issues.push({ level, path, code, message: t(msg, params), hint: t(hint, hintParams) });
  const error = push('error');
  const warn = push('warning');

  const chainMax = new Map(c.chains.map((ch) => [ch.id, ch.levels.length]));
  const chainName = new Map(c.chains.map((ch) => [ch.id, ch.levels.map((l) => l.name)]));
  const genMax = new Map(c.generators.map((g) => [g.id, g.levels.length]));
  const templateIds = c.orders.templates.map((tpl) => tpl.id);
  const lockGroups = [...new Set(c.board.locks.map((l) => l.group))];
  const list = (xs: Iterable<string>) => [...xs].join(', ') || '—';

  // ---------- Ссылки и уровни ----------

  const chainRef = (chain: string, path: string) => {
    if (chainMax.has(chain)) return true;
    error(path, 'unknownChain', 'val.unknownChain', { id: chain }, 'hint.unknownChain', {
      list: list(chainMax.keys()),
    });
    return false;
  };
  /** Предмет `chain:level`; ошибки пишутся в `${path}.${chainField}` и `${path}.level`. */
  const itemRef = (chain: string, level: number, path: string, chainField = 'chain') => {
    if (!chainRef(chain, `${path}.${chainField}`)) return;
    const max = chainMax.get(chain)!;
    if (level > max) {
      error(
        `${path}.level`,
        'levelTooHigh',
        'val.levelTooHigh',
        { level, max, id: chain },
        'hint.levelTooHigh',
      );
    }
  };
  /** Требование с `level` или `levelRange`. */
  const selector = (
    s: { chain: string; level?: number; levelRange?: [number, number] },
    path: string,
  ) => {
    if (s.level !== undefined) return itemRef(s.chain, s.level, path);
    if (!chainRef(s.chain, `${path}.chain`) || !s.levelRange) return;
    const max = chainMax.get(s.chain)!;
    const [from, to] = s.levelRange;
    if (from > max) {
      error(
        `${path}.levelRange`,
        'levelTooHigh',
        'val.rangeTooHigh',
        { from, to, max, id: s.chain },
        'hint.levelTooHigh',
      );
    }
  };
  const generatorRef = (id: string, level: number, path: string) => {
    if (!genMax.has(id)) {
      error(
        `${path}.generator`,
        'unknownGenerator',
        'val.unknownGenerator',
        { id },
        'hint.unknownGenerator',
        {
          list: list(genMax.keys()),
        },
      );
      return;
    }
    const max = genMax.get(id)!;
    if (level > max)
      error(
        `${path}.level`,
        'levelTooHigh',
        'val.levelTooHigh',
        { level, max, id },
        'hint.levelTooHigh',
      );
  };
  const formula = (source: string | number, path: string, allowed: readonly FormulaVariable[]) => {
    const res = checkFormula(source, allowed);
    if (!res.ok) {
      error(
        path,
        'formula',
        'val.formula',
        { source: String(source), message: res.message },
        'hint.formula',
        {
          allowed: allowed.join(', '),
        },
      );
    }
  };
  const weights = (ws: number[], path: string) => {
    if (ws.length > 0 && ws.reduce((a, b) => a + b, 0) <= 0) {
      error(path, 'zeroWeights', 'val.zeroWeights', {}, 'hint.zeroWeights');
    }
  };
  const resourceIds = c.currencies.resources.map((r) => r.id);
  type Reward = GameConfig['levels'][number]['reward'][number];
  const rewards = (rs: Reward[], path: string) =>
    rs.forEach((r, i) => {
      const p = `${path}[${i}]`;
      if (r.type === 'item') itemRef(r.chain, r.level, p);
      else if (r.type === 'generator') generatorRef(r.generator, r.level, p);
      else {
        if (r.type === 'resource' && !resourceIds.includes(r.resource)) {
          error(
            `${p}.resource`,
            'unknownResource',
            'val.unknownResource',
            { id: r.resource },
            'hint.unknownResource',
            {
              list: list(resourceIds),
            },
          );
        }
        formula(r.amount, `${p}.amount`, FORMULA_CONTEXTS.reward);
      }
    });

  // ---------- Дубликаты id ----------

  const duplicates = (ids: (string | number)[], path: (i: number) => string, kind: string) => {
    const seen = new Map<string | number, number>();
    ids.forEach((id, i) => {
      const first = seen.get(id);
      if (first === undefined) seen.set(id, i);
      else {
        error(
          path(i),
          'duplicateId',
          'val.duplicateId',
          { id, kind, first: path(first) },
          'hint.duplicateId',
        );
      }
    });
  };
  duplicates(
    c.chains.map((x) => x.id),
    (i) => `chains[${i}].id`,
    'цепочка',
  );
  duplicates(
    c.generators.map((x) => x.id),
    (i) => `generators[${i}].id`,
    'генератор',
  );
  duplicates(templateIds, (i) => `orders.templates[${i}].id`, 'шаблон');
  duplicates(
    c.levels.map((x) => x.id),
    (i) => `levels[${i}].id`,
    'уровень',
  );
  duplicates(
    c.telemetry.counters.map((x) => x.id),
    (i) => `telemetry.counters[${i}].id`,
    'счётчик',
  );

  // ---------- Цепочки и генераторы ----------

  duplicates(resourceIds, (i) => `currencies.resources[${i}].id`, 'ресурс');
  c.chains.forEach((ch, i) => {
    formula(ch.value, `chains[${i}].value`, FORMULA_CONTEXTS.chainValue);
    ch.levels.forEach((l, li) => {
      if (Array.isArray(l.collect)) rewards(l.collect, `chains[${i}].levels[${li}].collect`);
      if (l.collect === 'storage' && !c.storage.enabled) {
        warn(
          `chains[${i}].levels[${li}].collect`,
          'collectNoStorage',
          'val.warnCollectNoStorage',
          {},
          'hint.warnCollectNoStorage',
        );
      }
    });
    if (ch.mergesInto)
      generatorRef(ch.mergesInto.generator, ch.mergesInto.level, `chains[${i}].mergesInto`);
  });
  c.generators.forEach((g, gi) =>
    g.levels.forEach((l, li) => {
      const path = `generators[${gi}].levels[${li}]`;
      l.produces.forEach((p, pi) => itemRef(p.chain, p.level, `${path}.produces[${pi}]`));
      const bag = l.produces.some((p) => p.count !== undefined);
      if (bag && l.produces.some((p) => p.weight !== undefined)) {
        error(`${path}.produces`, 'mixedProduces', 'val.mixedProduces', {}, 'hint.mixedProduces');
      }
      weights(
        l.produces.map((p) => (bag ? p.count : p.weight) ?? 0),
        `${path}.produces`,
      );
      if (l.cooldown) {
        if (bag && l.cooldown.charges !== undefined) {
          error(
            `${path}.cooldown.charges`,
            'cooldownMode',
            'val.cooldownCharges',
            {},
            'hint.cooldownCharges',
          );
        }
        if (!bag && l.cooldown.cycles !== undefined) {
          error(
            `${path}.cooldown.cycles`,
            'cooldownMode',
            'val.cooldownCycles',
            {},
            'hint.cooldownCycles',
          );
        }
      }
      if (l.energyCost > c.energy.max) {
        warn(
          `${path}.energyCost`,
          'energyCost',
          'val.warnEnergyCost',
          { cost: l.energyCost, max: c.energy.max },
          'hint.warnEnergyCost',
        );
      }
    }),
  );

  // ---------- Доска ----------

  const { width, height, legend, layout, locks } = c.board;
  for (const [ch, entry] of Object.entries(legend)) {
    if (!entry) continue;
    if ('item' in entry) itemRef(entry.item, entry.level, `board.legend.${ch}`, 'item');
    else generatorRef(entry.generator, entry.level, `board.legend.${ch}`);
  }
  if (layout.length !== height) {
    error(
      'board.layout',
      'layout',
      'val.layoutRows',
      { actual: layout.length, expected: height },
      'hint.layout',
    );
  }
  layout.forEach((row, y) => {
    const symbols = [...row];
    if (symbols.length !== width) {
      error(
        `board.layout[${y}]`,
        'layout',
        'val.layoutCols',
        { row: y, actual: symbols.length, expected: width },
        'hint.layout',
      );
    }
    const unknown = symbols.find((s) => !(s in legend));
    if (unknown !== undefined) {
      error(
        `board.layout[${y}]`,
        'unknownSymbol',
        'val.unknownSymbol',
        { char: unknown, row: y },
        'hint.unknownSymbol',
      );
    }
  });
  const usedCells = new Set<string>();
  locks.forEach((lock, li) => {
    itemRef(lock.content.item, lock.content.level, `board.locks[${li}].content`, 'item');
    lock.cells.forEach(([x, y], ci) => {
      const path = `board.locks[${li}].cells[${ci}]`;
      if (x >= width || y >= height) {
        error(path, 'lockCell', 'val.lockOutside', { x, y, width, height }, 'hint.lockCell');
        return;
      }
      const ch = [...(layout[y] ?? '')][x];
      if (ch !== undefined && legend[ch])
        error(path, 'lockCell', 'val.lockOverlap', { x, y, char: ch }, 'hint.lockCell');
      const key = `${x},${y}`;
      if (usedCells.has(key))
        error(path, 'lockCell', 'val.lockDuplicate', { x, y }, 'hint.lockCell');
      usedCells.add(key);
    });
  });

  // Состояния клеток (поле Spice merge).
  const levelIds = new Set(c.levels.map((l) => l.id));
  const entryAt = (x: number, y: number) => {
    const ch = [...(layout[y] ?? '')][x];
    return ch === undefined ? null : (legend[ch] ?? null);
  };
  c.board.cells.forEach((cell, ci) => {
    const [x, y] = cell.cell;
    const path = `board.cells[${ci}]`;
    if (x >= width || y >= height) {
      error(
        `${path}.cell`,
        'lockCell',
        'val.lockOutside',
        { x, y, width, height },
        'hint.lockCell',
      );
      return;
    }
    const key = `${x},${y}`;
    if (usedCells.has(key))
      error(`${path}.cell`, 'cellDuplicate', 'val.cellDuplicate', { x, y }, 'hint.cellDuplicate');
    usedCells.add(key);
    if (cell.requiredLevel > 0 && !levelIds.has(cell.requiredLevel)) {
      error(
        `${path}.requiredLevel`,
        'unknownLevel',
        'val.unknownLevel',
        { level: cell.requiredLevel },
        'hint.unknownLevel',
        {
          list: list([...levelIds].map(String)),
        },
      );
    }
    if (!cell.locked) return;
    const entry = entryAt(x, y);
    if (!entry) {
      error(`${path}.locked`, 'lockedEmpty', 'val.lockedEmpty', { x, y }, 'hint.lockedEmpty');
    } else if ('item' in entry) {
      const max = chainMax.get(entry.item);
      const chainDef = c.chains.find((ch) => ch.id === entry.item);
      if (max !== undefined && entry.level >= max && !chainDef?.mergesInto) {
        error(
          `${path}.locked`,
          'lockedMaxLevel',
          'val.lockedMaxLevel',
          { x, y },
          'hint.lockedMaxLevel',
        );
      }
    } else {
      const max = genMax.get(entry.generator);
      if (max !== undefined && entry.level >= max) {
        error(
          `${path}.locked`,
          'lockedMaxLevel',
          'val.lockedMaxLevel',
          { x, y },
          'hint.lockedMaxLevel',
        );
      }
    }
  });

  // ---------- Уровни и заказы ----------

  c.levels.forEach((l, li) => {
    l.unlocks.forEach((g, gi) => {
      if (!lockGroups.includes(g)) {
        error(
          `levels[${li}].unlocks[${gi}]`,
          'unknownLockGroup',
          'val.unknownLockGroup',
          { id: g },
          'hint.unknownLockGroup',
          {
            list: list(lockGroups),
          },
        );
      }
    });
    Object.keys(l.orderLevelCap ?? {}).forEach((chain) =>
      chainRef(chain, `levels[${li}].orderLevelCap.${chain}`),
    );
    rewards(l.reward, `levels[${li}].reward`);
  });
  c.orders.templates.forEach((tpl, ti) => {
    const path = `orders.templates[${ti}]`;
    tpl.requirements.forEach((r, ri) => selector(r, `${path}.requirements[${ri}]`));
    rewards(tpl.rewards, `${path}.rewards`);
  });
  weights(
    c.orders.templates.map((tpl) => tpl.weight),
    'orders.templates',
  );
  if (c.orders.fallbackTemplate !== undefined && !templateIds.includes(c.orders.fallbackTemplate)) {
    error(
      'orders.fallbackTemplate',
      'unknownTemplate',
      'val.unknownTemplate',
      { id: c.orders.fallbackTemplate },
      'hint.unknownTemplate',
      {
        list: list(templateIds),
      },
    );
  }

  // ---------- Пузыри, действия, читы, телеметрия, арт ----------

  c.bubbles.spawnRules.forEach((rule, ri) => {
    if (rule.source !== 'timer') return;
    rule.content.forEach((x, xi) => selector(x, `bubbles.spawnRules[${ri}].content[${xi}]`));
    weights(
      rule.content.map((x) => x.weight),
      `bubbles.spawnRules[${ri}].content`,
    );
  });
  formula(c.bubbles.popCost.formula, 'bubbles.popCost.formula', FORMULA_CONTEXTS.popCost);
  const mergeRules = c.bubbles.spawnRules.flatMap((r, i) => (r.source === 'merge' ? [i] : []));
  const withProbability = c.chains.some((ch) =>
    ch.levels.some((l) => (l.bubbleProbability ?? 0) > 0),
  );
  if (withProbability && mergeRules.length === 0) {
    warn(
      'bubbles.spawnRules',
      'mergeBubbleNoRule',
      'val.warnMergeBubbleNoRule',
      {},
      'hint.warnMergeBubbleNoRule',
    );
  }
  mergeRules
    .slice(1)
    .forEach((i) =>
      warn(
        `bubbles.spawnRules[${i}]`,
        'mergeBubbleDuplicate',
        'val.warnMergeBubbleDuplicate',
        {},
        'hint.warnMergeBubbleDuplicate',
      ),
    );
  if (c.bubbles.maxOnBoard === 0 && c.bubbles.spawnRules.length > 0) {
    warn('bubbles.maxOnBoard', 'bubblesOff', 'val.warnBubblesOff', {}, 'hint.warnBubblesOff');
  }

  c.itemActions.forEach((a, ai) => {
    const path = `itemActions[${ai}]`;
    if (a.sell) formula(a.sell.amount, `${path}.sell.amount`, FORMULA_CONTEXTS.sell);
    if (a.match === '*') return;
    const [head, tail] = a.match.split('.') as [string, string];
    const ok = head === 'generator' ? genMax.has(tail) : chainMax.has(head);
    if (!ok) {
      const id = head === 'generator' ? tail : head;
      error(
        `${path}.match`,
        'unknownPattern',
        'val.unknownPattern',
        { match: a.match, id },
        'hint.unknownChain',
        {
          list: list(chainMax.keys()),
        },
      );
    } else if (head !== 'generator' && tail !== '*' && Number(tail) > chainMax.get(head)!) {
      error(
        `${path}.match`,
        'levelTooHigh',
        'val.levelTooHigh',
        { level: tail, max: chainMax.get(head)!, id: head },
        'hint.levelTooHigh',
      );
    }
  });

  if (c.cheats.skipTime.enabled && c.cheats.skipTime.minutes.length === 0) {
    error(
      'cheats.skipTime.minutes',
      'emptySkipTime',
      'val.emptySkipTime',
      {},
      'hint.emptySkipTime',
    );
  }
  c.telemetry.counters.forEach((counter, ci) => {
    // Диапазон счётчика может быть шире цепочки (например, [1, 99] — «любой уровень»).
    const m = counter.match;
    const path = `telemetry.counters[${ci}].match`;
    if (m.level !== undefined) itemRef(m.chain, m.level, path);
    else chainRef(m.chain, `${path}.chain`);
  });
  for (const field of ['items', 'overrides'] as const) {
    for (const key of Object.keys(c.art[field])) {
      const [id, levelStr] = key.split(':') as [string, string];
      const level = Number(levelStr);
      const gen = id.startsWith('generator.') ? id.slice('generator.'.length) : null;
      const max = gen !== null ? genMax.get(gen) : chainMax.get(id);
      if (max === undefined || level < 1 || level > max) {
        error(`art.${field}.${key}`, 'artKey', 'val.artKey', { key }, 'hint.artKey');
      }
    }
  }

  // ---------- Предупреждения ----------

  // Стартовая доска с учётом состояний клеток: с какого уровня клетка доступна и закрыта ли она.
  type Placed = { requiredLevel: number; closed: boolean; locked: boolean };
  const cellCfg = new Map(c.board.cells.map((cc) => [`${cc.cell[0]},${cc.cell[1]}`, cc]));
  const initialGenerators: ({ id: string; level: number } & Placed)[] = [];
  const initialItems: (ItemLevel & Placed)[] = [];
  layout.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const entry = legend[ch];
      if (!entry) return;
      const cfg = cellCfg.get(`${x},${y}`);
      const placed = {
        requiredLevel: cfg?.requiredLevel ?? 0,
        closed: cfg?.closed ?? false,
        locked: cfg?.locked ?? false,
      };
      if ('generator' in entry)
        initialGenerators.push({ id: entry.generator, level: entry.level, ...placed });
      else initialItems.push({ chain: entry.item, level: entry.level, ...placed });
    }),
  );
  if (initialGenerators.length === 0)
    warn('board.layout', 'noGenerators', 'val.warnNoGenerators', {}, 'hint.warnNoGenerators');
  if (c.orders.reachability.mode === 'off') {
    warn('orders.reachability.mode', 'reachOff', 'val.warnReachOff', {}, 'hint.warnReachOff');
  }

  const unlocked = new Set(c.levels.flatMap((l) => l.unlocks));
  const reportedGroups = new Set<string>();
  locks.forEach((lock, li) => {
    if (!unlocked.has(lock.group) && !reportedGroups.has(lock.group)) {
      reportedGroups.add(lock.group);
      warn(
        `board.locks[${li}].group`,
        'lockNeverOpens',
        'val.warnLockNeverOpens',
        { group: lock.group },
        'hint.warnLockNeverOpens',
      );
    }
    const { item, level } = lock.content;
    const max = chainMax.get(item);
    if (max === undefined) return;
    const name = chainName.get(item)?.[level - 1] ?? item;
    if (level >= max) {
      warn(
        `board.locks[${li}].content`,
        'lockMaxLevel',
        'val.warnLockMaxLevel',
        { name },
        'hint.warnLockMaxLevel',
      );
      return;
    }
    // Предмет в замке получается слиянием, если генератор на доске выдаёт эту цепочку не выше нужного уровня.
    const hasSource = initialGenerators.some(({ id, level: gl }) =>
      c.generators
        .find((g) => g.id === id)
        ?.levels[gl - 1]?.produces.some(
          (p) => (p.weight ?? p.count ?? 0) > 0 && p.chain === item && p.level <= level,
        ),
    );
    if (!hasSource) {
      warn(
        `board.locks[${li}].content`,
        'lockNoSource',
        'val.warnLockNoSource',
        { name, level },
        'hint.warnLockNoSource',
      );
    }
  });

  // Достижимость по уровням — только для конфига без ошибок: нужны скомпилированные правила.
  if (!hasErrors(issues)) {
    const rules = compileRules(c);
    const counted = rules.orders.reach.sources;
    // DECISION: генератор в закрытой или заблокированной клетке считается источником с уровня
    // `requiredLevel` (оптимистично: клетку можно открыть); предметы — только в открытых клетках.
    const generatorSourcesAt = (levelId: number): ItemLevel[] =>
      counted.has('generator')
        ? initialGenerators
            .filter((g) => g.requiredLevel <= levelId)
            .flatMap(({ id, level }) =>
              rules.generators.get(id)!.levels[level - 1]!.produces.filter((p) => p.weight > 0),
            )
        : [];
    const existingAt = (levelId: number): ItemLevel[] =>
      initialItems.filter((it) => it.requiredLevel <= levelId && !it.closed && !it.locked);
    const lockedCellSourcesAt = (levelId: number): ItemLevel[] =>
      counted.has('lockedCellsAfterUnlock')
        ? initialItems
            .filter((it) => it.locked && it.requiredLevel <= levelId)
            .map((it) => ({ chain: it.chain, level: it.level + 1 }))
        : [];
    const extra: ItemLevel[] = [];
    if (counted.has('bubble')) {
      for (const timer of rules.bubbles.timers) {
        for (const x of timer.content)
          for (let l = x.levels[0]; l <= x.levels[1]; l++) extra.push({ chain: x.chain, level: l });
      }
    }
    const openGroups = new Set<string>();
    rules.levels.forEach((level, li) => {
      level.unlocks.forEach((g) => openGroups.add(g));
      const lockSources: ItemLevel[] = counted.has('lockedCellsAfterUnlock')
        ? locks
            .filter((l) => openGroups.has(l.group))
            .map((l) => ({ chain: l.content.item, level: l.content.level + 1 }))
        : [];
      const rewardSources: ItemLevel[] = counted.has('reward')
        ? [...rules.orders.templates.flatMap((tpl) => tpl.rewards), ...level.reward].flatMap((r) =>
            r.type === 'item' ? [{ chain: r.chain, level: r.level }] : [],
          )
        : [];
      const reach = reachableLevels(
        rules,
        {
          sources: [
            ...generatorSourcesAt(level.id),
            ...lockSources,
            ...lockedCellSourcesAt(level.id),
            ...extra,
            ...rewardSources,
          ],
          existing: existingAt(level.id),
        },
        level.orderLevelCap,
      );
      const passes = rules.orders.templates.some(
        (tpl) =>
          level.id >= tpl.boardLevels[0] &&
          level.id <= tpl.boardLevels[1] &&
          tpl.requirements.some((r) => {
            for (let l = r.levels[0]; l <= r.levels[1]; l++)
              if (reach.get(r.chain)?.has(l)) return true;
            return false;
          }),
      );
      if (!passes)
        warn(
          `levels[${li}]`,
          'noTemplate',
          'val.warnNoTemplate',
          { level: level.id },
          'hint.warnNoTemplate',
        );
    });
  }

  return issues;
}
