# vibe_merge

Фреймворк прототипирования merge-2 игр: геймдизайнер описывает игру JSON-конфигом и получает играбельный прототип с метриками экономики для браузера и Android.

- ТЗ: [docs/merge_framework.md](docs/merge_framework.md)
- План реализации и статус этапов: [docs/mvp_plan.md](docs/mvp_plan.md). Раздел 1 плана имеет приоритет над ТЗ там, где они расходятся.

## Команды

| Команда                               | Что делает                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                         | Редактор и прототип в браузере (Vite)                                             |
| `npm run check`                       | lint + prettier + typecheck + unit-тесты; должен быть зелёным после каждой задачи |
| `npm run test` / `npm run test:watch` | Unit-тесты (Vitest)                                                               |
| `npm run test:e2e`                    | Смоук в браузере (Playwright, Chromium)                                           |
| `npm run build:web`                   | Статическая сборка в `dist/`                                                      |
| `npm run format`                      | Форматирование Prettier                                                           |
| `npm run schema`                      | JSON Schema конфига в `schema/game-config.schema.json`                            |
| `npm run build:android`               | Веб-билд → `cap sync` → Gradle; debug APK в `dist/android/`                       |

Окружение: Node 24 (`.nvmrc`). На машине разработчика git доступен только из SourceTree.

Android: Gradle 8.14 из шаблона Capacitor 8 требует **JDK 21** (`JAVA_HOME`; JDK 25 из Android Studio и системная Java 26 не подходят) и `ANDROID_HOME`. Эмуляторы: `Pixel_API_30` (Android 11, WebView 83 — минимальная версия по ТЗ) и `Pixel_7` (Android 17). Проверка на эмуляторе: `adb install -r dist/android/merge-prototype-debug.apk`, `adb shell am start -n com.vibemerge.prototype/.MainActivity`, ввод — `adb shell input tap/swipe`, снимок — `adb shell screencap -p /sdcard/s.png` + `adb pull`. Веб-билд нацелен на Chromium 83: не использовать CSS `dvh`, `color-mix`, flex `gap` без фоллбэков.

Отладка в dev-сборке: `window.__vibeMerge` (сессия и `cells()`), используется e2e-тестами.

Поток приложения: в браузере сначала открывается редактор (`src/editor`, грузится лениво), кнопка «Запустить прототип» открывает `Prototype`; на Android (`isNativeApp()`) сразу прототип с зашитым конфигом. E2E открывают игру через редактор (`openGame` в `tests/e2e/smoke.spec.ts`).

Хранение: партия — localStorage `vibe-merge.save.v1` (с хешем конфига), черновик конфига — `vibe-merge.draft.v1`, сессии телеметрии — IndexedDB `vibe-merge` / `sessions`.

Валидатор (`src/validator`) — единственное место проверок конфига для пользователя: схема Zod + логические проверки с путём, текстом и подсказкой. `compileRules` в ядре бросает `ConfigError` только как страховка. Новая проверка = код в `checks.ts` + строки `val.*`/`hint.*` в `ru.ts` + случай в `validator.test.ts`.

Схема и форма редактора: поля-формулы помечены `format: 'formula'`, ссылки на id — `chainRef`/`generatorRef`/`lockGroupRef`/`templateRef` (через `.meta()` в `src/config/schema.ts`); русские подписи полей — `src/editor/labels.ts`.

## Структура

```
src/
  config/      Zod-схема, значения по умолчанию, JSON Schema, пресеты
  expr/        мини-язык формул
  core/        ядро: состояние, команды, правила, RNG, время, журнал событий
    reach/     достижимость (ядро + валидатор)
    systems/   системы ядра: энергия, генераторы, перемещения и замки, пузыри,
               хранилище и itemActions, заказы, награды, уровни, читы, время (все таймеры)
    engine.ts  createEngine: начальное состояние и apply() — только диспетчеризация команд
  validator/   логические проверки конфига
  telemetry/   метрики из журнала событий, экспорт
  render/      PixiJS-доска
  ui/          React HUD
  editor/      React-редактор конфига
  platform/    хранение, «Поделиться», файлы
  i18n/ru.ts   все строки интерфейса
presets/       пресеты конфигов
scripts/art/   арт-пайплайн (Node)
tests/unit     unit-тесты вне src (фикстуры, replay); тесты модулей лежат рядом с кодом как *.test.ts
tests/e2e      Playwright
```

## Правила

- **Логические модули** (`core`, `expr`, `config`, `validator`, `telemetry`) не импортируют `render`, `ui`, `editor`, `platform`, React, PixiJS и Capacitor; не используют DOM (`tsconfig.logic.json` без lib DOM), `Math.random` и `Date.now`. Это проверяют ESLint и typecheck.
- **Ядро** — чистая функция `apply(state, command) → { state, events[] }`. Время приходит только командой `tick(dtMs)`, случайность — только из seeded RNG с отдельным потоком на подсистему.
- **Импорты** между модулями через алиас `@/…`.
- **Строки интерфейса** только через `t()` из `src/i18n/ru.ts`.
- **Тесты** пишутся вместе с кодом задачи; задача закрыта, когда `npm run check` зелёный.
- **Спорные места ТЗ** не додумываются молча: вопрос записывается в раздел 7 плана, выбранный вариант помечается в коде комментарием `// DECISION:`.
- **Внешние API** (Gemini, Capacitor, RJSF, PixiJS) сверяются с актуальной документацией установленных версий.
- **Порядок работы:** этапы плана выполняются по одному; после выполнения «Готово, когда» обновляется статус в разделе 6 плана и работа останавливается до подтверждения пользователя.
- **Git:** агент не делает коммиты и push, пользователь коммитит сам.
