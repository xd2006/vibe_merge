import demo from '../presets/demo.json';
import { parseConfig, type ConfigIssue, type GameConfig } from '@/config';
import { ConfigError, compileRules } from '@/core';
import { t } from '@/i18n/ru';
import { Prototype } from '@/ui';

type Loaded = { ok: true; config: GameConfig } | { ok: false; issues: ConfigIssue[] };

// На этапе 1 прототип запускается с демо-пресетом; выбор конфига появится вместе с редактором.
function load(input: unknown): Loaded {
  const parsed = parseConfig(input);
  if (!parsed.ok) return parsed;
  try {
    compileRules(parsed.config);
  } catch (e) {
    if (e instanceof ConfigError)
      return { ok: false, issues: [{ path: e.path, message: e.message }] };
    throw e;
  }
  return parsed;
}

const loaded = load(demo);

export function App() {
  if (!loaded.ok) {
    return (
      <main className="app">
        <h1>{t('error.configInvalid')}</h1>
        <ul>
          {loaded.issues.map((i) => (
            <li key={i.path + i.message}>
              <code>{i.path}</code>: {i.message}
            </li>
          ))}
        </ul>
      </main>
    );
  }
  return (
    <main className="app">
      <h1 className="visually-hidden">{t('app.title')}</h1>
      <Prototype config={loaded.config} />
    </main>
  );
}
