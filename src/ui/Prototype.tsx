import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameConfig } from '@/config';
import type { Cell, Entity } from '@/core';
import { t } from '@/i18n/ru';
import { ArtLibrary, BoardView, type BoardUi } from '@/render';
import { exposeDebugHook } from './debug';
import { FpsMeter } from './FpsMeter';
import { EnergyBar, HardBalance, LevelProgress, RejectionToast } from './Hud';
import { MetricsSheet } from './MetricsSheet';
import { subjectName } from './names';
import { OrdersBar } from './Orders';
import { clearGame, configHash, loadGame, saveGame } from './persistence';
import { SessionRecorder } from './recorder';
import { SelectionPanel } from './SelectionPanel';
import { GameSession } from './session';
import { CheatsSheet, StorageSheet } from './Sheets';
import { useSessionValue } from './useSession';

/** Партия из сохранения (с офлайн-прогрессом за время отсутствия) или новая. */
function openSession(config: GameConfig): GameSession {
  const saved = loadGame(config);
  const session = new GameSession(config, saved?.state);
  if (saved && saved.elapsedMs > 0) session.dispatch({ type: 'tick', dtMs: saved.elapsedMs });
  return session;
}

/** Как часто сохранять партию, пока идёт только время (без действий игрока). */
const SAVE_EVERY_MS = 5000;

/** Экран прототипа: HUD и заказы сверху, доска, панель выбранного предмета и кнопки снизу. */
export function Prototype({ config, onExit }: { config: GameConfig; onExit?: () => void }) {
  const [session, setSession] = useState(() => openSession(config));
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'storage' | 'cheats' | 'metrics' | null>(null);
  const [showFps, setShowFps] = useState(false);
  const readFps = useCallback(() => view.current?.fps() ?? null, []);
  const hash = useMemo(() => configHash(config), [config]);
  // Каждый запуск и каждый сброс партии — отдельная сессия телеметрии.
  const recorder = useMemo(() => new SessionRecorder(session, hash), [session, hash]);
  const boardHost = useRef<HTMLDivElement>(null);
  const view = useRef<BoardView | null>(null);
  // Доска создаётся один раз на сессию, а обработчик тапа должен видеть актуальный режим.
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const uiRef = useRef<BoardUi>({ selectedUid: null, highlightFree: false });
  uiRef.current = { selectedUid, highlightFree: placing !== null };

  const storageCount = useSessionValue(session, (s) =>
    s.state.storage.reduce((sum, st) => sum + st.count, 0),
  );

  useEffect(() => {
    view.current?.update(session.state, uiRef.current);
  }, [session, selectedUid, placing]);

  useEffect(() => {
    const host = boardHost.current;
    if (!host) return;
    let cancelled = false;

    const onTap = (cell: Cell, entity: Entity | null) => {
      const key = placingRef.current;
      if (key) {
        if (!entity) {
          const r = session.dispatch({ type: 'returnFromStorage', key, to: cell });
          if (!r.rejected) setPlacing(null);
        }
        return;
      }
      if (!entity) return setSelectedUid(null);
      if (entity.kind === 'generator') session.dispatch({ type: 'tapGenerator', at: cell });
      setSelectedUid(entity.uid);
    };

    // Сначала арт (если есть), затем доска: без арта предметы рисуются плейсхолдерами.
    void ArtLibrary.load(config)
      .then((art) =>
        BoardView.create(host, {
          rules: session.engine.rules,
          onCommand: (c) => session.dispatch(c),
          onTap,
          dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
          art,
        }),
      )
      .then((v) => {
        // StrictMode монтирует эффект дважды: первую доску уничтожаем, как только она создастся.
        if (cancelled) return v.destroy();
        view.current = v;
        v.update(session.state, uiRef.current);
      });

    let lastSave = Date.now();
    const save = () => {
      saveGame(config, session.state);
      void recorder.save();
      lastSave = Date.now();
    };
    const unsubscribe = session.subscribe(() => {
      view.current?.update(session.state, uiRef.current);
      if (session.lastCommandType !== 'tick' || Date.now() - lastSave > SAVE_EVERY_MS) save();
    });
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    const removeDebugHook = exposeDebugHook(session);
    session.start();

    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      removeDebugHook();
      session.stop();
      view.current?.destroy();
      view.current = null;
    };
  }, [session, config, recorder]);

  const reset = () => {
    clearGame();
    setSelectedUid(null);
    setPlacing(null);
    setSheet(null);
    setSession(new GameSession(config));
  };

  const placingStack = placing ? session.state.storage.find((st) => st.key === placing) : undefined;

  return (
    <div className="prototype">
      <header className="hud">
        <EnergyBar session={session} />
        <HardBalance session={session} />
        <LevelProgress session={session} />
      </header>
      <OrdersBar session={session} />
      <div className="board" ref={boardHost} data-testid="board" />
      {placingStack ? (
        <div className="panel panel-hint">
          <span className="panel-text">
            {t('storage.choosePlace', { name: subjectName(session.engine.rules, placingStack) })}
          </span>
          <button type="button" className="btn" onClick={() => setPlacing(null)}>
            {t('storage.cancel')}
          </button>
        </div>
      ) : (
        <SelectionPanel session={session} selectedUid={selectedUid} />
      )}
      <nav className="toolbar">
        {onExit && (
          <button type="button" className="btn toolbar-left" onClick={onExit}>
            {t('app.backToEditor')}
          </button>
        )}
        {session.engine.rules.storage.enabled && (
          <button
            type="button"
            className="btn"
            data-testid="open-storage"
            onClick={() => setSheet('storage')}
          >
            {t('storage.button', { count: storageCount })}
          </button>
        )}
        <button
          type="button"
          className="btn"
          data-testid="open-cheats"
          onClick={() => setSheet('cheats')}
        >
          {t('cheats.title')}
        </button>
        <button
          type="button"
          className="btn"
          data-testid="open-metrics"
          onClick={() => setSheet('metrics')}
        >
          {t('metrics.title')}
        </button>
      </nav>
      {sheet === 'storage' && (
        <StorageSheet
          session={session}
          onClose={() => setSheet(null)}
          onPlace={(key) => {
            setPlacing(key);
            setSelectedUid(null);
            setSheet(null);
          }}
        />
      )}
      {sheet === 'cheats' && (
        <CheatsSheet
          session={session}
          onClose={() => setSheet(null)}
          onReset={reset}
          showFps={showFps}
          onToggleFps={setShowFps}
        />
      )}
      {sheet === 'metrics' && (
        <MetricsSheet
          session={session}
          recorder={recorder}
          configHash={hash}
          onClose={() => setSheet(null)}
        />
      )}
      {showFps && <FpsMeter read={readFps} />}
      <RejectionToast session={session} />
    </div>
  );
}
