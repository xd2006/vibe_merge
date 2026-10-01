// Пишет JSON Schema конфига в schema/game-config.schema.json (для подсказок в редакторах кода).
import { mkdirSync, writeFileSync } from 'node:fs';
import { getConfigJsonSchema } from '../src/config';

const out = 'schema/game-config.schema.json';
mkdirSync('schema', { recursive: true });
writeFileSync(out, JSON.stringify(getConfigJsonSchema(), null, 2) + '\n');
console.log(`JSON Schema записана в ${out}`);
