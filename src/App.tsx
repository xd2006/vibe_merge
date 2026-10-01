import { lazy, Suspense, useState } from 'react';
import demo from '../presets/demo.json';
import type { GameConfig } from '@/config';
import { t } from '@/i18n/ru';
import { isNativeApp } from '@/platform';
import { Prototype } from '@/ui';
import { validateConfig, type Issue } from '@/validator';

// Редактор нужен только в браузере на десктопе — в приложение он не загружается.
const Editor = lazy(() => import('@/editor').then((m) => ({ default: m.Editor })));

/** Конфиг, зашитый в приложение. На этапе 5 сюда подставится выбранный при сборке конфиг. */
function bundledConfig(): { config: GameConfig | null; issues: Issue[] } {
  const r = validateConfig(demo);
  return { config: r.ok ? r.config : null, issues: r.issues };
}

export function App() {
  const native = isNativeApp();
  const [bundled] = useState(() => (native ? bundledConfig() : null));
  const [playing, setPlaying] = useState<GameConfig | null>(bundled?.config ?? null);

  if (bundled && !bundled.config) {
    return (
      <main className="app">
        <h1>{t('error.configInvalid')}</h1>
        <ul>
          {bundled.issues.map((i) => (
            <li key={i.path + i.message}>
              <code>{i.path}</code>: {i.message}
            </li>
          ))}
        </ul>
      </main>
    );
  }

  if (playing) {
    return (
      <main className="app">
        <h1 className="visually-hidden">{t('app.title')}</h1>
        <Prototype config={playing} onExit={native ? undefined : () => setPlaying(null)} />
      </main>
    );
  }

  return (
    <main className="app">
      <Suspense fallback={<p className="app-loading">{t('editor.loading')}</p>}>
        <Editor onRun={setPlaying} />
      </Suspense>
    </main>
  );
}
