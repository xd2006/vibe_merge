// npm run art:prompts [конфиг] — папка art-pack/ для ручного режима: промпты, имена файлов, чек-лист.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHROMA, artItems, referenceNote, type ArtItem } from '../../src/art';
import { DEFAULT_CONFIG, loadConfig, parseArgs } from './lib/config';
import { statusOf } from './lib/ops';

const { positional, flags } = parseArgs(process.argv.slice(2));
const configPath = positional[0] ?? DEFAULT_CONFIG;
const outDir = typeof flags.out === 'string' ? flags.out : 'art-pack';
const config = loadConfig(configPath);
const items = artItems(config);

const groups = new Map<string, ArtItem[]>();
for (const item of items) groups.set(item.groupId, [...(groups.get(item.groupId) ?? []), item]);

const STATUS = { override: 'своя картинка', ready: 'готово', missing: 'нужна картинка' } as const;
const csvCell = (v: string | number) =>
  /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);

let md = `# Промпты для арта: ${config.meta.name}\n\n`;
md += `Конфиг: \`${configPath}\`. Целевой размер ассета: ${config.art.targetSizePx}×${config.art.targetSizePx} px.\n\n`;
md += `## Порядок работы\n\n`;
md += `1. Генерируйте цепочки по одной. Сначала уровень 1, утвердите его — дальше приложите его как референс к промптам остальных уровней (текст для этого уже добавлен).\n`;
md += `2. Сохраните картинки в одну папку под именами из таблицы ниже.\n`;
md += `3. Выполните \`npm run art:import <папка> ${configPath}\` — скрипт проверит имена и размеры, вырежет фон и положит ассеты в проект.\n\n`;
md += `## Требования к картинке\n\n`;
md += `- [ ] Один предмет, по центру, целиком в кадре.\n`;
md += `- [ ] Однотонный фон нужного цвета (указан у каждого предмета), без градиента и узоров.\n`;
md += `- [ ] Без теней на фоне, без текста и рамок.\n`;
md += `- [ ] Квадрат не меньше 512 px (минимум для импорта — 128 px по короткой стороне).\n`;
md += `- [ ] PNG, JPEG или WebP. Можно и с уже прозрачным фоном — тогда фон не вырезается.\n\n`;
md += `## Имена файлов\n\n| Файл | Предмет | Уровень | Фон | Состояние |\n| --- | --- | --- | --- | --- |\n`;
for (const it of items) {
  md += `| \`${it.file}\` | ${it.name} (${it.groupName}) | ${it.level} / ${it.maxLevel} | ${CHROMA[it.chromaKey].prompt} | ${STATUS[statusOf(it)]} |\n`;
}
md += `\n## Промпты по цепочкам\n`;
for (const [, list] of groups) {
  md += `\n### ${list[0]!.groupName}\n`;
  for (const it of list) {
    const prompt = it.level === 1 ? it.prompt : it.prompt + referenceNote(it);
    md += `\n**${it.level}. ${it.name}** → \`${it.file}\`${it.level > 1 ? ' (приложите уровень 1 как референс)' : ''}\n\n\`\`\`\n${prompt}\n\`\`\`\n`;
  }
}

const rows = items.map((it) => ({
  order: items.indexOf(it) + 1,
  file: it.file,
  key: it.key,
  group: it.groupName,
  name: it.name,
  level: it.level,
  maxLevel: it.maxLevel,
  background: CHROMA[it.chromaKey].prompt,
  mode: it.mode,
  status: statusOf(it),
  prompt: it.level === 1 ? it.prompt : it.prompt + referenceNote(it),
}));

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'prompts.md'), md);
writeFileSync(
  join(outDir, 'prompts.json'),
  JSON.stringify({ config: config.meta.name, items: rows }, null, 2) + '\n',
);
const header = Object.keys(rows[0] ?? { file: '' });
writeFileSync(
  join(outDir, 'prompts.csv'),
  [
    header.join(','),
    ...rows.map((r) => header.map((h) => csvCell(r[h as keyof typeof r])).join(',')),
  ].join('\n') + '\n',
);
console.log(
  `Промпты для ${items.length} предметов: ${join(outDir, 'prompts.md')}, prompts.csv, prompts.json`,
);
