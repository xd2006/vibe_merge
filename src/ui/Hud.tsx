import { useEffect, useState } from 'react';
import { formatDuration, t } from '@/i18n/ru';
import type { GameSession } from './session';
import { useSessionValue } from './useSession';

export function EnergyBar({ session }: { session: GameSession }) {
  const { max, regenAmount } = session.engine.rules.energy;
  const value = useSessionValue(session, (s) => s.state.energy.value);
  // Секунды до следующей порции; округление вверх, чтобы не показывать «0:00» до начисления.
  const nextInSec = useSessionValue(session, (s) => {
    const at = s.state.energy.nextRegenAt;
    return at === null ? null : Math.ceil((at - s.state.nowMs) / 1000);
  });

  return (
    <div className="hud-energy" data-testid="energy">
      <span className="hud-label">⚡ {t('hud.energy')}</span>
      <strong className="hud-value" data-testid="energy-value">
        {t('hud.energyValue', { value, max })}
      </strong>
      <span className="hud-sub">
        {nextInSec === null
          ? t('hud.energyFull')
          : t('hud.nextEnergy', { amount: regenAmount, time: formatDuration(nextInSec * 1000) })}
      </span>
    </div>
  );
}

/** Причина отказа последней команды (нет энергии, нет места, кулдаун); исчезает через 2 с. */
export function RejectionToast({ session }: { session: GameSession }) {
  const rejection = useSessionValue(session, (s) => s.lastRejection);
  const [visible, setVisible] = useState<string | null>(null);

  useEffect(() => {
    // Перенос в ту же клетку и т. п. — не ошибка игрока, сообщение не нужно.
    if (!rejection || rejection.reason === 'reject.sameCell') return;
    setVisible(t(rejection.reason));
    const timer = setTimeout(() => setVisible(null), 2000);
    return () => clearTimeout(timer);
  }, [rejection]);

  if (!visible) return null;
  return (
    <div className="toast" role="status">
      {visible}
    </div>
  );
}
