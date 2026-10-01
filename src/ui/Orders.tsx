import { orderStatus, type ResolvedReward, type Rules } from '@/core';
import { formatDuration, t } from '@/i18n/ru';
import { itemName } from './names';
import type { GameSession } from './session';
import { useSessionValue } from './useSession';

function RewardChip({
  reward,
  rules,
  currency,
}: {
  reward: ResolvedReward;
  rules: Rules;
  currency: string;
}) {
  if (reward.type === 'energy') return <span className="chip">⚡ {reward.amount}</span>;
  if (reward.type === 'hard') {
    return (
      <span className="chip" title={currency}>
        💎 {reward.amount}
      </span>
    );
  }
  return (
    <span className="chip">
      🎁 {itemName(rules, reward.chain, reward.level)} ×{reward.count}
    </span>
  );
}

export function OrdersBar({ session }: { session: GameSession }) {
  const rules = session.engine.rules;
  const orders = useSessionValue(session, (s) => s.state.orders);
  // Наличие предметов зависит от доски и хранилища: перерисовка при их изменении, а не каждый кадр.
  useSessionValue(session, (s) => s.state.board);
  useSessionValue(session, (s) => s.state.storage);
  const waitSec = useSessionValue(session, (s) =>
    s.state.orders.slots
      .map((sl) => (sl.refillAt === null ? '' : Math.ceil((sl.refillAt - s.state.nowMs) / 1000)))
      .join(),
  ).split(',');

  if (orders.stopped) {
    return <section className="orders orders-error">{t('orders.stopped')}</section>;
  }

  return (
    <section className="orders" aria-label={t('orders.title')}>
      {orders.slots.map((slot, i) => {
        if (!slot.order) {
          const wait = waitSec[i];
          return (
            <div key={`empty-${i}`} className="order order-empty" data-testid={`order-${i}`}>
              {wait
                ? t('orders.waiting', { time: formatDuration(Number(wait) * 1000) })
                : t('orders.pending')}
            </div>
          );
        }
        const status = orderStatus(rules, session.state, slot.order);
        return (
          <div key={slot.order.id} className="order" data-testid={`order-${i}`}>
            <ul className="order-reqs">
              {status.requirements.map((r) => (
                <li
                  key={`${r.chain}:${r.level}`}
                  className={r.available >= r.count ? 'req req-ok' : 'req'}
                >
                  <span className="req-name">
                    {itemName(rules, r.chain, r.level)}{' '}
                    <small>{t('item.level', { level: r.level })}</small>
                  </span>
                  <span className="req-count">
                    {Math.min(r.available, r.count)}/{r.count}
                  </span>
                </li>
              ))}
            </ul>
            <div className="order-rewards">
              {slot.order.rewards.map((rw, ri) => (
                <RewardChip
                  key={ri}
                  reward={rw}
                  rules={rules}
                  currency={session.config.currencies.hard.name}
                />
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!status.ready}
              onClick={() => session.dispatch({ type: 'deliverOrder', slot: i })}
            >
              {t('orders.deliver')}
            </button>
          </div>
        );
      })}
    </section>
  );
}
