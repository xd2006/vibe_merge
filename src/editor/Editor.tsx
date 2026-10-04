import type { RJSFSchema } from '@rjsf/utils';
import { useMemo, useRef, useState } from 'react';
import type { GameConfig } from '@/config';
import { t } from '@/i18n/ru';
import { downloadText, readFileText, safeFileName } from '@/platform';
import type { ReportEntry } from '@/sheet';
import { validateText } from '@/validator';
import { ArtPanel } from './ArtPanel';
import { BlockForm, issuesToErrorSchema, pathSegments } from './BlockForm';
import { BoardEditor } from './BoardEditor';
import { PRESETS, toText, useDraft } from './draft';
import { blockSchema, blocks } from './editorSchema';
import { ImportReport } from './ImportReport';
import { IssuesPanel } from './IssuesPanel';
import { JsonPanel } from './JsonPanel';
import { BLOCK_LABELS } from './labels';
import type { EditorFormContext } from './widgets';
import './editor.css';

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {};
const ids = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.flatMap((x) => (typeof asObj(x).id === 'string' ? [asObj(x).id as string] : []))
    : [];

/** Схема доски без полей, которые редактирует сетка. */
function boardRestSchema(): RJSFSchema {
  const s = blockSchema('board');
  const properties = { ...(s.properties as Record<string, RJSFSchema>) };
  delete properties.width;
  delete properties.height;
  delete properties.layout;
  return {
    ...s,
    properties,
    required: (s.required ?? []).filter((r) => !['width', 'height', 'layout'].includes(r)),
  };
}

