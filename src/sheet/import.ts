import type { GameConfigInput } from '@/config';
import { t } from '@/i18n/ru';
import {
  bool,
  configId,
  normId,
  num,
  records,
  sheet,
  str,
  type CellValue,
  type SheetBook,
} from './table';

/**
 * Импорт выгрузки Google Таблиц «Core Merge Config» (Spice merge) в конфиг прототипа.
 * Чистая функция: книга из простых значений → конфиг и отчёт. Чтение .xlsx — в `platform`.
 */

export type ReportLevel = 'imported' | 'default' | 'unsupported' | 'warning';
export interface ReportEntry {
  level: ReportLevel;
  message: string;
}
export interface ImportResult {
  config: GameConfigInput;
  report: ReportEntry[];
}

/** Значения, которых нет в таблице (решения Р11, Р14–Р17 в docs/spice_merge_gap.md). */
export interface ImportOptions {
  name?: string;
  seed?: number;
  /** Стартовая энергия (Р14). */
  energyStart?: number;
  /** Заказов на уровень (Р11). */
  ordersPerLevel?: number;
  /** Последний уровень; по умолчанию — наибольший из уровней поля, распределения и очереди. */
  lastLevel?: number;
  /** Призовая цепочка: уровень → сколько ресурса даёт сбор (Р16). */
  prizeCollect?: Record<number, number>;
  /** Цепочка таблицы → генератор, в который сливаются два объекта её последнего уровня (Р15). */
  mergesInto?: Record<string, string>;
  /** Глубина слияния для достижимости заказов. */
  maxMergeDepth?: number;
  /** Объектов в заказе (по спеке 2–3). */
  itemsPerOrder?: [number, number];
}

export const IMPORT_DEFAULTS = {
  name: 'Spice merge',
  seed: 1,
  energyStart: 100,
  ordersPerLevel: 10,
  prizeCollect: { 5: 1, 6: 2, 7: 4, 8: 8, 9: 16 } as Record<number, number>,
  mergesInto: { chain_D: 'generator_Converter' } as Record<string, string>,
  maxMergeDepth: 8,
  itemsPerOrder: [2, 3] as [number, number],
};

/** Листы, которые читает импорт. */
const KNOWN_SHEETS = [
  'Settings',
  'Objects',
  'Interactables',
  'Chains',
  'Spice Chain Order',
  'Orders Allocation',
  'Orders Difficulty',
  'Orders Rewards',
  'Bonus Order',
  'Bonus Order Reward',
  'Field',
  'Bubbles',
];
const KNOWN_SETTINGS = [
  'access_level',
  'energy_max_capacity',
  'energy_refill_time',
  'energy_refill_step',
  'bonus_order_time_min',
  'bonus_order_time_max',
  'bonus_order_queue_min',
  'bonus_order_queue_max',
];

const SPICE_NAMES: Record<string, string> = {
  spice_rose: 'Роза',
  spice_anise: 'Анис',
  spice_badian: 'Бадьян',
  spice_muskat: 'Мускат',
  spice_jenjen: 'Женьшень',
  spice_kalgan: 'Калган',
  spice_guarana: 'Гуарана',
  spice_shafran: 'Шафран',
  spice_kardamon: 'Кардамон',
  spice_tapioka: 'Тапиока',
  spice_gold: 'Золото',
};
const RESOURCE_NAMES: Record<string, string> = {
  crystal: 'Кристаллы',
  ticket: 'Билеты',
  ruby: 'Рубины',
};
const CATEGORY_NAMES: Record<string, string> = {
  easy: 'Лёгкий',
  medium: 'Средний',
  hard: 'Сложный',
  super_hard: 'Очень сложный',
  regular: 'Обычный',
};
/** Типы заказов из Orders Rewards, записанные иначе, чем категории Orders Difficulty. */
const ORDER_TYPE_ALIASES: Record<string, string> = { very_hard: 'super_hard' };

type Reward = NonNullable<GameConfigInput['levels'][number]['reward']>[number];
type ChainInput = GameConfigInput['chains'][number];
type GeneratorInput = GameConfigInput['generators'][number];
type LegendEntry = GameConfigInput['board']['legend'][string];

