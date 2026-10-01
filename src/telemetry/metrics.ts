import type { GameConfig } from '@/config';
import type { GameEvent } from '@/core';

export type CounterSource = GameConfig['telemetry']['counters'][number]['sources'][number];

export interface CounterValue {
  id: string;
  name: string;
  value: number;
}

/** Метрики, посчитанные из журнала событий (ТЗ, раздел 10). */
export interface Metrics {
  /** Потраченная энергия; `null`, если метрика выключена в `telemetry.energySpent`. */
  energySpent: { total: number | null; byGenerator: Record<string, number> | null };
  counters: CounterValue[];
  ordersCompleted: number;
  bubblesPopped: number;
  /** Потраченная хард-валюта (лопание пузырей). */
  hardSpent: number;
  levelsCompleted: number;
  cheatsUsed: number;
}

interface Produced {
  chain: string;
  level: number;
  count: number;
  source: CounterSource;
}

/** Какие предметы и из какого источника даёт событие (для счётчиков). */
function produced(e: GameEvent): Produced[] {
  switch (e.type) {
    case 'merge':
      return e.kind === 'item'
        ? [{ chain: e.chain, level: e.toLevel, count: 1, source: 'merge' }]
        : [];
    case 'item_spawned':
      if (e.source === 'generator')
        return [{ chain: e.chain, level: e.level, count: 1, source: 'generator' }];
      if (e.source === 'reward')
        return [{ chain: e.chain, level: e.level, count: 1, source: 'reward' }];
      return [];
    case 'bubble_popped':
      return [{ chain: e.chain, level: e.level, count: 1, source: 'bubblePop' }];
    case 'order_completed':
      return e.requirements.map((r) => ({
        chain: r.chain,
        level: r.level,
        count: r.count,
        source: 'orderDelivered',
      }));
    default:
      return [];
  }
}

export interface MetricsOptions {
  /** Не учитывать события, вызванные читами. */
  excludeCheats?: boolean;
}

export function computeMetrics(
  config: GameConfig,
  events: readonly GameEvent[],
  { excludeCheats = false }: MetricsOptions = {},
): Metrics {
  const { counters, energySpent } = config.telemetry;
  const values = counters.map(() => 0);
  let energyTotal = 0;
  const byGenerator: Record<string, number> = {};
  const m = {
    ordersCompleted: 0,
    bubblesPopped: 0,
    hardSpent: 0,
    levelsCompleted: 0,
    cheatsUsed: 0,
  };

  for (const e of events) {
    if (e.type === 'cheat_used') m.cheatsUsed++;
    if (excludeCheats && e.cheat) continue;
    switch (e.type) {
      case 'energy_spent':
        energyTotal += e.amount;
        byGenerator[e.generator] = (byGenerator[e.generator] ?? 0) + e.amount;
        break;
      case 'order_completed':
        m.ordersCompleted++;
        break;
      case 'bubble_popped':
        m.bubblesPopped++;
        m.hardSpent += e.cost;
        break;
      case 'level_completed':
        m.levelsCompleted++;
        break;
    }
    for (const p of produced(e)) {
      counters.forEach((c, i) => {
        if (!c.sources.includes(p.source) || c.match.chain !== p.chain) return;
        const { level, levelRange } = c.match;
        const ok =
          level !== undefined
            ? p.level === level
            : !!levelRange && p.level >= levelRange[0] && p.level <= levelRange[1];
        if (ok) values[i]! += p.count;
      });
    }
  }

  return {
    energySpent: {
      total: energySpent.total ? energyTotal : null,
      byGenerator: energySpent.byGenerator ? byGenerator : null,
    },
    counters: counters.map((c, i) => ({ id: c.id, name: c.name, value: values[i]! })),
    ...m,
  };
}
