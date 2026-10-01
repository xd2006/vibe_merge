import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, nextU32, pickWeighted, rollRange, seedRng } from './rng';

describe('rng', () => {
  it('одинаковые seed и поток дают одинаковую последовательность', () => {
    const a = seedRng(42, 'generators');
    const b = seedRng(42, 'generators');
    const seqA = Array.from({ length: 10 }, () => nextU32(a));
    const seqB = Array.from({ length: 10 }, () => nextU32(b));
    expect(seqA).toEqual(seqB);
  });

  it('разные потоки и seed дают разные последовательности', () => {
    const first = (seed: number, stream: string) => nextU32(seedRng(seed, stream));
    expect(first(42, 'generators')).not.toBe(first(42, 'orders'));
    expect(first(42, 'generators')).not.toBe(first(43, 'generators'));
  });

  it('nextFloat в [0, 1), nextInt в границах включительно', () => {
    const s = seedRng(1, 'x');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const f = nextFloat(s);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      seen.add(nextInt(s, 2, 4));
    }
    expect([...seen].sort()).toEqual([2, 3, 4]);
  });

  it('rollRange возвращает число как есть и значение из диапазона', () => {
    const s = seedRng(1, 'x');
    expect(rollRange(s, 5)).toBe(5);
    for (let i = 0; i < 100; i++) {
      const v = rollRange(s, [1, 2]);
      expect(v === 1 || v === 2).toBe(true);
    }
  });

  it('pickWeighted соблюдает относительные веса', () => {
    const s = seedRng(7, 'w');
    const items = [
      { id: 'a', w: 80 },
      { id: 'b', w: 20 },
      { id: 'c', w: 0 },
    ];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const n = 20000;
    for (let i = 0; i < n; i++) counts[pickWeighted(s, items, (x) => x.w)!.id]!++;
    expect(counts.c).toBe(0);
    expect(counts.a! / n).toBeCloseTo(0.8, 1);
    expect(counts.b! / n).toBeCloseTo(0.2, 1);
  });

  it('pickWeighted возвращает undefined при нулевой сумме весов', () => {
    expect(pickWeighted(seedRng(1, 'w'), [{ w: 0 }], (x) => x.w)).toBeUndefined();
    expect(pickWeighted(seedRng(1, 'w'), [], () => 1)).toBeUndefined();
  });
});
