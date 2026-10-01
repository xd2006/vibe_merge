import { t } from '@/i18n/ru';
import type { Issue } from '@/validator';

/** Список ошибок и предупреждений; клик по пути открывает вкладку нужного блока. */
export function IssuesPanel({
  issues,
  onOpen,
}: {
  issues: readonly Issue[];
  onOpen: (path: string) => void;
}) {
  if (issues.length === 0) {
    return (
      <section className="issues issues-ok" data-testid="issues">
        ✓ {t('editor.noIssues')}
      </section>
    );
  }
  return (
    <section className="issues" data-testid="issues">
      <ul>
        {issues.map((i, n) => (
          <li key={n} className={i.level === 'error' ? 'issue issue-error' : 'issue issue-warning'}>
            <span className="issue-level">{i.level === 'error' ? '⛔' : '⚠'}</span>
            <button type="button" className="issue-path" onClick={() => onOpen(i.path)}>
              {i.path || t('editor.wholeConfig')}
            </button>
            <span className="issue-text">
              {i.message}. <span className="issue-hint">{i.hint}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
