// Постобработка картинки предмета — общая для авто и ручного режима:
// вырезание однотонного фона (chroma key), обрезка по границам, приведение к единому размеру.
import sharp from 'sharp';
import { CHROMA, type ChromaKey } from '../../../src/art';

export type Rgb = [number, number, number];

const dist = (r: number, g: number, b: number, k: Rgb) =>
  Math.sqrt((r - k[0]) ** 2 + (g - k[1]) ** 2 + (b - k[2]) ** 2);

/**
 * Фактический цвет фона: медиана пикселей по краю картинки. Модель редко даёт ровно #00FF00,
 * поэтому вырезается реальный цвет фона, если он похож на ожидаемый.
 */
export function estimateBackground(data: Buffer, w: number, h: number, expected: Rgb): Rgb {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    rs.push(data[i]!);
    gs.push(data[i + 1]!);
    bs.push(data[i + 2]!);
  };
  for (let x = 0; x < w; x++) {
    take(x, 0);
    take(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    take(0, y);
    take(w - 1, y);
  }
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const found: Rgb = [median(rs), median(gs), median(bs)];
  return dist(...found, expected) < 160 ? found : expected;
}

/** Доля прозрачных пикселей по краю: картинка уже с прозрачным фоном — вырезать нечего. */
export function borderTransparency(data: Buffer, w: number, h: number): number {
  let transparent = 0;
  let total = 0;
  const check = (x: number, y: number) => {
    total++;
    if (data[(y * w + x) * 4 + 3]! < 16) transparent++;
  };
  for (let x = 0; x < w; x++) {
    check(x, 0);
    check(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    check(0, y);
    check(w - 1, y);
  }
  return transparent / total;
}

export interface ChromaOptions {
  /** Ближе этого расстояния к фону — полностью прозрачно. */
  inner?: number;
  /** Дальше — полностью непрозрачно; между — плавный край. */
  outer?: number;
}

/**
 * Вырезает фон цвета `key` (RGBA на месте). Края получают плавную прозрачность, а с
 * полупрозрачных пикселей снимается «засветка» цветом фона (despill).
 */
export function removeChroma(
  data: Buffer,
  key: Rgb,
  { inner = 70, outer = 140 }: ChromaOptions = {},
  width?: number,
): void {
  const green = key[1] > key[0] && key[1] > key[2];
  const despill = (i: number) => {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (green) {
      data[i + 1] = Math.min(g, Math.max(r, b));
    } else if (r > g && b > g) {
      // Маджента: красный и синий не выше зелёного + половина разницы.
      const cap = g + (Math.min(r, b) - g) / 2;
      data[i] = Math.min(r, cap);
      data[i + 2] = Math.min(b, cap);
    }
  };
  for (let i = 0; i < data.length; i += 4) {
    const d = dist(data[i]!, data[i + 1]!, data[i + 2]!, key);
    if (d <= inner) {
      // Цвет тоже обнуляем: иначе при ресайзе цвет фона подмешивается в края.
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    } else if (d < outer) {
      data[i + 3] = Math.round((data[i + 3]! * (d - inner)) / (outer - inner));
      despill(i);
    }
  }
  // Пиксели сглаживания на границе предмета — смесь с фоном: они остаются непрозрачными,
  // но несут засветку. Снимаем её с непрозрачных пикселей рядом с прозрачными; внутренность
  // предмета не трогаем, чтобы не испортить его собственные цвета.
  if (!width) return;
  const height = data.length / 4 / width;
  const edge: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] !== 255) continue;
      let nearTransparent = false;
      for (let dy = -2; dy <= 2 && !nearTransparent; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (data[(ny * width + nx) * 4 + 3]! < 255) {
            nearTransparent = true;
            break;
          }
        }
      }
      if (nearTransparent) edge.push(i);
    }
  }
  for (const i of edge) despill(i);
}

/** Снимает засветку цветом фона с полупрозрачных пикселей. */
export function despillTranslucent(data: Buffer, key: Rgb): void {
  const green = key[1] > key[0] && key[1] > key[2];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a === 0 || a === 255) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (green) data[i + 1] = Math.min(g, Math.max(r, b));
    else if (r > g && b > g) {
      const cap = g + (Math.min(r, b) - g) / 2;
      data[i] = Math.min(r, cap);
      data[i + 2] = Math.min(b, cap);
    }
  }
}

/** Границы непрозрачной части; `null`, если картинка пуста. */
export function alphaBounds(
  data: Buffer,
  w: number,
  h: number,
  threshold = 16,
): { left: number; top: number; width: number; height: number } | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0
    ? null
    : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export interface ProcessResult {
  png: Buffer;
  /** Размер исходной картинки. */
  source: { width: number; height: number };
  /** Фон уже был прозрачным — chroma key не применялся. */
  keptTransparency: boolean;
}

export class EmptyImageError extends Error {
  constructor() {
    super(
      'После вырезания фона картинка пустая: проверьте, что фон однотонный, а предмет другого цвета',
    );
  }
}

/**
 * Полная постобработка: фон → прозрачность, обрезка по предмету, вписывание в квадрат
 * `size`×`size` с небольшим полем по краю.
 */
export async function processImage(
  input: Buffer,
  chroma: ChromaKey,
  size: number,
): Promise<ProcessResult> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const keptTransparency = borderTransparency(data, w, h) > 0.5;
  if (!keptTransparency)
    removeChroma(data, estimateBackground(data, w, h, CHROMA[chroma].rgb), {}, w);

  const box = alphaBounds(data, w, h);
  if (!box) throw new EmptyImageError();

  const inner = Math.round(size * 0.92);
  const resized = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract(box)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: Math.floor((size - inner) / 2),
      bottom: Math.ceil((size - inner) / 2),
      left: Math.floor((size - inner) / 2),
      right: Math.ceil((size - inner) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer();
  // Фильтр ресайза «звенит» на резкой границе прозрачности и снова окрашивает края —
  // повторно снимаем засветку с полупрозрачных пикселей.
  if (!keptTransparency) despillTranslucent(resized, CHROMA[chroma].rgb);
  const png = await sharp(resized, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
  return { png, source: { width: w, height: h }, keptTransparency };
}

/** Готовый ассет на однотонном фоне — для референса в запросе к модели. */
export function onChromaBackground(png: Buffer, chroma: ChromaKey): Promise<Buffer> {
  const [r, g, b] = CHROMA[chroma].rgb;
  return sharp(png).flatten({ background: { r, g, b } }).png().toBuffer();
}
