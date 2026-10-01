import type { IconButtonProps, TemplatesType } from '@rjsf/utils';
import { t } from '@/i18n/ru';

/** Кнопки RJSF с текстом вместо иконок Bootstrap (иконочного шрифта в проекте нет). */
function textButton(label: string, titleKey: Parameters<typeof t>[0], extra = '') {
  return function TextButton({ onClick, disabled, className, style }: IconButtonProps) {
    return (
      <button
        type="button"
        className={`btn rjsf-btn ${extra} ${className ?? ''}`}
        title={t(titleKey)}
        aria-label={t(titleKey)}
        onClick={onClick}
        disabled={disabled}
        style={style}
      >
        {label}
      </button>
    );
  };
}

export const buttonTemplates: Partial<TemplatesType['ButtonTemplates']> = {
  AddButton: textButton(t('editor.btn.add'), 'editor.btn.add', 'rjsf-add'),
  CopyButton: textButton('⧉', 'editor.btn.copy'),
  MoveUpButton: textButton('↑', 'editor.btn.up'),
  MoveDownButton: textButton('↓', 'editor.btn.down'),
  RemoveButton: textButton('✕', 'editor.btn.remove', 'btn-danger'),
};
