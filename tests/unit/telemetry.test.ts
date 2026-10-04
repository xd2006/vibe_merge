// Метрики считаются из журнала событий; тест сверяет их с пересчётом, который журнал
// не использует: по принятым командам и состоянию доски до и после хода.
import { describe, expect, it } from 'vitest';
import demo from '../../presets/demo.json';
import { GameConfigSchema } from '@/config';
import { createEngine, entityAt, type Command, type GameEvent, type GameState } from '@/core';
import { computeMetrics, exportCsv, exportJson, type SessionRecord } from '@/telemetry';
import { botDecide } from './bot';

const config = GameConfigSchema.parse(demo);
const engine = createEngine(config);

/** Партия бота с периодическими читами; возвращает журнал и независимый пересчёт. */
function play(steps: number) {
  let state: GameState = engine.initialState();
  const events: GameEvent[] = [];
  const recount = {
    energy: 0,
    energyByGenerator: {} as Record<string, number>,
    orders: 0,
    wood3Merged: 0,
    woodFromGenerators: 0,
  };
  for (let i = 0; i < steps; i++) {
    const command: Command =
      i % 97 === 50 ? { type: 'cheat', cheat: 'refillEnergy' } : botDecide(engine.rules, state);
    const before = state;
    const r = engine.apply(state, command);
    if (r.rejected) continue;
    state = r.state;
    events.push(...r.events);

    if (command.type === 'tapGenerator') {
      const gen = entityAt(before.board, command.at);
      if (gen?.kind === 'generator') {
        const cost = engine.rules.generators.get(gen.generator)!.levels[gen.level - 1]!.energyCost;
        recount.energy += cost;
        // Генератор без стоимости энергию не тратит и в метрике не появляется.
        if (cost > 0) {
          recount.energyByGenerator[gen.generator] =
            (recount.energyByGenerator[gen.generator] ?? 0) + cost;
        }
        // Новый предмет — та клетка, что была пуста и стала занята.
        before.board.cells.forEach((c, idx) => {
          const now = state.board.cells[idx];
          if (c === null && now?.kind === 'item' && now.chain === 'wood')
            recount.woodFromGenerators++;
        });
      }
    }
    if (command.type === 'deliverOrder') recount.orders++;
    if (command.type === 'move') {
      const a = entityAt(before.board, command.from);
      const b = entityAt(before.board, command.to);
      const after = entityAt(state.board, command.to);
      const merged =
        a?.kind === 'item' &&
        (b?.kind === 'item' || b?.kind === 'lock') &&
        after?.kind === 'item' &&
        after.level === a.level + 1;
      if (merged && a.chain === 'wood' && a.level + 1 === 3) recount.wood3Merged++;
    }
  }
  return { events, recount };
}

describe('метрики из журнала событий', () => {
  const { events, recount } = play(3000);

  it('совпадают с независимым пересчётом по командам и доске', () => {
    const m = computeMetrics(config, events);
    expect(m.energySpent.total).toBe(recount.energy);
    expect(m.energySpent.byGenerator).toEqual(recount.energyByGenerator);
    expect(m.ordersCompleted).toBe(recount.orders);
    expect(m.counters.find((c) => c.id === 'wood3_merged')!.value).toBe(recount.wood3Merged);
    expect(recount.energy).toBeGreaterThan(100);
    expect(recount.wood3Merged).toBeGreaterThan(0);
  });

  it('счётчик с несколькими источниками суммирует их', () => {
    const m = computeMetrics(config, events);
    const merges = events.filter(
      (e) => e.type === 'merge' && e.kind === 'item' && e.chain === 'wood',
    ).length;
    const rewards = events.filter(
      (e) => e.type === 'item_spawned' && e.source === 'reward' && e.chain === 'wood',
    ).length;
    expect(m.counters.find((c) => c.id === 'wood_any')!.value).toBe(
      recount.woodFromGenerators + merges + rewards,
    );
  });

  it('читы считаются и отфильтровываются', () => {
    const all = computeMetrics(config, events);
    const clean = computeMetrics(config, events, { excludeCheats: true });
    expect(all.cheatsUsed).toBeGreaterThan(0);
    expect(events.filter((e) => e.cheat).length).toBe(all.cheatsUsed);
    // refillEnergy не тратит энергию — метрика энергии не меняется от фильтра.
    expect(clean.energySpent.total).toBe(all.energySpent.total);
  });

  it('пропуск времени читом исключается вместе со всеми его событиями', () => {
    const e = createEngine(config);
    let s = e.initialState();
    const log: GameEvent[] = [];
    for (const c of [
      { type: 'tapGenerator', at: { x: 1, y: 2 } },
      { type: 'cheat', cheat: 'addHard' },
      { type: 'cheat', cheat: 'skipTime', minutes: 240 },
    ] as Command[]) {
      const r = e.apply(s, c);
      s = r.state;
      log.push(...r.events);
    }
    expect(log.filter((x) => x.cheat).length).toBeGreaterThan(1);
    const clean = computeMetrics(config, log, { excludeCheats: true });
    expect(clean.energySpent.total).toBe(1);
  });
});

describe('экспорт', () => {
  const { events } = play(400);
  const session: SessionRecord = {
    id: 's1',
    configHash: 'abc',
    configName: config.meta.name,
    startedAt: Date.UTC(2026, 9, 1),
    updatedAt: Date.UTC(2026, 9, 1, 0, 5),
    playMs: 300_000,
    events,
  };

  it('JSON: сводка, счётчики и полный журнал', () => {
    const data = JSON.parse(exportJson(config, [session]));
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].events).toHaveLength(events.length);
    expect(data.sessions[0].durationSec).toBe(300);
    expect(data.sessions[0].metrics).toEqual(computeMetrics(config, events));
  });

  it('CSV: счётчики и энергия по генераторам', () => {
    const csv = exportCsv(config, [session]);
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe(
      'session;started_at;duration_sec;kind;id;name;value;value_without_cheats',
    );
    const m = computeMetrics(config, events);
    expect(lines).toContain(
      `s1;2026-10-01T00:00:00.000Z;300;counter;wood3_merged;Брус слиянием;${m.counters[0]!.value};${
        computeMetrics(config, events, { excludeCheats: true }).counters[0]!.value
      }`,
    );
    expect(lines.some((l) => l.includes(';energy_generator;sawmill;Лесопилка;'))).toBe(true);
  });
});
