// Загрузка и проверка конфига для скриптов арта.
import { existsSync, readFileSync } from 'node:fs';
import type { GameConfig } from '../../../src/config';
import { validateText } from '../../../src/validator';

export const DEFAULT_CONFIG = 'presets/demo.json';

/** Загружает .env (ключ Gemini), если файл есть. */
export function loadEnv(): void {
  if (existsSync('.env')) process.loadEnvFile('.env');
}

/** Конфиг из файла; при ошибках валидации печатает их и завершает процесс. */
export function loadConfig(path = DEFAULT_CONFIG): GameConfig {
  if (!existsSync(path)) {
    console.error(`Файл конфига не найден: ${path}`);
    process.exit(1);
  }
  const result = validateText(readFileSync(path, 'utf8'));
  if (!result.ok || !result.config) {
    console.error(`Конфиг ${path} содержит ошибки:`);
    for (const i of result.issues.filter((x) => x.level === 'error')) {
      console.error(`  ${i.path || '(весь конфиг)'}: ${i.message}. ${i.hint}`);
    }
    process.exit(1);
  }
  return result.config;
}

/** Разбор аргументов вида `файл --флаг значение --флаг2`. */
export function parseArgs(argv: string[]): {
  positional: string[];
  flags: Record<string, string | true>;
} {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[a.slice(2)] = next;
        i++;
      } else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}
