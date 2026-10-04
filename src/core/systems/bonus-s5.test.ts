// Этап S5 (Spice merge): бонусный заказ — очередь после N заказов, условие «все генераторы
// открыты», тир по весу, истечение (в том числе офлайн), награды, метрики.
import { describe, expect, it } from 'vitest';
import type { GameConfigInput } from '@/config';
import { computeMetrics } from '@/telemetry';
import { validateConfig } from '@/validator';
import { itemValue } from '../rules';
import { baseConfig, fulfil, makeEngine, placeItems, run, spiceConfig } from '../test-utils';
import type { GameEvent, GameState } from '../types';

function bonusConfig(c: GameConfigInput): void {
  spiceConfig(c);
  c.currencies = { hard: { name: 'Гемы' }, resources: [{ id: 'box', name: 'Коробки' }] };
  c.orders.bonus = {
    afterOrders: [2, 2],
    durationSec: [100, 100],
    tiers: [
      {
        id: 'regular',
        name: 'Обычный',
        weight: 1,
        value: [40, 60],
        rewards: [{ weight: 1, reward: { type: 'resource', resource: 'box', amount: 1 } }],
      },
      {
        id: 'big',
        name: 'Большой',
        weight: 3,
        value: [61, 90],
        rewards: [{ weight: 1, reward: { type: 'hard', amount: 5 } }],
      },
    ],
  };
}
const engine = (patch?: (c: GameConfigInput) => void) =>
  makeEngine((c) => {
    bonusConfig(c);
    patch?.(c);
  });
type Engine = ReturnType<typeof engine>;

/** Сдаёт `n` обычных заказов подряд (всегда первый слот с заказом). */
function deliverOrders(e: Engine, s: GameState, n: number): GameState {
  for (let k = 0; k < n; k++) {
    s = fulfil(
      e,
      s,
      s.orders.slots.findIndex((sl) => sl.order),
    );
  }
  return s;
}

const tick = (dtMs: number) => ({ type: 'tick' as const, dtMs });

