// Рисует простые картинки для всех предметов демо-пресета — «как от художника»: однотонный
// зелёный фон, предмет по центру, имена файлов из art-pack. Нужен, чтобы проверить ручной
// режим (art:import) без генеративной модели: npx tsx scripts/art/fixtures/make-demo-art.ts <папка>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import demo from '../../../presets/demo.json';
import { GameConfigSchema } from '../../../src/config';
import { artItems, type ArtItem } from '../../../src/art';

const out = process.argv[2] ?? 'art-pack/demo-images';
mkdirSync(out, { recursive: true });
const config = GameConfigSchema.parse(demo);

function drawing(it: ArtItem): string {
  const t = it.maxLevel > 1 ? (it.level - 1) / (it.maxLevel - 1) : 1;
  const s = 120 + 220 * t; // размер растёт с уровнем
  const c = 256;
  if (it.kind === 'generator') {
    return `<rect x="${c - 150}" y="${c - 60}" width="300" height="190" rx="16" fill="#7a4b2a"/>
      <polygon points="${c - 180},${c - 50} ${c},${c - 190} ${c + 180},${c - 50}" fill="#b03a2e"/>
      <rect x="${c - 30}" y="${c + 30}" width="60" height="100" fill="#3b2412"/>`;
  }
  if (it.groupId === 'stone') {
    return `<ellipse cx="${c}" cy="${c + 20}" rx="${s / 2}" ry="${s / 2.6}" fill="#8d8f93"/>
      <ellipse cx="${c - s / 8}" cy="${c}" rx="${s / 6}" ry="${s / 9}" fill="#b9bbbf"/>`;
  }
  return `<rect x="${c - s / 2}" y="${c - s / 5}" width="${s}" height="${(s * 2) / 5}" rx="18" fill="#a0642d"/>
    <rect x="${c - s / 2 + 12}" y="${c - s / 10}" width="${s - 24}" height="10" fill="#7a4720"/>`;
}

for (const it of artItems(config)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <rect width="512" height="512" fill="#00ff00"/>${drawing(it)}</svg>`;
  writeFileSync(join(out, it.file), await sharp(Buffer.from(svg)).png().toBuffer());
}
// Плохие примеры — для проверки отчёта импорта.
writeFileSync(
  join(out, 'unknown_item.png'),
  await sharp({ create: { width: 256, height: 256, channels: 3, background: '#00ff00' } })
    .png()
    .toBuffer(),
);
writeFileSync(
  join(out, 'wood_9.png'),
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ff0000' } })
    .png()
    .toBuffer(),
);
console.log(`Картинки демо: ${out}`);
