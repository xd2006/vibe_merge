/** Все строки интерфейса. Новые строки добавляются сюда, а не пишутся в компонентах. */
export const ru = {
  'app.title': 'Merge-2 прототип',
} as const;

export type StringKey = keyof typeof ru;

/** Возвращает строку по ключу, подставляя параметры вида {name}. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const template: string = ru[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
