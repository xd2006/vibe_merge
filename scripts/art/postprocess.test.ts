import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { EmptyImageError, alphaBounds, processImage } from './lib/postprocess';

/** Эталонная картинка: однотонный фон и цветной круг не по центру (как отдаёт модель). */
async function sample(
  bg: [number, number, number],
  fg: [number, number, number],
  opts: { size?: number; cx?: number; cy?: number; r?: number; alpha?: boolean } = {},
) {
  const { size = 200, cx = 80, cy = 120, r = 40 } = opts;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    ${opts.alpha ? '' : `<rect width="100%" height="100%" fill="rgb(${bg.join(',')})"/>`}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgb(${fg.join(',')})"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => [
    ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
  ];
  return { data, info, at };
}

describe('постобработка ассета', () => {
  it('вырезает зелёный фон (неточный), обрезает по предмету и приводит к размеру', async () => {
    // Фон не идеально #00FF00 — как обычно у генеративной модели.
    const out = await processImage(await sample([12, 238, 30], [200, 40, 40]), 'green', 64);
    const { info, at, data } = await pixels(out.png);
    expect([info.width, info.height]).toEqual([64, 64]);
    expect(at(0, 0)[3]).toBe(0);
    expect(at(63, 63)[3]).toBe(0);
    const center = at(32, 32);
    expect(center[3]).toBe(255);
    expect(center[0]).toBeGreaterThan(150);
    expect(center[1]).toBeLessThan(80);
    // Предмет обрезан и вписан с полем ~4%: занимает почти весь квадрат.
    const box = alphaBounds(data, 64, 64)!;
    expect(box.width).toBeGreaterThanOrEqual(56);
    expect(box.width).toBeLessThanOrEqual(60);
    expect(out.keptTransparency).toBe(false);
  });

  it('маджента для зелёных предметов: зелёный предмет не вырезается', async () => {
    const out = await processImage(await sample([255, 0, 255], [40, 180, 60]), 'magenta', 64);
    const { at } = await pixels(out.png);
    expect(at(0, 0)[3]).toBe(0);
    expect(at(32, 32)[3]).toBe(255);
    expect(at(32, 32)[1]).toBeGreaterThan(150);
  });

  it('на краях снимается засветка цветом фона', async () => {
    const out = await processImage(await sample([0, 255, 0], [220, 60, 60]), 'green', 128);
    const { data } = await pixels(out.png);
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
      // У почти прозрачных пикселей цвет неточен из-за округления — смотрим заметные.
      if (a > 32 && a < 255) expect(g).toBeLessThanOrEqual(Math.max(r, b) + 4);
    }
  });

  it('картинка с уже прозрачным фоном сохраняет прозрачность', async () => {
    const out = await processImage(
      await sample([0, 0, 0], [0, 200, 0], { alpha: true }),
      'green',
      64,
    );
    expect(out.keptTransparency).toBe(true);
    const { at } = await pixels(out.png);
    // Зелёный предмет на прозрачном фоне не вырезан, хотя ключ — зелёный.
    expect(at(32, 32)[3]).toBe(255);
  });

  it('пустая после вырезания картинка — понятная ошибка', async () => {
    const flat = await sharp({
      create: { width: 50, height: 50, channels: 3, background: '#00ff00' },
    })
      .png()
      .toBuffer();
    await expect(processImage(flat, 'green', 64)).rejects.toBeInstanceOf(EmptyImageError);
  });
});
