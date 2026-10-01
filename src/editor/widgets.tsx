import type { RegistryWidgetsType, WidgetProps } from '@rjsf/utils';
import { FORMULA_CONTEXTS } from '@/config';
import { FORMULA_VARIABLES, checkFormula, type FormulaVariable } from '@/expr';
import { t } from '@/i18n/ru';

/** Данные для виджетов: существующие id, чтобы ссылки выбирались из списка. */
export interface EditorFormContext {
  chainRef: string[];
  generatorRef: string[];
  lockGroupRef: string[];
  templateRef: string[];
}

/** Какие переменные доступны формуле — по пути поля (id виджета RJSF содержит путь). */
function variablesFor(id: string): readonly FormulaVariable[] {
  if (/chains_\d+_value$/.test(id)) return FORMULA_CONTEXTS.chainValue;
  if (/popCost_formula$/.test(id)) return FORMULA_CONTEXTS.popCost;
  if (/sell_amount$/.test(id)) return FORMULA_CONTEXTS.sell;
  if (/amount$/.test(id)) return FORMULA_CONTEXTS.reward;
  return FORMULA_VARIABLES;
}

/** Формула или число: текстовое поле; числа сохраняются как числа. Ошибка разбора — сразу под полем. */
function FormulaWidget({ id, value, onChange, disabled, readonly }: WidgetProps) {
  const text = value === undefined || value === null ? '' : String(value);
  const check =
    text === ''
      ? null
      : checkFormula(/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text, variablesFor(id));
  return (
    <span className="formula">
      <input
        id={id}
        className="formula-input"
        value={text}
        disabled={disabled || readonly}
        spellCheck={false}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? undefined : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
        }}
      />
      {check && !check.ok && <span className="formula-error">{check.message}</span>}
      <span className="formula-hint">
        {t('editor.formulaVars', { vars: variablesFor(id).join(', ') })}
      </span>
    </span>
  );
}

/** Ссылка на id: выбор из существующих, плюс текущее значение, если его уже нет в списке. */
function refWidget(kind: keyof EditorFormContext) {
  return function RefWidget({ id, value, onChange, disabled, readonly, registry }: WidgetProps) {
    const options = (registry.formContext as EditorFormContext | undefined)?.[kind] ?? [];
    const current = typeof value === 'string' ? value : '';
    const all = current && !options.includes(current) ? [current, ...options] : options;
    return (
      <select
        id={id}
        value={current}
        disabled={disabled || readonly}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      >
        <option value="">—</option>
        {all.map((o) => (
          <option key={o} value={o}>
            {o}
            {!options.includes(o) ? ` (${t('editor.missingRef')})` : ''}
          </option>
        ))}
      </select>
    );
  };
}

export const widgets: RegistryWidgetsType = {
  formula: FormulaWidget,
  chainRef: refWidget('chainRef'),
  generatorRef: refWidget('generatorRef'),
  lockGroupRef: refWidget('lockGroupRef'),
  templateRef: refWidget('templateRef'),
};
