// Импорт таблицы Spice merge (.xlsx, выгрузка Google Таблиц) в конфиг прототипа.
// npm run import:sheet [файл.xlsx] [--out presets/spice.json] [--report отчёт.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { t } from '../src/i18n/ru';
import { readXlsx } from '../src/platform/xlsx';
import { importSheet, type ReportLevel } from '../src/sheet';
import { validateConfig } from '../src/validator';
import { parseArgs } from './art/lib/config';

const DEFAULT_INPUT = 'ext_configs/Core Merge Config.xlsx';
const DEFAULT_OUT = 'presets/spice.json';
const LEVELS: ReportLevel[] = ['imported', 'default', 'unsupported', 'warning'];

const { positional, flags } = parseArgs(process.argv.slice(2));
const input = positional[0] ?? DEFAULT_INPUT;
const out = typeof flags.out === 'string' ? flags.out : DEFAULT_OUT;

const book = await readXlsx(readFileSync(input));
const { config, report } = importSheet(book);
writeFileSync(
  out,
  JSON.stringify({ $schema: '../schema/game-config.schema.json', ...config }, null, 2) + '\n',
);

const issues = validateConfig(config).issues;
const lines: string[] = [`# Импорт ${input} → ${out}`, ''];
for (const level of LEVELS) {
  const entries = report.filter((r) => r.level === level);
  if (entries.length === 0) continue;
  lines.push(`## ${t(`import.level.${level}`)}`, '', ...entries.map((e) => `- ${e.message}`), '');
}
lines.push('## Проверка конфига', '');
if (issues.length === 0) lines.push('- ошибок и предупреждений нет');
for (const i of issues) {
  lines.push(
    `- ${i.level === 'error' ? '⛔' : '⚠'} ${i.path || '(конфиг)'}: ${i.message}. ${i.hint}`,
  );
}
const text = lines.join('\n') + '\n';
console.log(text);
if (typeof flags.report === 'string') writeFileSync(flags.report, text);
if (issues.some((i) => i.level === 'error')) process.exit(1);
