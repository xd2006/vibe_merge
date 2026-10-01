// Простой жадный бот проходит демо-пресет: проверка, что механики этапа 2 складываются в игру
// (заказы → уровни → открытие замков), а не только работают по отдельности.
import { describe, expect, it } from 'vitest';
import demo from '../../presets/demo.json';
import { GameConfigSchema } from '@/config';
import {
  cellOf,
  createEngine,
  type Cell,
  type Command,
  type GameEvent,
  type GameState,
} from '@/core';
import { orderStatus } from '@/core/systems/orders';

const engine = createEngine(GameConfigSchema.parse(demo));
const { rules } = engine;

type Item = { cell: Cell; chain: string; level: number };

function freeItems(s: GameState): Item[] {
  const out: Item[] = [];
  s.board.cells.forEach((e, i) => {
    if (e?.kind === 'item' && !e.bubble)
      out.push({ cell: cellOf(s.board, i), chain: e.chain, level: e.level });
  });
  return out;
}

/** Нужные уровни по цепочкам: требования заказов и содержимое открываемых замков. */
function wanted(s: GameState): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  const add = (chain: string, level: number) =>
    out.set(chain, (out.get(chain) ?? new Set()).add(level));
  for (const slot of s.orders.slots) slot.order?.requirements.forEach((r) => add(r.chain, r.level));
  for (const e of s.board.cells) {
    if (e?.kind === 'lock' && s.lockGroups[e.group] === 'unlockable') add(e.chain, e.level);
  }
  return out;
}

function decide(s: GameState): Command {
  // 1. Сдать готовый заказ.
  const ready = s.orders.slots.findIndex((sl) => sl.order && orderStatus(rules, s, sl.order).ready);
  if (ready >= 0) return { type: 'deliverOrder', slot: ready };

  const items = freeItems(s);
  const want = wanted(s);

  // 2. Открыть замок подходящим предметом.
  for (let i = 0; i < s.board.cells.length; i++) {
    const lock = s.board.cells[i];
    if (lock?.kind !== 'lock' || s.lockGroups[lock.group] !== 'unlockable') continue;
    const key = items.find((it) => it.chain === lock.chain && it.level === lock.level);
    if (key) return { type: 'move', from: key.cell, to: cellOf(s.board, i) };
  }

  // 3. Слить пару одинаковых предметов ниже нужного уровня цепочки.
  for (const a of items) {
    const top = Math.max(0, ...(want.get(a.chain) ?? []));
    if (a.level >= top) continue;
    const b = items.find((x) => x !== a && x.chain === a.chain && x.level === a.level);
    if (b) return { type: 'move', from: a.cell, to: b.cell };
  }

  // 4. Освободить место: удалить ненужный предмет.
  const free = s.board.cells.filter((c) => c === null).length;
  if (free < 3) {
    const junk = items.find((it) => it.level > Math.max(0, ...(want.get(it.chain) ?? [])));
    const victim = junk ?? items.find((it) => !want.get(it.chain)?.has(it.level));
    if (victim) return { type: 'itemAction', at: victim.cell, action: 'delete' };
  }

  // 5. Генерировать то, что нужно (или что угодно, если нужного генератора нет).
  const generators = s.board.cells.flatMap((e, i) =>
    e?.kind === 'generator' && e.cooldownUntil === null ? [{ e, cell: cellOf(s.board, i) }] : [],
  );
  const useful = generators.find(({ e }) =>
    rules.generators.get(e.generator)!.levels[e.level - 1]!.produces.some((p) => want.has(p.chain)),
  );
  const gen = useful ?? generators[0];
  const cost = gen ? rules.generators.get(gen.e.generator)!.levels[gen.e.level - 1]!.energyCost : 0;
  if (gen && free > 0 && s.energy.value >= cost) return { type: 'tapGenerator', at: gen.cell };

  // 6. Ждать: энергия, кулдаун или пузыри.
  return { type: 'tick', dtMs: 30_000 };
}

describe('демо-пресет: бот проходит два уровня', () => {
  it('выполняет заказы, переходит на уровень 2, открывает замки и завершает уровень 2', () => {
    let state = engine.initialState();
    const events: GameEvent[] = [];
    let steps = 0;
    while (!state.level.completedAll && steps < 20_000) {
      const r = engine.apply(state, decide(state));
      expect(r.rejected, JSON.stringify({ step: steps, cmd: decide(state) })).toBeUndefined();
      state = r.state;
      events.push(...r.events);
      steps++;
    }
    const count = (type: GameEvent['type']) => events.filter((e) => e.type === type).length;

    expect(state.level.completedAll).toBe(true);
    expect(count('level_completed')).toBe(2);
    expect(count('order_completed')).toBeGreaterThanOrEqual(13);
    expect(count('lock_opened')).toBe(3);
    expect(events.some((e) => e.type === 'cheat_used')).toBe(false);
    // В процессе сработали пузыри и кулдауны генераторов — механики не простаивают.
    expect(count('generator_cooldown_started')).toBeGreaterThan(0);
    expect(count('item_spawned')).toBeGreaterThan(0);
  });
});