/** Редактор конфига: форма по блокам и JSON показывают одно и то же содержимое. */
export function Editor({ onRun }: { onRun: (config: GameConfig) => void }) {
  const { text, setText, value, setValue, validation, jsonValid } = useDraft();
  const [tab, setTab] = useState('meta');
  const [view, setView] = useState<'form' | 'json'>('form');
  const fileInput = useRef<HTMLInputElement>(null);
  const sheetInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<readonly ReportEntry[] | null>(null);
  const config = asObj(value);
  const issues = validation.issues;
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.length - errors;

  const formContext = useMemo<EditorFormContext>(
    () => ({
      chainRef: ids(config.chains),
      generatorRef: ids(config.generators),
      lockGroupRef: [
        ...new Set(
          (Array.isArray(asObj(config.board).locks)
            ? (asObj(config.board).locks as unknown[])
            : []
          ).flatMap((l) => (typeof asObj(l).group === 'string' ? [asObj(l).group as string] : [])),
        ),
      ],
      templateRef: ids(asObj(config.orders).templates),
      resourceRef: ids(asObj(config.currencies).resources),
    }),
    [config.chains, config.generators, config.board, config.orders, config.currencies],
  );

  const issueCount = (block: string) =>
    issues.filter((i) => pathSegments(i.path)[0] === block).length;
  const setBlock = (block: string, data: unknown) => {
    // Форма может прислать то же самое при монтировании — не трогаем текст без изменений.
    if (JSON.stringify(data) === JSON.stringify(config[block])) return;
    setValue({ ...config, [block]: data });
  };

  // Импорт таблицы Spice merge: .xlsx → конфиг; отчёт показывается над формой.
  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const [{ readXlsx }, { importSheet }] = await Promise.all([
        import('@/platform/xlsx'),
        import('@/sheet'),
      ]);
      const result = importSheet(await readXlsx(await file.arrayBuffer()));
      const next = toText(result.config);
      if (next !== text && !window.confirm(t('editor.replaceConfirm'))) return;
      setText(next);
      setReport(result.report);
    } catch (e) {
      window.alert(
        t('editor.importFailed', { message: e instanceof Error ? e.message : String(e) }),
      );
    } finally {
      setImporting(false);
    }
  };

  const loadPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const next = toText(preset.config);
    if (next !== text && !window.confirm(t('editor.replaceConfirm'))) return;
    setText(next);
  };

  const openPath = (path: string) => {
    const head = pathSegments(path)[0];
    if (head && blocks().includes(head)) {
      setTab(head);
      setView('form');
    } else setView('json');
  };

  const errorSchema = issuesToErrorSchema(issues, tab);
  const disabled = !jsonValid;

  return (
    <div className="editor">
      <header className="editor-toolbar">
        <h1>{t('editor.title')}</h1>
        <select
          aria-label={t('editor.preset')}
          value=""
          onChange={(e) => loadPreset(e.target.value)}
        >
          <option value="">{t('editor.preset')}</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          {t('editor.load')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="load-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFileText(file).then(setText);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            const name =
              typeof asObj(config.meta).name === 'string'
                ? (asObj(config.meta).name as string)
                : 'config';
            downloadText(`${safeFileName(name)}.json`, text, 'application/json');
          }}
        >
          {t('editor.download')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={importing}
          onClick={() => sheetInput.current?.click()}
        >
          {importing ? t('editor.importing') : t('editor.importSheet')}
        </button>
        <input
          ref={sheetInput}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          data-testid="import-sheet"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />
        <span className="editor-status" data-testid="editor-status">
          {errors > 0 ? `⛔ ${t('editor.errors', { count: errors })}` : `✓ ${t('editor.valid')}`}
          {warnings > 0 && ` · ⚠ ${t('editor.warnings', { count: warnings })}`}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!validation.ok || !validation.config}
          title={!validation.ok ? t('editor.runBlocked') : undefined}
          onClick={() => {
            // Фоновая проверка идёт с задержкой — запускаем по свежей проверке текущего текста.
            const fresh = validateText(text);
            if (fresh.ok && fresh.config) onRun(fresh.config);
          }}
        >
          {t('editor.run')}
        </button>
      </header>

      {report && <ImportReport report={report} onClose={() => setReport(null)} />}

      <div className="view-toggle">
        <button
          type="button"
          className={view === 'form' ? 'btn btn-on' : 'btn'}
          onClick={() => setView('form')}
        >
          {t('editor.form')}
        </button>
        <button
          type="button"
          className={view === 'json' ? 'btn btn-on' : 'btn'}
          onClick={() => setView('json')}
        >
          JSON
        </button>
      </div>

      <div className={`editor-body editor-body-${view}`}>
        <nav className="editor-tabs">
          {blocks().map((b) => (
            <button
              key={b}
              type="button"
              className={b === tab ? 'tab tab-on' : 'tab'}
              onClick={() => setTab(b)}
            >
              {BLOCK_LABELS[b] ?? b}
              {issueCount(b) > 0 && <span className="tab-badge">{issueCount(b)}</span>}
            </button>
          ))}
        </nav>
        <section className="editor-form" data-testid="form" aria-disabled={disabled}>
          {disabled && <div className="form-blocked">{t('editor.jsonInvalid')}</div>}
          {tab === 'art' && (
            <ArtPanel
              config={validation.ok ? validation.config : null}
              raw={asObj(config.art)}
              onArtChange={(art) => setBlock('art', art)}
            />
          )}
          {tab === 'board' ? (
            <>
              <BoardEditor board={asObj(config.board)} onChange={(b) => setBlock('board', b)} />
              <BlockForm
                key="board-rest"
                schema={boardRestSchema()}
                formData={asObj(config.board)}
                onChange={(d) => setBlock('board', { ...asObj(config.board), ...asObj(d) })}
                errors={errorSchema}
                formContext={formContext}
                disabled={disabled}
              />
            </>
          ) : (
            <BlockForm
              key={tab}
              schema={blockSchema(tab)}
              formData={config[tab]}
              onChange={(d) => setBlock(tab, d)}
              errors={errorSchema}
              formContext={formContext}
              disabled={disabled}
            />
          )}
        </section>
        <section className="editor-json">
          <JsonPanel text={text} onChange={setText} />
        </section>
      </div>

      <IssuesPanel issues={issues} onOpen={openPath} />
    </div>
  );
}
