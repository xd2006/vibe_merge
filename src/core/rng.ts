/**
 * Seeded RNG xoshiro128**. Состояние — четыре uint32, хранится в состоянии партии,
 * поэтому сохранение и воспроизведение партии дают те же случайные числа.
 */
export type RngState = [number, number, number, number];

/** Отдельный поток на подсистему: правка одной не сдвигает случайность в других. */
export const RNG_STREAMS = ['generators', 'orders', 'bubbles', 'rewards'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function seedRng(seed: number, stream: string): RngState {
  const next = splitmix32((seed ^ hashString(stream)) >>> 0);
  const s: RngState = [next(), next(), next(), next()];
  // Нулевое состояние у xoshiro вырождено.
  if (s.every((v) => v === 0)) s[0] = 1;
  return s;
}

const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

/** Следующее uint32; изменяет `s`. */
export function nextU32(s: RngState): number {
  const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);
  return result;
}

/** Число в [0, 1). */
export function nextFloat(s: RngState): number {
  return nextU32(s) / 0x1_0000_0000;
}

/** Целое в [min, max] включительно. */
export function nextInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(s) * (max - min + 1));
}

/** Целое из диапазона `[min, max]` или само число. */
export function rollRange(s: RngState, value: number | readonly [number, number]): number {
  return typeof value === 'number' ? value : nextInt(s, value[0], value[1]);
}

/**
 * Выбор по относительным весам. Возвращает `undefined`, если сумма весов не положительна.
 * Случайное число берётся всегда, даже при одном варианте, чтобы ход партии не зависел от числа вариантов.
 */
export function pickWeighted<T>(
  s: RngState,
  items: readonly T[],
  weight: (item: T) => number,
): T | undefined {
  const roll = nextFloat(s);
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  if (total <= 0) return undefined;
  let r = roll * total;
  for (const item of items) {
    const w = Math.max(0, weight(item));
    if (r < w) return item;
    r -= w;
  }
  // Погрешность округления: последний вариант с положительным весом.
  return [...items].reverse().find((i) => weight(i) > 0);
}
