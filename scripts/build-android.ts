// npm run build:android [конфиг] — APK с зашитым конфигом и его ассетами.
// Шаги: проверка конфига → веб-билд → конфиг и арт в dist → cap sync → Gradle → dist/android/.
import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { ART_DIR, artItems, type ArtIndex } from '../src/art';
import { BUNDLED_CONFIG_FILE } from '../src/config';
import { safeFileName } from './art/lib/files';
import { DEFAULT_CONFIG, parseArgs } from './art/lib/config';
import { validateText } from '../src/validator';

const run = (cmd: string, cwd = '.') => execSync(cmd, { stdio: 'inherit', cwd });

const { positional } = parseArgs(process.argv.slice(2));
const configPath = positional[0] ?? DEFAULT_CONFIG;

for (const name of ['JAVA_HOME', 'ANDROID_HOME'] as const) {
  if (!process.env[name]) {
    console.error(`Не задана переменная окружения ${name}. Нужны JDK 21 и Android SDK.`);
    process.exit(1);
  }
}

// 1. Конфиг: в приложение попадает только конфиг без ошибок.
if (!existsSync(configPath)) {
  console.error(`Файл конфига не найден: ${configPath}`);
  process.exit(1);
}
const text = readFileSync(configPath, 'utf8');
const validation = validateText(text);
if (!validation.ok || !validation.config) {
  console.error(`Конфиг ${configPath} содержит ошибки — APK не собирается:`);
  for (const i of validation.issues.filter((x) => x.level === 'error')) {
    console.error(`  ${i.path || '(весь конфиг)'}: ${i.message}. ${i.hint}`);
  }
  process.exit(1);
}
const config = validation.config;
console.log(`Конфиг: ${configPath} («${config.meta.name}»)`);

// 2. Веб-билд.
run('npm run build:web');

// 3. Конфиг и только нужные ему ассеты.
writeFileSync(join('dist', BUNDLED_CONFIG_FILE), JSON.stringify(JSON.parse(text)));
const artDir = join('dist', ART_DIR);
let assets = 0;
if (existsSync(join(artDir, 'index.json'))) {
  const index = JSON.parse(readFileSync(join(artDir, 'index.json'), 'utf8')) as ArtIndex;
  const needed = new Set(artItems(config).map((it) => it.id));
  const kept: ArtIndex = {
    version: 1,
    items: Object.fromEntries(Object.entries(index.items).filter(([id]) => needed.has(id))),
  };
  const keepFiles = new Set(Object.values(kept.items).map((e) => e.file));
  for (const file of readdirSync(artDir)) {
    if (file !== 'index.json' && !keepFiles.has(file)) rmSync(join(artDir, file));
  }
  writeFileSync(join(artDir, 'index.json'), JSON.stringify(kept));
  assets = keepFiles.size;
}
console.log(`Ассеты арта в сборке: ${assets} (остальные предметы — плейсхолдеры)`);

// 4. Capacitor и Gradle.
run('npx cap sync android');
// cmd.exe не ищет программы в рабочем каталоге без явного «.\».
run(
  process.platform === 'win32' ? '.\\gradlew.bat assembleDebug' : './gradlew assembleDebug',
  'android',
);

const apk = join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(apk)) {
  console.error(`APK не найден: ${apk}`);
  process.exit(1);
}
mkdirSync(join('dist', 'android'), { recursive: true });
const out = join('dist', 'android', `${safeFileName(config.meta.name)}-debug.apk`);
copyFileSync(apk, out);
console.log(`APK: ${out}`);
