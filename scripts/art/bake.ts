// npm run art:bake [конфиг] [--only ключ] [--force] [--model id] — генерация арта через Gemini.
// Цепочки идут по одной: сначала уровень 1, он становится референсом для остальных уровней.
// Готовое кэшируется по хешу (промпт, размер) и модели: повторный запуск не тратит запросы.
import { artItems } from '../../src/art';
import { DEFAULT_CONFIG, loadConfig, loadEnv, parseArgs } from './lib/config';
import { GeminiError, apiKey, artModel } from './lib/gemini';
import { ArtError, generateItem, needsBake } from './lib/ops';

loadEnv();
const { positional, flags } = parseArgs(process.argv.slice(2));
const config = loadConfig(positional[0] ?? DEFAULT_CONFIG);
const model = typeof flags.model === 'string' ? flags.model : artModel();
const force = flags.force === true;
const only = typeof flags.only === 'string' ? flags.only : null;

const items = artItems(config).filter((it) => !only || it.key === only);
if (only && items.length === 0) {
  console.error(
    `Предмет «${only}» не найден. Ключи: ${artItems(config)
      .map((it) => it.key)
      .join(', ')}`,
  );
  process.exit(1);
}
const todo = items.filter((it) => needsBake(it, model, force || !!only));
const manual = items.filter((it) => it.mode === 'manual' && !it.override);
console.log(
  `Модель: ${model}. Генерировать: ${todo.length}, уже готово или своя картинка: ${items.length - todo.length - manual.length}, ручной режим: ${manual.length}.`,
);
if (todo.length === 0) process.exit(0);
apiKey(); // Проверка ключа до первого запроса.

// Порядок: внутри цепочки сначала уровень 1 — он нужен как референс.
todo.sort((a, b) => (a.groupId === b.groupId ? a.level - b.level : 0));
let failed = 0;
for (const item of todo) {
  process.stdout.write(`  ${item.key} (${item.name}) … `);
  try {
    await generateItem(config, item, model);
    console.log('готово');
  } catch (e) {
    failed++;
    if (e instanceof GeminiError || e instanceof ArtError) console.log(`ошибка: ${e.message}`);
    else throw e;
    // Квота или ключ — дальше тоже не получится.
    if (
      e instanceof GeminiError &&
      (e.status === 429 || e.status === 401 || e.status === 403 || e.status === 0)
    ) {
      console.log('Остановлено: проверьте ключ и квоту Gemini (https://ai.dev/rate-limit).');
      break;
    }
  }
}
if (failed) process.exitCode = 1;
