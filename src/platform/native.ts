import { Capacitor } from '@capacitor/core';

/** Прототип запущен как приложение (Android), а не в браузере. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();
