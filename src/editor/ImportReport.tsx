import { t } from '@/i18n/ru';
import type { ReportEntry, ReportLevel } from '@/sheet';

const LEVELS: ReportLevel[] = ['warning', 'unsupported', 'default', 'imported'];
const ICONS: Record<ReportLevel, string> = {
  imported: '✓',
  default: '•',
  unsupported: '—',
  warning: '⚠',
};

/** Отчёт импорта таблицы: что перенесено, что взято по умолчанию и что не поддержано. */
export function ImportReport({
  report,
  onClose,
}: {
  report: readonly ReportEntry[];
  onClose: () => void;
}) {
  return (
    <section className="import-report" data-testid="import-report">
      <header>
        <strong>{t('editor.importReport')}</strong>
        <button type="button" className="btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </header>
      {LEVELS.map((level) => {
        const entries = report.filter((r) => r.level === level);
        if (entries.length === 0) return null;
        return (
          <div key={level} className={`import-group import-${level}`}>
            <h3>{t(`import.level.${level}`)}</h3>
            <ul>
              {entries.map((e, i) => (
                <li key={i}>
                  <span className="import-icon">{ICONS[level]}</span> {e.message}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
