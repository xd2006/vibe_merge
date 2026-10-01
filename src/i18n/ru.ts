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
  'config.lockOutside': 'Клетка замка ({x}, {y}) вне доски',
  'config.lockOverlap': 'Клетка замка ({x}, {y}) занята содержимым раскладки',
  'config.unknownLockGroup': 'Группа замков «{id}» не найдена',
  'config.unknownTemplate': 'Шаблон заказа «{id}» не найден',

  // Отказы команд ядра
  'reject.noEnergy': 'Не хватает энергии',
  'reject.boardFull': 'На доске нет свободного места',
  'reject.cooldown': 'Генератор перезаряжается',
  'reject.notGenerator': 'Здесь нет генератора',
  'reject.emptyCell': 'Клетка пуста',
  'reject.sameCell': 'Предмет не сдвинут',
  'reject.outOfBoard': 'За пределами доски',
  'reject.locked': 'Клетка заблокирована',
  'reject.bubble': 'Предмет в пузыре: сначала лопните пузырь',
  'reject.notBubble': 'Здесь нет пузыря',
  'reject.noHard': 'Не хватает валюты',
  'reject.notAllowed': 'Это действие недоступно для предмета',
  'reject.storageDisabled': 'Хранилище выключено',
  'reject.returnDisabled': 'Из хранилища нельзя вернуть предмет',
  'reject.notInStorage': 'Такого предмета нет в хранилище',
  'reject.cellOccupied': 'Клетка занята',
  'reject.noOrder': 'Заказа нет',
  'reject.orderNotReady': 'Не хватает предметов для заказа',
  'reject.cheatDisabled': 'Чит выключен в конфиге',
  'reject.allLevelsDone': 'Все уровни уже пройдены',

  // Прототип: HUD
  'hud.energy': 'Энергия',
  'hud.energyValue': '{value} / {max}',
  'hud.nextEnergy': '+{amount} через {time}',
  'hud.energyFull': 'полная',
  'hud.level': 'Уровень {level}',
  'hud.levelProgress': 'заказы {done} / {required}',
  'hud.allLevelsDone': 'все уровни пройдены',
  'board.cooldown': '{time}',
  'board.levelBadge': '{level}',
  'error.configInvalid': 'Конфиг содержит ошибки',

  // Заказы
  'orders.title': 'Заказы',
  'orders.deliver': 'Сдать',
  'orders.waiting': 'Новый заказ через {time}',
  'orders.pending': 'Нет подходящих заказов',
  'orders.stopped': 'Генерация заказов остановлена: нет подходящего шаблона',
  'orders.fromStorage': 'с учётом хранилища',

  // Выбранный предмет
  'item.level': 'ур. {level}',
  'item.pickUp': 'Забрать',
  'item.delete': 'Удалить',
  'item.sell': 'Продать +{amount}',
  'item.charges': 'Заряды: {charges} / {max}',
  'item.cooldown': 'Перезарядка: {time}',
  'item.bubble': 'В пузыре',
  'item.bubbleExpires': 'исчезнет через {time}',
  'item.pop': 'Лопнуть за {cost}',
  'item.popNoHard': 'Не хватает валюты: нужно {cost}',
  'item.lockSealed': 'Заблокировано. Откроется на уровне {level}',
  'item.lockSealedNever': 'Заблокировано. Ни один уровень не открывает эту группу',
  'item.lockUnlockable': 'Перетащите сюда «{name}» ({level} ур.), чтобы открыть клетку',
  'item.noActions': 'Действий нет',

  // Хранилище
  'storage.title': 'Хранилище',
  'storage.button': 'Склад · {count}',
  'storage.empty': 'Хранилище пусто',
  'storage.toBoard': 'На доску',
  'storage.boardFull': 'Освободите место на доске',
  'storage.readOnly': 'Предметы из хранилища нельзя вернуть на доску',
  'storage.choosePlace': 'Выберите свободную клетку для «{name}»',
  'storage.cancel': 'Отмена',

  // Читы
  'cheats.title': 'Читы',
  'cheats.addHard': '+{amount} {currency}',
  'cheats.refillEnergy': 'Полная энергия',
  'cheats.skipLevel': 'Пройти уровень',
  'cheats.skipTime': '+{minutes} мин',
  'cheats.reset': 'Начать заново',
  'cheats.resetConfirm': 'Сбросить партию и начать заново?',
  'common.close': 'Закрыть',
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
