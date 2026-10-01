// npm run art:import <папка> [конфиг] — импорт готовых картинок ручного режима.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { artItems } from '../../src/art';
import { DEFAULT_CONFIG, loadConfig, parseArgs } from './lib/config';
import { ArtError, importImage, statusOf } from './lib/ops';

const { positional } = parseArgs(process.argv.slice(2));
const folder = positional[0];
if (!folder || !existsSync(folder)) {
  console.error('Использование: npm run art:import <папка с картинками> [конфиг]');
  process.exit(1);
}
const config = loadConfig(positional[1] ?? DEFAULT_CONFIG);
const items = artItems(config);
const byName = new Map(items.map((it) => [it.file.replace(/\.png$/, ''), it]));

const imported: string[] = [];
const rejected: string[] = [];
for (const file of readdirSync(folder).sort()) {
  const ext = extname(file).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) continue;
  const item = byName.get(file.slice(0, -ext.length));
  if (!item) {
    rejected.push(
      `${file}: нет такого предмета — имя должно быть из таблицы в art-pack/prompts.md`,
    );
    continue;
  }
  try {
    await importImage(config, item, readFileSync(join(folder, file)));
    imported.push(`${file} → ${item.name} (${item.key})`);
  } catch (e) {
    if (!(e instanceof ArtError)) throw e;
    rejected.push(`${file}: ${e.message}`);
  }
}

const missing = items.filter((it) => statusOf(it) === 'missing');
console.log(`\nИмпортировано: ${imported.length}`);
imported.forEach((s) => console.log(`  ✓ ${s}`));
if (rejected.length) {
  console.log(`\nНе подошли: ${rejected.length}`);
  rejected.forEach((s) => console.log(`  ✗ ${s}`));
}
console.log(`\nБез арта (будет плейсхолдер): ${missing.length}`);
missing.forEach((it) =>
  console.log(`  · ${it.file} — ${it.name} (${it.groupName}, ${it.level} ур.)`),
);
if (rejected.length) process.exitCode = 1;
