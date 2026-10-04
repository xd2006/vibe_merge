import type { GameConfig } from '@/config';
import type { GameEvent } from '@/core';
import { computeMetrics, type Metrics } from './metrics';

/** Сессия — один запуск прототипа; журнал событий хранится целиком. */
export interface SessionRecord {
  id: string;
  configHash: string;
  configName: string;
  /** Реальное время начала и последнего сохранения, мс. */
  startedAt: number;
  updatedAt: number;
  /** Длительность игры: реальное время, пока прототип был открыт, мс. */
  playMs: number;
  events: GameEvent[];
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  durationSec: number;
  metrics: Metrics;
  /** Те же метрики без событий, вызванных читами. */
  metricsWithoutCheats: Metrics;
}

export function summarize(config: GameConfig, s: SessionRecord): SessionSummary {
  return {
    id: s.id,
    startedAt: new Date(s.startedAt).toISOString(),
    durationSec: Math.round(s.playMs / 1000),
    metrics: computeMetrics(config, s.events),
    metricsWithoutCheats: computeMetrics(config, s.events, { excludeCheats: true }),
  };
}

/** JSON: для каждой сессии сводка, значения счётчиков и полный журнал событий. */
export function exportJson(config: GameConfig, sessions: readonly SessionRecord[]): string {
  return JSON.stringify(
    {
      config: { name: config.meta.name, hash: sessions[0]?.configHash ?? null },
      sessions: sessions.map((s) => ({ ...summarize(config, s), events: s.events })),
    },
    null,
    2,
  );
}

// DECISION: разделитель CSV — «;» и BOM в начале: так файл сразу открывается по столбцам
// в Excel с русской локалью; Google Таблицы определяют разделитель сами.
const SEP = ';';
/** Метка UTF-8 для Excel (явным кодом: невидимый символ в исходнике легко потерять). */
const BOM = String.fromCharCode(0xfeff);
const cell = (v: string | number) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV: счётчики и трата энергии (всего и по генераторам), с читами и без, по сессиям. */
export function exportCsv(config: GameConfig, sessions: readonly SessionRecord[]): string {
  const rows: (string | number)[][] = [
    [
      'session',
      'started_at',
      'duration_sec',
      'kind',
      'id',
      'name',
      'value',
      'value_without_cheats',
    ],
  ];
  for (const s of sessions) {
    const sum = summarize(config, s);
    const base = [sum.id, sum.startedAt, sum.durationSec];
    const all = sum.metrics;
    const clean = sum.metricsWithoutCheats;
    all.counters.forEach((c, i) =>
      rows.push([...base, 'counter', c.id, c.name, c.value, clean.counters[i]!.value]),
    );
    if (all.energySpent.total !== null) {
      rows.push([
        ...base,
        'energy',
        'total',
        'Энергия всего',
        all.energySpent.total,
        clean.energySpent.total ?? 0,
      ]);
    }
    if (all.energySpent.byGenerator) {
      const ids = new Set([...Object.keys(all.energySpent.byGenerator)]);
      for (const id of ids) {
        const name = config.generators.find((g) => g.id === id)?.name ?? id;
        rows.push([
          ...base,
          'energy_generator',
          id,
          name,
          all.energySpent.byGenerator[id] ?? 0,
          clean.energySpent.byGenerator?.[id] ?? 0,
        ]);
      }
    }
    rows.push([
      ...base,
      'metric',
      'orders_completed',
      'Выполнено заказов',
      all.ordersCompleted,
      clean.ordersCompleted,
    ]);
    if (config.orders.bonus) {
      const names = {
        created: 'Бонусных заказов появилось',
        completed: 'Бонусных заказов сдано',
        expired: 'Бонусных заказов исчезло',
      };
      for (const key of ['created', 'completed', 'expired'] as const) {
        rows.push([
          ...base,
          'metric',
          `bonus_orders_${key}`,
          names[key],
          all.bonusOrders[key],
          clean.bonusOrders[key],
        ]);
      }
    }
    rows.push([
      ...base,
      'metric',
      'bubbles_popped',
      'Лопнуто пузырей',
      all.bubblesPopped,
      clean.bubblesPopped,
    ]);
    rows.push([
      ...base,
      'metric',
      'hard_spent',
      'Потрачено хард-валюты',
      all.hardSpent,
      clean.hardSpent,
    ]);
    rows.push([
      ...base,
      'metric',
      'cooldown_skips',
      'Пропусков кулдауна',
      all.cooldownSkips,
      clean.cooldownSkips,
    ]);
    rows.push([
      ...base,
      'metric',
      'items_collected',
      'Собрано предметов',
      all.itemsCollected,
      clean.itemsCollected,
    ]);
    for (const r of config.currencies.resources) {
      rows.push([
        ...base,
        'resource',
        r.id,
        r.name,
        all.resourcesGained[r.id] ?? 0,
        clean.resourcesGained[r.id] ?? 0,
      ]);
    }
  }
  return BOM + rows.map((r) => r.map(cell).join(SEP)).join('\r\n') + '\r\n';
}
