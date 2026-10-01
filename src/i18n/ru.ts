/** Все строки интерфейса. Новые строки добавляются сюда, а не пишутся в компонентах. */
export const ru = {
  'app.title': 'Merge-2 прототип',

  // Схема конфига
  'schema.idFormat':
    'Идентификатор: латинские буквы в нижнем регистре, цифры и «_», начинается с буквы',
  'schema.rangeOrder': 'Начало диапазона больше конца',
  'schema.levelOrRange': 'Укажите ровно одно из полей: level или levelRange',
  'schema.matchPattern': 'Шаблон: «цепочка.уровень», «цепочка.*», «generator.id» или «*»',
  'schema.artKey': 'Ключ арта: «цепочка:уровень» или «generator.id:уровень»',

  // Формулы
  'expr.unexpectedChar': 'Недопустимый символ «{char}»',
  'expr.unexpectedToken': 'Неожиданный элемент «{token}»',
  'expr.unexpectedEnd': 'Формула обрывается',
  'expr.unknownVariable': 'Неизвестная переменная «{name}». Доступны: {allowed}',
  'expr.unknownFunction': 'Неизвестная функция «{name}». Доступны: ceil, floor, round, min, max',
  'expr.arity': 'Функция «{name}» ожидает аргументов: {expected}',
  'expr.notFinite': 'Формула дала нечисловой результат (например, деление на ноль)',

  // Загрузка конфига
  'config.layoutRows': 'В раскладке {actual} строк, а высота доски {expected}',
  'config.layoutCols': 'В строке {row} раскладки {actual} символов, а ширина доски {expected}',
  'config.unknownSymbol': 'Символ «{char}» в строке {row} раскладки отсутствует в легенде',
  'config.unknownChain': 'Цепочка «{id}» не найдена',
  'config.unknownGenerator': 'Генератор «{id}» не найден',
  'config.levelTooHigh': 'Уровень {level} больше максимального ({max}) у «{id}»',
  'config.formula': 'Ошибка в формуле «{source}»: {message}',

  // Отказы команд ядра
  'reject.noEnergy': 'Не хватает энергии',
  'reject.boardFull': 'На доске нет свободного места',
  'reject.cooldown': 'Генератор перезаряжается',
  'reject.notGenerator': 'Здесь нет генератора',
  'reject.emptyCell': 'Клетка пуста',
  'reject.sameCell': 'Предмет не сдвинут',
  'reject.outOfBoard': 'За пределами доски',

  // Прототип
  'hud.energy': 'Энергия',
  'hud.energyValue': '{value} / {max}',
  'hud.nextEnergy': '+{amount} через {time}',
  'hud.energyFull': 'полная',
  'board.cooldown': '{time}',
  'board.levelBadge': '{level}',
  'error.configInvalid': 'Конфиг содержит ошибки',
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

/** Длительность в формате «м:сс» или «ч:мм:сс». */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
