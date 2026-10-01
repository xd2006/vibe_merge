// Собирает debug APK: веб-билд → cap sync → Gradle. Результат кладётся в dist/android/.
// На этапе 5 сюда добавится выбор конфига и ассетов для упаковки.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const run = (cmd: string, cwd = '.') => execSync(cmd, { stdio: 'inherit', cwd });

for (const name of ['JAVA_HOME', 'ANDROID_HOME'] as const) {
  if (!process.env[name]) {
    console.error(`Не задана переменная окружения ${name}. Нужны JDK 21 и Android SDK.`);
    process.exit(1);
  }
}

run('npm run build:web');
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
const out = join('dist', 'android', 'merge-prototype-debug.apk');
copyFileSync(apk, out);
console.log(`APK: ${out}`);
