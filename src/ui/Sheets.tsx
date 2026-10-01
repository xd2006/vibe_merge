import type { ReactNode } from 'react';
import { t } from '@/i18n/ru';
import { subjectName } from './names';
import type { GameSession } from './session';
import { useSessionValue } from './useSession';

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

/** Хранилище: стопки предметов; при `returnToBoard` — выбор стопки для возврата на доску. */
export function StorageSheet({
  session,
  onClose,
  onPlace,
}: {
  session: GameSession;
  onClose: () => void;
  onPlace: (key: string) => void;
}) {
  const rules = session.engine.rules;
  const storage = useSessionValue(session, (s) => s.state.storage);
  const boardFull = useSessionValue(session, (s) => !s.state.board.cells.includes(null));
  const canReturn = rules.storage.returnToBoard;

  return (
    <Sheet title={t('storage.title')} onClose={onClose}>
      {!canReturn && <p className="hud-sub">{t('storage.readOnly')}</p>}
      {storage.length === 0 ? (
        <p className="hud-sub">{t('storage.empty')}</p>
      ) : (
        <ul className="stacks">
          {storage.map((st) => (
            <li key={st.key} className="stack" data-testid={`stack-${st.key}`}>
              <span>
                <strong>{subjectName(rules, st)}</strong>{' '}
                <small>{t('item.level', { level: st.level })}</small>
              </span>
              <span className="stack-count">×{st.count}</span>
              {canReturn && (
                <button
                  type="button"
                  className="btn"
                  disabled={boardFull}
                  title={boardFull ? t('storage.boardFull') : undefined}
                  onClick={() => onPlace(st.key)}
                >
                  {t('storage.toBoard')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canReturn && boardFull && storage.length > 0 && (
        <p className="hud-sub">{t('storage.boardFull')}</p>
      )}
    </Sheet>
  );
}

export function CheatsSheet({
  session,
  onClose,
  onReset,
  showFps,
  onToggleFps,
}: {
  session: GameSession;
  onClose: () => void;
  onReset: () => void;
  showFps: boolean;
  onToggleFps: (on: boolean) => void;
}) {
  const cheats = session.config.cheats;
  const dispatch = session.dispatch.bind(session);
  const currency = session.config.currencies.hard.name;
  return (
    <Sheet title={t('cheats.title')} onClose={onClose}>
      <div className="cheats">
        {cheats.addHard.enabled && (
          <button
            type="button"
            className="btn"
            onClick={() => dispatch({ type: 'cheat', cheat: 'addHard' })}
          >
            {t('cheats.addHard', { amount: cheats.addHard.amount, currency })}
          </button>
        )}
        {cheats.refillEnergy.enabled && (
          <button
            type="button"
            className="btn"
            onClick={() => dispatch({ type: 'cheat', cheat: 'refillEnergy' })}
          >
            {t('cheats.refillEnergy')}
          </button>
        )}
        {cheats.skipLevel.enabled && (
          <button
            type="button"
            className="btn"
            onClick={() => dispatch({ type: 'cheat', cheat: 'skipLevel' })}
          >
            {t('cheats.skipLevel')}
          </button>
        )}
        {cheats.skipTime.enabled &&
          cheats.skipTime.minutes.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className="btn"
              onClick={() => dispatch({ type: 'cheat', cheat: 'skipTime', minutes })}
            >
              {t('cheats.skipTime', { minutes })}
            </button>
          ))}
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm(t('cheats.resetConfirm'))) onReset();
          }}
        >
          {t('cheats.reset')}
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={showFps} onChange={(e) => onToggleFps(e.target.checked)} />{' '}
        {t('cheats.fps')}
      </label>
    </Sheet>
  );
}
