import { lazy, Suspense, useEffect, useState } from 'react';
import demo from '../presets/demo.json';
import { BUNDLED_CONFIG_FILE, type GameConfig } from '@/config';
import { t } from '@/i18n/ru';
import { isNativeApp } from '@/platform';
import { Prototype } from '@/ui';
import { validateConfig, type Issue } from '@/validator';

// Редактор нужен только в браузере на десктопе — в приложение он не загружается.
const Editor = lazy(() => import('@/editor').then((m) => ({ default: m.Editor })));

type Bundled = { config: GameConfig | null; issues: Issue[] };

/** Конфиг, зашитый в приложение при сборке; если файла нет — демо-пресет. */
async function loadBundledConfig(): Promise<Bundled> {
  let input: unknown = demo;
  try {
    const res = await fetch(BUNDLED_CONFIG_FILE, { cache: 'no-store' });
    if (res.ok) input = await res.json();
  } catch {
    // Нет файла — остаётся демо.
  }
  const r = validateConfig(input);
  return { config: r.ok ? r.config : null, issues: r.issues };
}

export function App() {
  const native = isNativeApp();
  const [bundled, setBundled] = useState<Bundled | null>(null);
  const [playing, setPlaying] = useState<GameConfig | null>(null);

  useEffect(() => {
    if (!native) return;
    void loadBundledConfig().then((b) => {
      setBundled(b);
      setPlaying(b.config);
    });
  }, [native]);

  if (native && !bundled) return <p className="app-loading">{t('app.loading')}</p>;

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
