import Form from '@rjsf/core';
import type { ErrorSchema, RJSFSchema, UiSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import type { Issue } from '@/validator';
import { buttonTemplates } from './buttons';
import { widgets, type EditorFormContext } from './widgets';

const uiSchema: UiSchema = {
  'ui:submitButtonOptions': { norender: true },
};

/** Путь валидатора `a.b[0].c` → сегменты `['a', 'b', '0', 'c']`. */
export function pathSegments(path: string): string[] {
  return path.match(/[^.[\]]+/g) ?? [];
}

/**
 * Ошибки и предупреждения валидатора для блока — в формате RJSF, чтобы показать их у полей.
 * Предупреждения помечаются значком, но выглядят как ошибки (так их видно в форме).
 */
export function issuesToErrorSchema(issues: readonly Issue[], block: string): ErrorSchema {
  const root: Record<string, unknown> = {};
  for (const issue of issues) {
    const [head, ...rest] = pathSegments(issue.path);
    if (head !== block) continue;
    let node = root;
    for (const seg of rest) node = (node[seg] ??= {}) as Record<string, unknown>;
    const list = ((node.__errors as string[] | undefined) ??= []);
    list.push(`${issue.level === 'warning' ? '⚠ ' : ''}${issue.message}. ${issue.hint}`);
  }
  return root as ErrorSchema;
}

/** Форма одного блока конфига. Собственная валидация RJSF выключена — проверяет наш валидатор. */
export function BlockForm({
  schema,
  formData,
  onChange,
  errors,
  formContext,
  disabled,
}: {
  schema: RJSFSchema;
  formData: unknown;
  onChange: (value: unknown) => void;
  errors: ErrorSchema;
  formContext: EditorFormContext;
  disabled: boolean;
}) {
  return (
    <Form
      schema={schema}
      uiSchema={uiSchema}
      formData={formData}
      validator={validator}
      widgets={widgets}
      templates={{ ButtonTemplates: buttonTemplates }}
      formContext={formContext}
      extraErrors={errors}
      noValidate
      noHtml5Validate
      showErrorList={false}
      disabled={disabled}
      experimental_defaultFormStateBehavior={{
        arrayMinItems: { populate: 'never' },
        emptyObjectFields: 'skipDefaults',
      }}
      onChange={(e) => onChange(e.formData)}
    />
  );
}
