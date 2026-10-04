// Этап S6: настоящая выгрузка «Core Merge Config» импортируется без ошибок, и пресет
// presets/spice.json совпадает с результатом импорта (после правок импорта — `npm run import:sheet`).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readXlsx } from '../src/platform/xlsx';
import { importSheet } from '../src/sheet';
import { validateConfig } from '../src/validator';

const XLSX = 'ext_configs/Core Merge Config.xlsx';

describe('выгрузка Core Merge Config', () => {
  it.skipIf(!existsSync(XLSX))(
    'импортируется без ошибок и совпадает с presets/spice.json',
    async () => {
      const { config } = importSheet(await readXlsx(readFileSync(XLSX)));
      expect(validateConfig(config).issues).toEqual([]);
      const preset = JSON.parse(readFileSync('presets/spice.json', 'utf8')) as Record<
        string,
        unknown
      >;
      delete preset.$schema;
      expect(JSON.parse(JSON.stringify(config))).toEqual(preset);
    },
    120_000,
  );
});
