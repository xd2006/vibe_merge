// Этап S6: настоящая выгрузка «Core Merge Config» импортируется без ошибок, и пресет
// presets/spice-core.json совпадает с результатом импорта (после правок импорта — `npm run import:sheet`).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readXlsx } from '../src/platform/xlsx';
import { importSheet } from '../src/sheet';
import { validateConfig } from '../src/validator';

const XLSX = 'ext_configs/Core Merge Config_3.xlsx';

describe('выгрузка Core Merge Config', () => {
  it.skipIf(!existsSync(XLSX))(
    'импортируется без ошибок и совпадает с presets/spice-core.json',
    async () => {
      const { config } = importSheet(await readXlsx(readFileSync(XLSX)));
      // Предупреждения по данным таблицы допустимы (заказ «Средний» на уровнях 5–6), ошибок быть не должно.
      expect(validateConfig(config).issues.filter((i) => i.level === 'error')).toEqual([]);
      const preset = JSON.parse(readFileSync('presets/spice-core.json', 'utf8')) as Record<
        string,
        unknown
      >;
      delete preset.$schema;
      expect(JSON.parse(JSON.stringify(config))).toEqual(preset);
    },
    120_000,
  );
});