interface Group {
  /** id группы в таблице: `chain_A`, `generator_OR`, `generator_Converter`. */
  tableId: string;
  kind: 'chain' | 'generator';
  id: string;
  objects: string[];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const groupOf = (objectId: string) => objectId.replace(/_\d+$/, '');

export function importSheet(book: SheetBook, options: ImportOptions = {}): ImportResult {
  const opt = { ...IMPORT_DEFAULTS, ...options };
  const report: ReportEntry[] = [];
  const add = (level: ReportLevel, message: string) => report.push({ level, message });

  // ---------- Листы ----------

  const sheetNames = Object.keys(book).map((n) => n.trim());
  const service = sheetNames.filter((n) => n.startsWith('#'));
  if (service.length) add('unsupported', t('import.serviceSheets', { list: service.join(', ') }));
  for (const n of sheetNames) {
    if (!n.startsWith('#') && !KNOWN_SHEETS.some((k) => k.toLowerCase() === n.toLowerCase()))
      add('unsupported', t('import.unknownSheet', { name: n }));
  }
  const keyValues = (name: string) => {
    const out = new Map<string, CellValue>();
    for (const r of sheet(book, name)?.slice(1) ?? []) {
      const k = str(r[0] ?? null);
      if (k && !k.startsWith('#')) out.set(k, r[1] ?? null);
    }
    return out;
  };
  const settings = keyValues('Settings');
  for (const k of settings.keys()) {
    if (!KNOWN_SETTINGS.includes(k)) add('unsupported', t('import.unknownSetting', { key: k }));
  }

  // ---------- Объекты и цепочки ----------

  const renamed = new Set<string>();
  const nid = (id: string) => {
    const n = normId(id);
    if (n !== id.trim()) renamed.add(id.trim());
    return n;
  };

  interface ObjectRow {
    extra: string | null;
    baseCost: number | null;
    deletable: boolean | null;
    bubble: number | null;
  }
  const objects = new Map<string, ObjectRow>();
  const objectOrder: string[] = [];
  // Колонки Objects читаются по позиции: заголовок колонки C в выгрузке сломан (#REF!).
  for (const r of sheet(book, 'Objects')?.slice(1) ?? []) {
    const id = str(r[0] ?? null);
    if (!id) continue;
    const key = nid(id);
    objectOrder.push(key);
    objects.set(key, {
      extra: str(r[2] ?? null),
      baseCost: num(r[4] ?? null),
      deletable: bool(r[5] ?? null),
      bubble: num(r[6] ?? null),
    });
  }
  if (sheetNames.some((n) => n === 'Objects') && objectOrder.length > 0) {
    add('unsupported', t('import.icons'));
  }
  const texts = new Map<string, string>();
  for (const r of records(sheet(book, '#Data'))) {
    const id = str(r.object_id ?? null);
    const text = str(r.text ?? null);
    if (id && text) texts.set(nid(id), text);
  }

  // Порядок объектов — по листу Chains (уровень = место в цепочке), иначе по Objects.
  const chainIds = (sheet(book, 'Chains')?.slice(1) ?? [])
    .map((r) => str(r[1] ?? null))
    .filter((x): x is string => !!x)
    .map(nid);
  const groups: Group[] = [];
  for (const objectId of chainIds.length ? chainIds : objectOrder) {
    const tableId = groupOf(objectId);
    let g = groups.find((x) => x.tableId === tableId);
    if (!g) {
      const kind = tableId.startsWith('generator') ? 'generator' : 'chain';
      g = { tableId, kind, id: configId(tableId), objects: [] };
      groups.push(g);
    }
    g.objects.push(objectId);
  }
  const index = new Map<string, { group: Group; level: number }>();
  for (const g of groups) g.objects.forEach((o, i) => index.set(o, { group: g, level: i + 1 }));
  const lookup = (rawId: string, where: string) => {
    const hit = index.get(nid(rawId));
    if (!hit) add('warning', t('import.unknownObject', { id: rawId, where }));
    return hit ?? null;
  };

  // ---------- Ресурсы ----------

  const rewardsDir = records(sheet(book, '#Rewards'));
  const typeCount = new Map<string, number>();
  for (const r of rewardsDir) {
    const type = str(r.item_type ?? null);
    if (type) typeCount.set(type, (typeCount.get(type) ?? 0) + 1);
  }
  const resources = new Map<string, string>();
  /** Награда по id ресурса из таблицы (тип или имя из #Rewards). */
  const rewardFor = (name: string, amount: number): Reward => {
    const row =
      rewardsDir.find((r) => str(r.item_name ?? null) === name) ??
      rewardsDir.find((r) => str(r.item_type ?? null) === name && typeCount.get(name) === 1);
    const type = row ? str(row.item_type ?? null) : null;
    if (type === 'merge_energy' || name === 'merge_energy') return { type: 'energy', amount };
    if (type === 'merge_hard') return { type: 'hard', amount };
    if (!row) add('warning', t('import.unknownReward', { name, id: configId(name) }));
    const single = type !== null && typeCount.get(type) === 1;
    const id = single ? configId(type) : configId(name);
    const comment = row ? str(row['# comment'] ?? null) : null;
    resources.set(id, RESOURCE_NAMES[id] ?? (comment ? `${name} — ${comment}` : name));
    return { type: 'resource', resource: id, amount };
  };

  // ---------- Специи ----------

  const spices = new Map<string, number>();
  let energyRewards = false;
  for (const r of records(sheet(book, 'Spice Chain Order'))) {
    const id = str(r.spice ?? null);
    if (!id) continue;
    spices.set(id, num(r['#merge_price'] ?? null) ?? 0);
    if (num(r.energy_reward ?? null) !== null) energyRewards = true;
  }
  if (energyRewards) add('unsupported', t('import.energyReward'));

  // ---------- Генераторы ----------

  interface Interactable {
    row: Record<string, CellValue>;
    produces: [string, number][];
  }
  const inter = new Map<string, Interactable>();
  const spawnsAfter: string[] = [];
  {
    // Строка с object_id начинает генератор, следующие строки дописывают produced_objects.
    let current: Interactable | null = null;
    for (const r of records(sheet(book, 'Interactables'))) {
      const id = str(r.object_id ?? null);
      if (id) {
        current = { row: r, produces: [] };
        inter.set(nid(id), current);
      }
      const produced = str(r.produced_objects ?? null);
      if (produced && current)
        current.produces.push([produced, num(r.count_per_cycle ?? null) ?? 1]);
      const after = str(r['# Spawns After Used'] ?? null);
      if (after) spawnsAfter.push(after);
    }
  }
  if (spawnsAfter.length)
    add('unsupported', t('import.spawnsAfterUsed', { list: spawnsAfter.join(', ') }));

  const generators: GeneratorInput[] = [];
  const genGroups: Group[] = [];
  for (const g of groups.filter((x) => x.kind === 'generator')) {
    const letter = g.tableId.replace(/^generator_/, '');
    const levels: GeneratorInput['levels'] = [];
    let ok = true;
    for (const [li, objectId] of g.objects.entries()) {
      const found = inter.get(objectId);
      if (!found) {
        add('warning', t('import.noInteractable', { id: objectId }));
        ok = false;
        break;
      }
      const row = found.row;
      const produces = found.produces.flatMap(([id, count]) => {
        const hit = lookup(id, `Interactables: ${objectId}`);
        if (!hit) return [];
        if (hit.group.kind !== 'chain') {
          add('warning', t('import.producesGenerator', { id: objectId, produced: id }));
          return [];
        }
        return [{ chain: hit.group.id, level: hit.level, count }];
      });
      const cycles = num(row.cooldown_cycle ?? null) ?? 0;
      const reload = num(row.reload_time ?? null) ?? 0;
      const skipCost = num(row.skip_cost ?? null) ?? 0;
      const uses = num(row.uses ?? null) ?? 0;
      const deletable = objects.get(objectId)?.deletable ?? null;
      levels.push({
        name: `${letter}${li + 1}`,
        energyCost: 1,
        ...(cycles > 0 && reload > 0
          ? {
              cooldown: {
                cycles,
                seconds: reload,
                ...(skipCost > 0 ? { skipCost } : {}),
                freeSkipSec: num(row.free_skip_time ?? null) ?? 0,
              },
            }
          : {}),
        ...(uses > 0 ? { uses } : {}),
        ...(deletable !== null ? { deletable } : {}),
        produces,
      });
      if (produces.length === 0) ok = false;
    }
    if (!ok || levels.length === 0) continue;
    generators.push({
      id: g.id,
      name: cap(texts.get(g.objects[0]!) ?? `Генератор ${letter}`),
      levels,
    });
    genGroups.push(g);
  }
  add('default', t('import.energyCost'));
  const genById = new Map(genGroups.map((g) => [g.tableId, g]));

  // ---------- Цепочки ----------

  const prizeChains: string[] = [];
  const prizeLevels = Object.keys(opt.prizeCollect)
    .map(Number)
    .sort((a, b) => a - b);
  const chains: ChainInput[] = [];
  for (const g of groups.filter((x) => x.kind === 'chain')) {
    const letter = g.tableId.replace(/^chain_/, '');
    const last = objects.get(g.objects.at(-1)!)?.extra ?? null;
    const prize = last !== null && !spices.has(last) ? last : null;
    const levels: ChainInput['levels'] = g.objects.map((objectId, li) => {
      const level = li + 1;
      const o = objects.get(objectId);
      if (!o) add('warning', t('import.unknownObject', { id: objectId, where: 'Objects' }));
      const entry: ChainInput['levels'][number] = { name: `${letter}${level}` };
      if (o?.deletable !== null && o?.deletable !== undefined) entry.deletable = o.deletable;
      if (o?.baseCost !== null && o?.baseCost !== undefined)
        entry.baseCost = Math.max(0, Math.round(o.baseCost));
      if (o?.bubble) entry.bubbleProbability = Math.min(1, Math.max(0, o.bubble));
      if (o?.extra && spices.has(o.extra)) {
        entry.name = SPICE_NAMES[o.extra] ?? o.extra;
        entry.collect = 'storage';
        entry.value = spices.get(o.extra)!;
      } else if (o?.extra && o.extra !== prize) {
        add('warning', t('import.unknownExtra', { value: o.extra, id: objectId }));
      }
      const amount = prize ? opt.prizeCollect[level] : undefined;
      if (prize && amount) entry.collect = [rewardFor(prize, amount)];
      return entry;
    });
    if (prize) prizeChains.push(`${g.tableId} → ${prize}`);
    const target = opt.mergesInto[g.tableId];
    const into = target ? genById.get(normId(target)) : undefined;
    if (target && into) {
      add('default', t('import.mergesInto', { chain: g.tableId, generator: target }));
    }
    chains.push({
      id: g.id,
      name: `${cap(texts.get(g.objects[0]!) ?? 'Цепочка')} ${letter}`,
      levels,
      ...(into ? { mergesInto: { generator: into.id, level: 1 } } : {}),
    });
  }
  if (prizeChains.length) {
    add(
      'default',
      t('import.prizeCollect', {
        list: prizeChains.join(', '),
        amounts: prizeLevels.map((l) => `${l} → ${opt.prizeCollect[l]}`).join(', '),
      }),
    );
  }
  add('default', t('import.names'));
  if (renamed.size) add('imported', t('import.cyrillic', { list: [...renamed].join(', ') }));

  // ---------- Поле ----------

  const fieldRows = records(sheet(book, 'Field'));
  const width = Math.max(1, ...fieldRows.map((r) => num(r.x_coordinate ?? null) ?? 0));
  const height = Math.max(1, ...fieldRows.map((r) => num(r.y_coordinate ?? null) ?? 0));
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => '.'));
  const legend: Record<string, LegendEntry> = { '.': null };
  const symbolOf = new Map<string, string>();
  const SYMBOLS = [
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&*+-=?@^~',
  ];
  const cells: NonNullable<GameConfigInput['board']['cells']> = [];
  let maxRequired = 0;
  for (const r of fieldRows) {
    const x = (num(r.x_coordinate ?? null) ?? 0) - 1;
    const y = (num(r.y_coordinate ?? null) ?? 0) - 1;
    if (x < 0 || y < 0) continue;
    const objectId = str(r.object_id ?? null);
    const hit = objectId ? lookup(objectId, `Field (${x + 1}, ${y + 1})`) : null;
    if (hit) {
      const key = `${hit.group.id}:${hit.level}`;
      let ch = symbolOf.get(key);
      if (!ch) {
        ch = SYMBOLS[symbolOf.size]!;
        symbolOf.set(key, ch);
        legend[ch] =
          hit.group.kind === 'chain'
            ? { item: hit.group.id, level: hit.level }
            : { generator: hit.group.id, level: hit.level };
      }
      grid[y]![x] = ch;
    }
    const requiredLevel = num(r.required_level ?? null) ?? 0;
    const closed = bool(r.closed ?? null) ?? false;
    let locked = bool(r.locked ?? null) ?? false;
    if (locked && !hit) {
      add('warning', t('import.lockedEmpty', { x: x + 1, y: y + 1 }));
      locked = false;
    }
    // Объект последнего уровня (без слияния в генератор) в заблокированной клетке не открыть.
    if (locked && hit) {
      const g = hit.group;
      const final =
        hit.level >= g.objects.length && (g.kind === 'generator' || !opt.mergesInto[g.tableId]);
      if (final) {
        add('warning', t('import.lockedMaxLevel', { x: x + 1, y: y + 1, id: objectId! }));
        locked = false;
      }
    }
    maxRequired = Math.max(maxRequired, requiredLevel);
    if (requiredLevel > 0 || closed || locked) {
      cells.push({
        cell: [x, y],
        ...(requiredLevel > 0 ? { requiredLevel } : {}),
        ...(closed ? { closed } : {}),
        ...(locked ? { locked } : {}),
      });
    }
  }

  // ---------- Уровни ----------

  const startLevel = num(settings.get('access_level') ?? null) ?? 1;
  add('imported', t('import.startLevel', { level: startLevel }));
  // Очередь генераторов за уровни: OR_01 → BL_01 → GL_01 → OR_02 → … (Р17).
  const mains = genGroups.filter((g) => g.objects.length > 1);
  const queue: { generator: string; level: number; label: string }[] = [];
  const maxGenLevel = Math.max(0, ...mains.map((g) => g.objects.length));
  for (let l = 1; l <= maxGenLevel; l++) {
    for (const g of mains) {
      if (l <= g.objects.length)
        queue.push({ generator: g.id, level: l, label: g.objects[l - 1]! });
    }
  }
  if (queue.length) {
    add('default', t('import.generatorQueue', { list: queue.map((q) => q.label).join(' → ') }));
  }

  const allocationRows = records(sheet(book, 'Orders Allocation'));
  const maxAllocation = Math.max(0, ...allocationRows.map((r) => num(r.player_level ?? null) ?? 0));
  const lastLevel =
    opt.lastLevel ?? Math.max(startLevel + queue.length, maxRequired, maxAllocation, startLevel);
  const levels: GameConfigInput['levels'] = [];
  for (let id = startLevel; id <= lastLevel; id++) {
    const q = queue[id - startLevel];
    levels.push({
      id,
      ordersRequired: opt.ordersPerLevel,
      reward: q ? [{ type: 'generator', generator: q.generator, level: q.level }] : [],
    });
  }
  add('default', t('import.ordersPerLevel', { count: opt.ordersPerLevel }));
  add('default', t('import.lastLevel', { from: startLevel, to: lastLevel }));

  // ---------- Заказы ----------

  const slug = (s: string) => configId(s.replace(/_order$/i, ''));
  const categories = records(sheet(book, 'Orders Difficulty')).flatMap((r) => {
    const raw = str(r.order_dffculty ?? r.order_difficulty ?? r[Object.keys(r)[0]!] ?? null);
    const min = num(r.min ?? null);
    const max = num(r.max ?? null);
    if (!raw || min === null || max === null) return [];
    const id = slug(raw);
    return [{ id, name: CATEGORY_NAMES[id] ?? raw, value: [min, max] as [number, number] }];
  });
  const categoryIds = new Set(categories.map((c) => c.id));
  const allocation = allocationRows.flatMap((r) => {
    const fromLevel = num(r.player_level ?? null);
    if (fromLevel === null) return [];
    const slots: Record<string, number> = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === 'player_level' || !k) continue;
      const id = slug(k);
      if (!categoryIds.has(id)) continue;
      slots[id] = num(v) ?? 0;
    }
    return [{ fromLevel, slots }];
  });
  const aliased = new Set<string>();
  const categoryRewards = new Map<string, { weight: number; reward: Reward }[]>();
  for (const r of records(sheet(book, 'Orders Rewards'))) {
    const type = str(r.order_type ?? null);
    const objectId = str(r.object_id ?? null);
    const weight = num(r.weight ?? null) ?? 0;
    if (!type || !objectId) continue;
    let id = slug(type);
    if (!categoryIds.has(id) && ORDER_TYPE_ALIASES[id]) {
      aliased.add(`${type} → ${ORDER_TYPE_ALIASES[id]}`);
      id = ORDER_TYPE_ALIASES[id]!;
    }
    // object_E1 — это chain_E_01.
    const m = /^object_(.+?)(\d+)$/.exec(objectId);
    const hit = m
      ? lookup(`chain_${m[1]}_${m[2]!.padStart(2, '0')}`, `Orders Rewards: ${objectId}`)
      : lookup(objectId, 'Orders Rewards');
    if (!hit || hit.group.kind !== 'chain') continue;
    const list = categoryRewards.get(id) ?? [];
    list.push({ weight, reward: { type: 'item', chain: hit.group.id, level: hit.level } });
    categoryRewards.set(id, list);
  }
  for (const a of aliased) add('default', t('import.orderTypeAlias', { alias: a }));
  add(
    'default',
    t('import.itemsPerOrder', { min: opt.itemsPerOrder[0], max: opt.itemsPerOrder[1] }),
  );
  add('default', t('import.maxMergeDepth', { depth: opt.maxMergeDepth }));

  // ---------- Бонусный заказ ----------

  const setting = (key: string, fallback: number, field: string) => {
    const v = num(settings.get(key) ?? null);
    if (v === null) add('default', t('import.bonusDefault', { field, value: fallback }));
    return v ?? fallback;
  };
  const tierRewards = new Map<string, { weight: number; reward: Reward }[]>();
  const seenRows = new Set<string>();
  const bonusRewardRows = sheet(book, 'Bonus Order Reward') ?? [];
  records(bonusRewardRows).forEach((r, i) => {
    const typeKey = Object.keys(r).find((k) => k.endsWith('order_type'));
    const type = typeKey ? str(r[typeKey] ?? null) : null;
    const weight = num(r.weight_reward ?? null) ?? 0;
    if (!type) return;
    const pairs = Object.keys(r)
      .filter((k) => /^item_name_\d+$/.test(k))
      .map((k) => [str(r[k] ?? null), num(r[k.replace('name', 'value')] ?? null) ?? 1] as const)
      .filter((p): p is [string, number] => !!p[0]);
    if (pairs.length === 0) return;
    const text = `${type}: ${pairs.map(([n, v]) => `${n} ×${v}`).join(', ')}`;
    if (seenRows.has(`${weight}|${text}`)) {
      add('warning', t('import.duplicateRow', { row: i + 2, sheet: 'Bonus Order Reward', text }));
    }
    seenRows.add(`${weight}|${text}`);
    if (pairs.length > 1) add('unsupported', t('import.multiReward', { row: i + 2 }));
    const [name, value] = pairs[0]!;
    const id = slug(type);
    const list = tierRewards.get(id) ?? [];
    list.push({ weight, reward: rewardFor(name, value) });
    tierRewards.set(id, list);
  });
  const tiers = records(sheet(book, 'Bonus Order')).flatMap((r) => {
    const raw = str(r.bonus_order_type ?? null);
    const min = num(r.min_price ?? null);
    const max = num(r.max_price ?? null);
    if (!raw || min === null || max === null) return [];
    const id = slug(raw);
    return [
      {
        id,
        name: CATEGORY_NAMES[id] ?? raw,
        weight: 1,
        value: [min, max] as [number, number],
        rewards: tierRewards.get(id) ?? [],
      },
    ];
  });
  if (tiers.length) add('default', t('import.tierWeight'));
  const bonus = tiers.length
    ? {
        afterOrders: [
          setting('bonus_order_queue_min', 9, 'bonus_order_queue_min'),
          setting('bonus_order_queue_max', 12, 'bonus_order_queue_max'),
        ] as [number, number],
        durationSec: [
          setting('bonus_order_time_min', 1000, 'bonus_order_time_min'),
          setting('bonus_order_time_max', 1200, 'bonus_order_time_max'),
        ] as [number, number],
        itemsPerOrder: opt.itemsPerOrder,
        tiers,
      }
    : undefined;

  // ---------- Пузыри, энергия, валюта ----------

  const bubbles = keyValues('Bubbles');
  const bubbleMax = num(bubbles.get('max_bubbles_on_board') ?? null);
  const bubbleMinLevel = num(bubbles.get('min_pass_lvl_for_bubbles_to_drop') ?? null);
  const bubbleLife = num(bubbles.get('bubble_time_to_disappear') ?? null);
  add('default', t('import.bubbles'));
  add('default', t('import.energyStart', { value: opt.energyStart }));
  add('default', t('import.storage'));

  const spiceLevels = chains.flatMap((c) =>
    c.levels.flatMap((l, li) => (l.collect === 'storage' ? [{ c, l, level: li + 1 }] : [])),
  );
  if (spiceLevels.length) add('default', t('import.counters'));

  const config: GameConfigInput = {
    meta: { name: opt.name, seed: opt.seed },
    currencies: {
      hard: { name: 'Сапфиры' },
      resources: [...resources].map(([id, name]) => ({ id, name })),
    },
    energy: {
      max: num(settings.get('energy_max_capacity') ?? null) ?? 100,
      start: opt.energyStart,
      regen: {
        amount: num(settings.get('energy_refill_step') ?? null) ?? 1,
        intervalSec: num(settings.get('energy_refill_time') ?? null) ?? 120,
      },
    },
    chains,
    generators,
    board: {
      width,
      height,
      legend,
      layout: grid.map((row) => row.join('')),
      cells,
    },
    levels,
    orders: {
      mode: 'difficulty',
      reachability: { maxMergeDepth: opt.maxMergeDepth },
      difficulty: {
        categories: categories.map((c) => ({ ...c, rewards: categoryRewards.get(c.id) ?? [] })),
        itemsPerOrder: opt.itemsPerOrder,
        allocation,
      },
      ...(bonus ? { bonus } : {}),
    },
    bubbles: {
      spawnRules: [{ source: 'merge', lifetimeSec: bubbleLife ?? null }],
      ...(bubbleMax !== null ? { maxOnBoard: bubbleMax } : {}),
      ...(bubbleMinLevel !== null ? { minLevel: bubbleMinLevel } : {}),
      movable: true,
      popCost: { formula: 'baseCost' },
    },
    storage: { enabled: true, returnToBoard: false },
    telemetry: {
      counters: spiceLevels.map(({ c, l, level }) => ({
        id: `collected_${c.id}_${level}`,
        name: t('import.counterName', { name: l.name }),
        match: { chain: c.id, level },
        sources: ['collect'],
      })),
    },
  };

  report.unshift({
    level: 'imported',
    message: t('import.summary', {
      chains: chains.length,
      generators: generators.length,
      width,
      height,
      levels: levels.length,
      from: startLevel,
      to: lastLevel,
      categories: categories.length,
      tiers: tiers.length,
    }),
  });
  return { config, report };
}
