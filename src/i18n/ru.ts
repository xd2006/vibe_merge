/** Все строки интерфейса. Новые строки добавляются сюда, а не пишутся в компонентах. */
export const ru = {
  'app.title': 'Merge-2 прототип',
  'app.backToEditor': '← Редактор',
  'app.loading': 'Загрузка…',
  'cheats.fps': 'Показывать FPS',

  // Редактор
  'editor.title': 'Конфиг',
  'editor.loading': 'Загрузка редактора…',
  'editor.preset': 'Пресет…',
  'editor.load': 'Загрузить файл',
  'editor.download': 'Скачать',
  'editor.run': 'Запустить прототип',
  'editor.runBlocked': 'Исправьте ошибки, чтобы запустить прототип',
  'editor.errors': 'ошибок: {count}',
  'editor.warnings': 'предупреждений: {count}',
  'editor.valid': 'ошибок нет',
  'editor.noIssues': 'Ошибок и предупреждений нет',
  'editor.wholeConfig': 'весь конфиг',
  'editor.form': 'Форма',
  'editor.jsonInvalid':
    'JSON содержит синтаксическую ошибку — форма недоступна, пока она не исправлена (см. отметку в тексте)',
  'editor.replaceConfirm': 'Заменить текущий конфиг пресетом?',
  'editor.formulaVars': 'Переменные: {vars}',
  'editor.missingRef': 'нет такого',
  'editor.art.title': 'Арт предметов',
  'editor.art.globalMode': 'Режим по умолчанию',
  'editor.art.auto': 'Авто (Gemini)',
  'editor.art.manual': 'Ручной',
  'editor.art.inherit': 'как по умолчанию',
  'editor.art.copyPrompt': 'Копировать промпт',
  'editor.art.copied': 'Промпт скопирован',
  'editor.art.upload': 'Загрузить картинку',
  'editor.art.generate': 'Сгенерировать',
  'editor.art.working': 'Обработка…',
  'editor.art.done': 'Готово',
  'editor.art.drop': 'Перетащите картинку сюда',
  'editor.art.override': 'своя картинка',
  'editor.art.ready': 'готово',
  'editor.art.missing': 'плейсхолдер',
  'editor.art.needValid': 'Исправьте ошибки конфига, чтобы работать с артом',
  'editor.art.devOnly': 'Генерация и импорт работают только в npm run dev (нужен локальный сервер)',
  'editor.art.background': 'Фон',
  'editor.art.help':
    'Цепочки генерируйте по порядку: сначала уровень 1 — он станет референсом для остальных. Команды: npm run art:prompts, art:import, art:bake.',
  'editor.btn.add': '+ Добавить',
  'editor.btn.copy': 'Копировать',
  'editor.btn.up': 'Выше',
  'editor.btn.down': 'Ниже',
  'editor.btn.remove': 'Удалить',
  'editor.board.width': 'Ширина',
  'editor.board.height': 'Высота',
  'editor.board.palette': 'Символы легенды',
  'editor.board.help':
    'Выберите символ легенды и нажимайте или ведите по клеткам. 🔒 — клетки замков.',
  'editor.board.empty': 'пусто',
  'editor.board.unknownSymbol': 'нет в легенде',

  // Схема конфига
  'schema.idFormat':
    'Идентификатор: латинские буквы в нижнем регистре, цифры и «_», начинается с буквы',
  'schema.rangeOrder': 'Начало диапазона больше конца',
  'schema.levelOrRange': 'Укажите ровно одно из полей: level или levelRange',
  'schema.matchPattern': 'Шаблон: «цепочка.уровень», «цепочка.*», «generator.id» или «*»',
  'schema.artKey': 'Ключ арта: «цепочка:уровень» или «generator.id:уровень»',
  'schema.weightOrCount':
    'Укажите ровно одно из полей: weight (вес) или count (количество в мешке)',
  'schema.chargesOrCycles':
    'Укажите ровно одно из полей: charges (тапов до кулдауна) или cycles (циклов мешка до кулдауна)',

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
  'config.ordersSlots': 'В режиме шаблонов нужно число слотов orders.slots',
  'config.noTemplates': 'В режиме шаблонов нужен хотя бы один шаблон заказа',
  'config.noDifficulty': 'В режиме сложности нужен блок orders.difficulty',
  'config.unknownCategory': 'Категория заказов «{id}» не найдена',
  'config.unknownResource': 'Ресурс «{id}» не объявлен в currencies.resources',
  'config.cellDuplicate': 'Клетка ({x}, {y}) уже настроена (board.locks или board.cells)',
  'config.lockedEmpty': 'Клетка ({x}, {y}) заблокирована, но предмета в ней нет',

  // Валидатор: сообщения
  'val.syntax': 'Синтаксическая ошибка JSON: {message}',
  'val.syntaxAt': 'Синтаксическая ошибка JSON в строке {line}, столбце {column}: {message}',
  'val.schema': '{message}',
  'val.duplicateId': 'Идентификатор «{id}» повторяется: {kind} с таким id уже есть ({first})',
  'val.unknownChain': 'Цепочка «{id}» не найдена',
  'val.unknownGenerator': 'Генератор «{id}» не найден',
  'val.unknownLockGroup': 'Группа замков «{id}» не найдена',
  'val.unknownTemplate': 'Шаблон заказа «{id}» не найден',
  'val.ordersSlots': 'Не задано число слотов заказов',
  'val.noTemplates': 'Нет ни одного шаблона заказа',
  'val.noDifficulty': 'Режим заказов «по сложности», но блок difficulty не задан',
  'val.unknownCategory': 'Категория заказов «{id}» не найдена',
  'val.noSpices':
    'Нет предметов для заказов по сложности: ни один уровень цепочки не собирается на склад',
  'val.levelTooHigh': 'Уровень {level} больше максимального ({max}) у «{id}»',
  'val.rangeTooHigh':
    'Диапазон уровней [{from}, {to}] целиком выше максимального уровня ({max}) у «{id}»',
  'val.zeroWeights': 'Сумма весов равна нулю: ни один вариант не может выпасть',
  'val.formula': 'Формула «{source}» не разбирается: {message}',
  'val.layoutRows': 'В раскладке {actual} строк, а высота доски {expected}',
  'val.layoutCols': 'В строке {row} раскладки {actual} символов, а ширина доски {expected}',
  'val.unknownSymbol': 'Символа «{char}» (строка {row}) нет в легенде',
  'val.lockOutside': 'Клетка замка ({x}, {y}) вне доски {width}×{height}',
  'val.lockOverlap': 'Клетка замка ({x}, {y}) занята содержимым раскладки «{char}»',
  'val.lockDuplicate': 'Клетка ({x}, {y}) указана в замках несколько раз',
  'val.emptySkipTime': 'Чит «сдвиг времени» включён, но список минут пуст',
  'val.unknownPattern': 'Шаблон «{match}» ссылается на несуществующую цепочку или генератор «{id}»',
  'val.artKey': 'Ключ арта «{key}» ссылается на несуществующий предмет',
  'val.unknownResource': 'Ресурс «{id}» не объявлен',
  'val.cellDuplicate': 'Клетка ({x}, {y}) настроена несколько раз (board.locks и board.cells)',
  'val.unknownLevel': 'Уровня {level} нет в списке уровней',
  'val.lockedEmpty': 'Клетка ({x}, {y}) заблокирована, но предмета в ней нет',
  'val.lockedMaxLevel':
    'В заблокированной клетке ({x}, {y}) объект максимального уровня — её нельзя будет открыть',
  'val.mixedProduces': 'В одном уровне генератора смешаны weight (веса) и count (мешок)',
  'val.cooldownCharges': 'В режиме мешка (count) кулдаун задаётся циклами — cycles, а не charges',
  'val.cooldownCycles': 'В режиме весов (weight) кулдаун задаётся тапами — charges, а не cycles',
  'val.warnCollectNoStorage': 'Предмет собирается на склад, но хранилище выключено',
  'val.warnMergeBubbleNoRule':
    'У объектов задана вероятность пузыря (bubbleProbability), но нет правила появления при слиянии',
  'val.warnMergeBubbleDuplicate':
    'Правило пузырей при слиянии задано повторно — действует только первое',
  'val.warnBubblesOff': 'bubbles.maxOnBoard = 0: пузыри не появятся, хотя правила заданы',
  'val.warnNoTemplate': 'На уровне {level} ни один шаблон заказов не проходит по достижимости',
  'val.warnCategoryUnreachable':
    'На уровне {level} заказ «{category}» ({min}–{max}) не собрать из достижимых специй',
  'val.warnLockNeverOpens': 'Группа замков «{group}» не открывается ни одним уровнем',
  'val.warnLockNoSource':
    'Для предмета в замке «{name}» ({level} ур.) нет источника, из которого его можно получить слиянием',
  'val.warnLockMaxLevel':
    'Предмет в замке «{name}» максимального уровня — его нельзя слить, клетка не откроется',
  'val.warnEnergyCost':
    'Стоимость генерации {cost} больше максимума энергии {max}: генератором нельзя воспользоваться',
  'val.warnNoGenerators': 'На стартовой доске нет ни одного генератора',
  'val.warnReachOff':
    'Проверка достижимости выключена: заказы могут требовать недоступные предметы',

  // Валидатор: подсказки
  'hint.syntax': 'Проверьте запятые, кавычки и скобки рядом с указанным местом',
  'hint.unknownKey':
    'Удалите поле или исправьте опечатку в названии: неизвестные поля не допускаются',
  'hint.type': 'Проверьте тип значения: число, строка, список или объект',
  'hint.tooSmall': 'Увеличьте значение или добавьте элементы',
  'hint.tooBig': 'Уменьшите значение или уберите лишние элементы',
  'hint.format': 'Значение не подходит под формат поля — см. описание поля',
  'hint.union': 'Значение не подходит ни под один вариант: проверьте поле type или source',
  'hint.value': 'Выберите одно из допустимых значений',
  'hint.generic': 'Исправьте значение поля',
  'hint.duplicateId': 'Переименуйте один из элементов: id должны быть уникальны',
  'hint.unknownChain': 'Доступные цепочки: {list}',
  'hint.unknownGenerator': 'Доступные генераторы: {list}',
  'hint.unknownLockGroup': 'Группы замков задаются в board.locks[].group: {list}',
  'hint.unknownTemplate': 'Доступные шаблоны: {list}',
  'hint.ordersSlots': 'Задайте orders.slots или переключите orders.mode на "difficulty"',
  'hint.noTemplates':
    'Добавьте шаблон в orders.templates или переключите orders.mode на "difficulty"',
  'hint.noDifficulty':
    'Добавьте orders.difficulty (категории и распределение) или верните режим "templates"',
  'hint.unknownCategory': 'Доступные категории: {list}',
  'hint.noSpices': 'Отметьте специи полем collect: "storage" у уровня цепочки',
  'hint.levelTooHigh': 'Уменьшите уровень или добавьте уровни в цепочку',
  'hint.zeroWeights': 'Задайте хотя бы одному варианту положительный вес',
  'hint.formula':
    'Переменные: {allowed}; функции: ceil, floor, round, min, max; операторы + - * / ^',
  'hint.layout': 'Число строк и символов в строке должно совпадать с height и width',
  'hint.unknownSymbol': 'Добавьте символ в board.legend или исправьте раскладку',
  'hint.lockCell': 'Замки ставятся на пустые клетки раскладки («.»), координаты — [x, y] с нуля',
  'hint.emptySkipTime': 'Добавьте значения в cheats.skipTime.minutes или выключите чит',
  'hint.artKey': 'Ключ: «цепочка:уровень» или «generator.id:уровень» существующего предмета',
  'hint.cellDuplicate': 'Оставьте одну настройку клетки',
  'hint.unknownLevel':
    'Укажите id существующего уровня ({list}) или 0, если клетка открыта со старта',
  'hint.lockedEmpty': 'Поставьте в клетку предмет (раскладка) или снимите locked',
  'hint.lockedMaxLevel': 'Поставьте предмет ниже максимального уровня или снимите locked',
  'hint.unknownResource': 'Объявите ресурс в currencies.resources. Сейчас: {list}',
  'hint.mixedProduces': 'Используйте во всех строках produces либо weight, либо count',
  'hint.cooldownCharges': 'Замените charges на cycles — число циклов мешка до перезарядки',
  'hint.cooldownCycles': 'Замените cycles на charges — число тапов до перезарядки',
  'hint.warnCollectNoStorage':
    'Собранные предметы всё равно попадут на склад; включите storage.enabled, чтобы склад был виден',
  'hint.warnMergeBubbleNoRule': 'Добавьте в bubbles.spawnRules правило { "source": "merge" }',
  'hint.warnMergeBubbleDuplicate': 'Удалите лишние правила с source: "merge"',
  'hint.warnBubblesOff': 'Увеличьте maxOnBoard или уберите правила пузырей',
  'hint.warnCategoryUnreachable':
    'Измените диапазон категории, ценность специй (value у уровня), число предметов itemsPerOrder или maxMergeDepth; иначе слот будет пустым',
  'hint.warnNoTemplate':
    'Добавьте шаблон для этого уровня, увеличьте maxMergeDepth или добавьте источник предметов',
  'hint.warnLockNeverOpens': 'Добавьте группу в levels[].unlocks нужного уровня',
  'hint.warnLockNoSource': 'Добавьте генератор, который выдаёт эту цепочку не выше нужного уровня',
  'hint.warnLockMaxLevel': 'Поставьте в замок предмет ниже максимального уровня',
  'hint.warnEnergyCost': 'Уменьшите energyCost или увеличьте energy.max',
  'hint.warnNoGenerators': 'Добавьте генератор в легенду и раскладку доски',
  'hint.warnReachOff': 'Включите orders.reachability.mode: "auto", если это не сделано намеренно',

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
  'reject.notOnCooldown': 'Генератор не перезаряжается',
  'reject.cellLevel': 'Клетка откроется на следующих уровнях',
  'reject.cellClosed': 'Расчистите объекты рядом',
  'reject.notCollectable': 'Этот предмет нельзя собрать',

  // Прототип: HUD
  'hud.energy': 'Энергия',
  'hud.energyValue': '{value} / {max}',
  'hud.nextEnergy': '+{amount} через {time}',
  'hud.energyFull': 'полная',
  'hud.level': 'Уровень {level}',
  'hud.levelProgress': 'заказы {done} / {required}',
  'hud.allLevelsDone': 'все уровни пройдены',
  'hud.rewardQueue': 'ждут места: {count}',
  'board.cooldown': '{time}',
  'board.levelBadge': '{level}',
  'error.configInvalid': 'Конфиг содержит ошибки',

  // Заказы
  'orders.title': 'Заказы',
  'orders.deliver': 'Сдать',
  'orders.category': '{name} · {value}',
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
  'item.bag': 'В цикле: {left} / {total}',
  'item.cycles': 'Циклов до перезарядки: {left} / {max}',
  'item.usesLeft': 'Осталось использований: {left}',
  'item.skip': 'Ускорить за {cost}',
  'item.skipFree': 'Ускорить бесплатно',
  'item.collect': 'Собрать на склад',
  'item.collectReward': 'Забрать: {reward}',
  'item.cooldown': 'Перезарядка: {time}',
  'item.bubble': 'В пузыре',
  'item.bubbleExpires': 'исчезнет через {time}',
  'item.pop': 'Лопнуть за {cost}',
  'item.popNoHard': 'Не хватает валюты: нужно {cost}',
  'item.lockSealed': 'Заблокировано. Откроется на уровне {level}',
  'item.lockSealedNever': 'Заблокировано. Ни один уровень не открывает эту группу',
  'item.lockUnlockable':
    'Предмет заблокирован. Перетащите сюда «{name}» ({level} ур.), чтобы открыть клетку',
  'cell.level': 'Достигните уровня {level}',
  'cell.closed': 'Расчистите объекты рядом',
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

  // Метрики
  'metrics.title': 'Метрики',
  'metrics.excludeCheats': 'Без чит-действий',
  'metrics.energyTotal': 'Потрачено энергии',
  'metrics.energyByGenerator': 'Энергия по генераторам',
  'metrics.counters': 'Счётчики',
  'metrics.noCounters': 'Счётчики не заданы (telemetry.counters)',
  'metrics.orders': 'Выполнено заказов',
  'metrics.bubbles': 'Лопнуто пузырей',
  'metrics.hardSpent': 'Потрачено {currency}',
  'metrics.duration': 'Длительность сессии',
  'metrics.cheats': 'Чит-действий',
  'metrics.sessions': 'Сохранённых сессий с этим конфигом: {count}',
  'metrics.exportJson': 'Экспорт JSON',
  'metrics.exportCsv': 'Экспорт CSV',
  'metrics.clear': 'Удалить старые сессии',

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
