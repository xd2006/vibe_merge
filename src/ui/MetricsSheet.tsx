import { useEffect, useState } from 'react';
import { formatDuration, t } from '@/i18n/ru';
import { exportText, safeFileName } from '@/platform';
import { computeMetrics, exportCsv, exportJson } from '@/telemetry';
import { generatorName } from './names';
import { clearSessions, sessionsFor, type SessionRecorder } from './recorder';
import type { GameSession } from './session';
import { Sheet } from './Sheets';
import { useSessionValue } from './useSession';

/** Панель метрик: текущие значения по журналу сессии и экспорт всех сессий конфига. */
export function MetricsSheet({
  session,
  recorder,
  configHash,
  onClose,
}: {
  session: GameSession;
  recorder: SessionRecorder;
  configHash: string;
  onClose: () => void;
}) {
  const [excludeCheats, setExcludeCheats] = useState(false);
  const [stored, setStored] = useState<number | null>(null);
  // Пересчёт при каждом новом событии и раз в секунду — для длительности.
  useSessionValue(session, (s) => s.events.length);
  useSessionValue(session, (s) => Math.floor(s.playMs / 1000));
  const rules = session.engine.rules;
  const config = session.config;
  const m = computeMetrics(config, session.events, { excludeCheats });

  useEffect(() => {
    void sessionsFor(configHash, recorder).then((all) => setStored(all.length - 1));
  }, [configHash, recorder]);

  const exportAs = async (kind: 'json' | 'csv') => {
    await recorder.save();
    const sessions = await sessionsFor(configHash, recorder);
    const name = `${safeFileName(config.meta.name)}-metrics`;
    if (kind === 'json') {
      await exportText(`${name}.json`, exportJson(config, sessions), 'application/json');
    } else {
      await exportText(`${name}.csv`, exportCsv(config, sessions), 'text/csv');
    }
  };

  return (
    <Sheet title={t('metrics.title')} onClose={onClose}>
      <label className="check">
        <input
          type="checkbox"
          checked={excludeCheats}
          onChange={(e) => setExcludeCheats(e.target.checked)}
        />{' '}
        {t('metrics.excludeCheats')}
      </label>
      <dl className="metrics" data-testid="metrics">
        {m.energySpent.total !== null && (
          <>
            <dt>{t('metrics.energyTotal')}</dt>
            <dd data-testid="metric-energy">{m.energySpent.total}</dd>
          </>
        )}
        {m.energySpent.byGenerator &&
          Object.entries(m.energySpent.byGenerator).map(([id, v]) => (
            <div key={id} className="metrics-row">
              <dt>⚡ {generatorName(rules, id, 1)}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        <dt>{t('metrics.orders')}</dt>
        <dd>{m.ordersCompleted}</dd>
        <dt>{t('metrics.bubbles')}</dt>
        <dd>{m.bubblesPopped}</dd>
        <dt>{t('metrics.hardSpent', { currency: config.currencies.hard.name })}</dt>
        <dd>{m.hardSpent}</dd>
        <dt>{t('metrics.cheats')}</dt>
        <dd>{m.cheatsUsed}</dd>
        <dt>{t('metrics.duration')}</dt>
        <dd>{formatDuration(session.playMs)}</dd>
      </dl>
      <h3 className="metrics-h">{t('metrics.counters')}</h3>
      {m.counters.length === 0 ? (
        <p className="hud-sub">{t('metrics.noCounters')}</p>
      ) : (
        <dl className="metrics">
          {m.counters.map((c) => (
            <div key={c.id} className="metrics-row">
              <dt>{c.name}</dt>
              <dd data-testid={`counter-${c.id}`}>{c.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {stored !== null && <p className="hud-sub">{t('metrics.sessions', { count: stored + 1 })}</p>}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={() => void exportAs('json')}>
          {t('metrics.exportJson')}
        </button>
        <button type="button" className="btn" onClick={() => void exportAs('csv')}>
          {t('metrics.exportCsv')}
        </button>
        {stored !== null && stored > 0 && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() =>
              void clearSessions()
                .then(() => recorder.save())
                .then(() => setStored(0))
            }
          >
            {t('metrics.clear')}
          </button>
        )}
      </div>
    </Sheet>
  );
}
