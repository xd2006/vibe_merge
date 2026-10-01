import { useSyncExternalStore } from 'react';
import type { GameSession } from './session';

/**
 * Подписка компонента на часть сессии. Селектор должен возвращать примитив (или стабильную
 * ссылку): компонент перерисуется, только когда значение изменится, а не на каждый кадр.
 */
export function useSessionValue<T>(session: GameSession, selector: (s: GameSession) => T): T {
  return useSyncExternalStore(session.subscribe, () => selector(session));
}
