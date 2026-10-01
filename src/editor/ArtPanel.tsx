import { useEffect, useState } from 'react';
import {
  ART_DIR,
  ART_INDEX,
  artItems,
  emptyIndex,
  referenceNote,
  type ArtIndex,
  type ArtItem,
  type ArtMode,
  type ChromaKey,
} from '@/art';
import type { GameConfig } from '@/config';
import { t } from '@/i18n/ru';

type Obj = Record<string, unknown>;
type RowState = { busy?: boolean; message?: string; error?: boolean };

/** Промпт для копирования: для уровней выше первого — с пометкой про референс. */
const promptFor = (it: ArtItem) => (it.level === 1 ? it.prompt : it.prompt + referenceNote(it));

async function post(action: 'generate' | 'import', body: unknown): Promise<void> {
  const res = await fetch(`/__art/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('read error'));
    r.readAsDataURL(file);
  });
}

/**
 * Арт по предметам: режим (авто/ручной), цвет фона, копирование промпта, загрузка готовой
 * картинки перетаскиванием и генерация одного предмета. Генерация и импорт идут через
 * dev-сервер, поэтому ключ Gemini не попадает в браузер.
 */
export function ArtPanel({
  config,
  raw,
  onArtChange,
}: {
  /** Конфиг после проверки (со значениями по умолчанию) или null, если есть ошибки. */
  config: GameConfig | null;
  /** Блок `art` черновика как есть. */
  raw: Obj;
  onArtChange: (art: Obj) => void;
}) {
  const [index, setIndex] = useState<ArtIndex>(emptyIndex);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const dev = import.meta.env.DEV;

  const reloadIndex = () =>
    fetch(`${ART_INDEX}?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<ArtIndex>) : emptyIndex()))
      .then(setIndex)
      .catch(() => setIndex(emptyIndex()));
  useEffect(() => {
    void reloadIndex();
  }, []);

  if (!config) return <p className="hud-sub">{t('editor.art.needValid')}</p>;
  const items = artItems(config);
  const ownItems = (typeof raw.items === 'object' && raw.items ? raw.items : {}) as Record<
    string,
    Obj
  >;

  const setItem = (key: string, patch: Obj) => {
    const current = { ...(ownItems[key] ?? {}), ...patch };
    for (const k of Object.keys(current)) if (current[k] === undefined) delete current[k];
    const nextItems = { ...ownItems };
    if (Object.keys(current).length === 0) delete nextItems[key];
    else nextItems[key] = current;
    onArtChange({ ...raw, items: nextItems });
  };

  const run = async (key: string, task: () => Promise<void>) => {
    setRows((r) => ({ ...r, [key]: { busy: true, message: t('editor.art.working') } }));
    try {
      await task();
      await reloadIndex();
      setRows((r) => ({ ...r, [key]: { message: t('editor.art.done') } }));
    } catch (e) {
      setRows((r) => ({
        ...r,
        [key]: { error: true, message: e instanceof Error ? e.message : String(e) },
      }));
    }
  };
  const importFile = (it: ArtItem, file: File) =>
    run(it.key, async () =>
      post('import', { config, key: it.key, image: await readAsBase64(file) }),
    );

  return (
    <section className="art-panel" data-testid="art-panel">
      <h3>{t('editor.art.title')}</h3>
      <p className="hud-sub">{t('editor.art.help')}</p>
      {!dev && <p className="hud-sub">{t('editor.art.devOnly')}</p>}
      <label className="art-global">
        {t('editor.art.globalMode')}{' '}
        <select
          value={config.art.mode}
          onChange={(e) => onArtChange({ ...raw, mode: e.target.value as ArtMode })}
        >
          <option value="auto">{t('editor.art.auto')}</option>
          <option value="manual">{t('editor.art.manual')}</option>
        </select>
      </label>
      <ul className="art-list">
        {items.map((it) => {
          const entry = index.items[it.id];
          const src =
            it.override ??
            (entry ? `${ART_DIR}/${entry.file}?v=${encodeURIComponent(entry.createdAt)}` : null);
          const state = rows[it.key];
          const own = ownItems[it.key] ?? {};
          return (
            <li
              key={it.key}
              className="art-row"
              data-testid={`art-${it.key}`}
              onDragOver={(e) => dev && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (dev && file) void importFile(it, file);
              }}
            >
              <div className={`art-thumb art-${it.chromaKey}`} title={t('editor.art.drop')}>
                {src ? <img src={src} alt={it.name} /> : <span>{it.level}</span>}
              </div>
              <div className="art-info">
                <strong>{it.name}</strong> <code>{it.key}</code>
                <span className="hud-sub">
                  {' · '}
                  {it.override
                    ? t('editor.art.override')
                    : entry
                      ? `${t('editor.art.ready')} (${entry.source}${entry.model ? `, ${entry.model}` : ''})`
                      : t('editor.art.missing')}
                </span>
                {state?.message && (
                  <div className={state.error ? 'art-msg art-msg-error' : 'art-msg'}>
                    {state.message}
                  </div>
                )}
              </div>
              <div className="art-controls">
                <select
                  aria-label="mode"
                  value={typeof own.mode === 'string' ? own.mode : ''}
                  onChange={(e) => setItem(it.key, { mode: e.target.value || undefined })}
                >
                  <option value="">{t('editor.art.inherit')}</option>
                  <option value="auto">{t('editor.art.auto')}</option>
                  <option value="manual">{t('editor.art.manual')}</option>
                </select>
                <select
                  aria-label={t('editor.art.background')}
                  value={it.chromaKey}
                  onChange={(e) =>
                    setItem(it.key, {
                      chromaKey:
                        e.target.value === config.art.chromaKey
                          ? undefined
                          : (e.target.value as ChromaKey),
                    })
                  }
                >
                  <option value="green">green</option>
                  <option value="magenta">magenta</option>
                </select>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(promptFor(it))
                      .then(() =>
                        setRows((r) => ({ ...r, [it.key]: { message: t('editor.art.copied') } })),
                      )
                  }
                >
                  {t('editor.art.copyPrompt')}
                </button>
                {dev && (
                  <label className="btn">
                    {t('editor.art.upload')}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void importFile(it, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
                {dev && it.mode === 'auto' && !it.override && (
                  <button
                    type="button"
                    className="btn"
                    disabled={state?.busy}
                    onClick={() =>
                      void run(it.key, () => post('generate', { config, key: it.key }))
                    }
                  >
                    {t('editor.art.generate')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