describe('бонусный заказ', () => {
  it('появляется после afterOrders выполненных заказов, в диапазоне тира', () => {
    const e = engine();
    let s = e.initialState();
    expect(s.bonus).toEqual({ dueAtOrders: 2, active: null });
    s = deliverOrders(e, s, 1);
    expect(s.bonus.active).toBeNull();
    s = deliverOrders(e, s, 1);
    const active = s.bonus.active!;
    expect(active.expiresAt).toBe(s.nowMs + 100_000);
    const tier = e.rules.orders.bonus!.tiers.find((t) => t.id === active.tier)!;
    expect(active.order.template).toBe(tier.id);
    expect(active.order.totalValue).toBeGreaterThanOrEqual(tier.value[0]);
    expect(active.order.totalValue).toBeLessThanOrEqual(tier.value[1]);
    const sum = active.order.requirements.reduce(
      (a, r) => a + itemValue(e.rules, r.chain, r.level) * r.count,
      0,
    );
    expect(sum).toBe(active.order.totalValue);
  });

  it('число заказов до бонуса — случайно в диапазоне afterOrders', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const e = engine((c) => {
        c.meta.seed = seed;
        c.orders.bonus!.afterOrders = [3, 5];
      });
      const due = e.initialState().bonus.dueAtOrders!;
      expect(due).toBeGreaterThanOrEqual(3);
      expect(due).toBeLessThanOrEqual(5);
      seen.add(due);
    }
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('тир выбирается по весу (3 : 1)', () => {
    let big = 0;
    const n = 200;
    for (let seed = 1; seed <= n; seed++) {
      const e = engine((c) => (c.meta.seed = seed));
      if (deliverOrders(e, e.initialState(), 2).bonus.active!.tier === 'big') big++;
    }
    expect(big / n).toBeGreaterThan(0.65);
    expect(big / n).toBeLessThan(0.85);
  });

  it('ждёт, пока все генераторы на поле не окажутся в открытых клетках', () => {
    // Второй генератор под «песком».
    const sandy = (c: GameConfigInput) => {
      c.board.layout = ['S...', '....', '....', '...S'];
      c.board.cells = [{ cell: [3, 3], closed: true }];
    };
    const e = engine(sandy);
    const s = deliverOrders(e, e.initialState(), 2);
    expect(s.bonus.active).toBeNull();
    const free = engine((c) => {
      sandy(c);
      c.orders.bonus!.requireOpenGenerators = false;
    });
    expect(deliverOrders(free, free.initialState(), 2).bonus.active).not.toBeNull();
  });

  it('исчезает по времени — в том числе одним длинным (офлайн) тиком', () => {
    const e = engine();
    const s = deliverOrders(e, e.initialState(), 2);
    const id = s.bonus.active!.order.id;
    const before = run(e, s, [tick(99_999)]).state;
    expect(before.bonus.active).not.toBeNull();
    const step = run(e, s, [tick(60_000), tick(40_000)]);
    const offline = run(e, s, [tick(3_600_000)]);
    for (const r of [step, offline]) {
      expect(r.state.bonus.active).toBeNull();
      expect(r.state.bonus.dueAtOrders).toBe(s.level.totalOrdersDone + 2);
      expect(r.events).toContainEqual(
        expect.objectContaining({ type: 'bonus_order_expired', orderId: id }),
      );
    }
    expect(step.state.bonus).toEqual(run(e, s, [tick(100_000)]).state.bonus);
  });

  it('сдача: предметы списываются, награда выдаётся, в заказы уровня не идёт', () => {
    const e = engine();
    const s = deliverOrders(e, e.initialState(), 2);
    expect(e.apply(s, { type: 'deliverBonus' }).rejected).toBe('reject.orderNotReady');
    const active = s.bonus.active!;
    const r = run(e, placeItems(s, active.order), [{ type: 'deliverBonus' }]);
    expect(r.state.bonus.active).toBeNull();
    expect(r.state.level.totalOrdersDone).toBe(s.level.totalOrdersDone);
    expect(r.state.bonus.dueAtOrders).toBe(s.level.totalOrdersDone + 2);
    if (active.tier === 'big') expect(r.state.hard).toBe(s.hard + 5);
    else expect(r.state.resources.box).toBe(1);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'reward_granted', source: 'bonus' }),
    );
    expect(e.apply(r.state, { type: 'deliverBonus' }).rejected).toBe('reject.noOrder');
  });

  it('метрики: появилось, сдано, исчезло', () => {
    const e = engine();
    const events: GameEvent[] = [];
    let s = e.initialState();
    const play = (commands: Parameters<typeof run>[2], state = s) => {
      const r = run(e, state, commands);
      events.push(...r.events);
      s = r.state;
    };
    // Обычные заказы сдаются через fulfil; его события здесь не нужны, кроме бонусных.
    for (let k = 0; k < 2; k++) {
      const slot = s.orders.slots.findIndex((sl) => sl.order);
      play([{ type: 'deliverOrder', slot }], placeItems(s, s.orders.slots[slot]!.order!));
    }
    play([{ type: 'deliverBonus' }], placeItems(s, s.bonus.active!.order));
    for (let k = 0; k < 2; k++) {
      const slot = s.orders.slots.findIndex((sl) => sl.order);
      play([{ type: 'deliverOrder', slot }], placeItems(s, s.orders.slots[slot]!.order!));
    }
    play([tick(200_000)]);
    const m = computeMetrics(e.rules.config, events);
    expect(m.bonusOrders).toEqual({ created: 2, completed: 1, expired: 1 });
  });
});

describe('валидатор: бонусный заказ', () => {
  const issuesOf = (patch: (c: GameConfigInput) => void) => {
    const c = baseConfig();
    bonusConfig(c);
    patch(c);
    return validateConfig(c).issues.map((i) => `${i.level}:${i.code}@${i.path}`);
  };

  it('корректный конфиг проходит без замечаний', () => {
    expect(issuesOf(() => {})).toEqual([]);
  });

  it('повтор тира, нулевые веса, нет специй', () => {
    expect(issuesOf((c) => (c.orders.bonus!.tiers[1]!.id = 'regular'))).toContain(
      'error:duplicateId@orders.bonus.tiers[1].id',
    );
    expect(issuesOf((c) => c.orders.bonus!.tiers.forEach((t) => (t.weight = 0)))).toContain(
      'error:zeroWeights@orders.bonus.tiers',
    );
    const noSpices = issuesOf((c) => c.chains[0]!.levels.forEach((l) => delete l.collect));
    expect(noSpices).toContain('error:noSpices@orders.bonus');
  });

  it('тир не собрать даже на последнем уровне — предупреждение', () => {
    expect(issuesOf((c) => (c.orders.bonus!.tiers[1]!.value = [500, 600]))).toEqual([
      'warning:bonusTierUnreachable@orders.bonus.tiers[1]',
    ]);
  });
});
