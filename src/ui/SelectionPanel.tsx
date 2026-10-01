import { availableActions, cellOf, popCost, type Cell, type Entity, type GameState } from '@/core';
import { formatDuration, t } from '@/i18n/ru';
import { generatorName, itemName } from './names';
import type { GameSession } from './session';
import { useSessionValue } from './useSession';

function findByUid(state: GameState, uid: number | null): { entity: Entity; cell: Cell } | null {
  if (uid === null) return null;
  const i = state.board.cells.findIndex((e) => e?.uid === uid);
  return i < 0 ? null : { entity: state.board.cells[i]!, cell: cellOf(state.board, i) };
}

/** Панель выбранной клетки: что это и какие действия доступны. */
export function SelectionPanel({
  session,
  selectedUid,
}: {
  session: GameSession;
  selectedUid: number | null;
}) {
  const rules = session.engine.rules;
  const board = useSessionValue(session, (s) => s.state.board);
  const hard = useSessionValue(session, (s) => s.state.hard);
  const lockGroups = useSessionValue(session, (s) => s.state.lockGroups);
  // Секунды для таймеров кулдауна и пузыря.
  const nowSec = useSessionValue(session, (s) => Math.floor(s.state.nowMs / 1000));
  const state = session.state;
  const found = findByUid({ ...state, board }, selectedUid);

  if (!found) return <div className="panel panel-empty" />;
  const { entity: e, cell } = found;
  const dispatch = session.dispatch.bind(session);
  const left = (until: number) => formatDuration(until - nowSec * 1000);

  if (e.kind === 'lock') {
    const unlockLevel = rules.levels.find((l) => l.unlocks.includes(e.group));
    return (
      <div className="panel" data-testid="selection">
        <span className="panel-text">
          {lockGroups[e.group] === 'unlockable'
            ? t('item.lockUnlockable', { name: itemName(rules, e.chain, e.level), level: e.level })
            : unlockLevel
              ? t('item.lockSealed', { level: unlockLevel.id })
              : t('item.lockSealedNever')}
        </span>
      </div>
    );
  }

  if (e.kind === 'item' && e.bubble) {
    const cost = popCost(rules, state, e.chain, e.level);
    const currency = session.config.currencies.hard.name;
    return (
      <div className="panel" data-testid="selection">
        <span className="panel-text">
          <strong>{itemName(rules, e.chain, e.level)}</strong> · {t('item.bubble')}
          {e.bubble.expiresAt !== null && (
            <> · {t('item.bubbleExpires', { time: left(e.bubble.expiresAt) })}</>
          )}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={hard < cost}
          title={hard < cost ? t('item.popNoHard', { cost: `${cost} ${currency}` }) : undefined}
          onClick={() => dispatch({ type: 'popBubble', at: cell })}
        >
          {t('item.pop', { cost: `${cost} 💎` })}
        </button>
      </div>
    );
  }

  const actions = availableActions(rules, state, e);
  const title =
    e.kind === 'item'
      ? itemName(rules, e.chain, e.level)
      : generatorName(rules, e.generator, e.level);
  let info: string | null = null;
  if (e.kind === 'generator') {
    const lvl = rules.generators.get(e.generator)!.levels[e.level - 1]!;
    if (e.cooldownUntil !== null) info = t('item.cooldown', { time: left(e.cooldownUntil) });
    else if (e.charges !== null && lvl.cooldown) {
      info = t('item.charges', { charges: e.charges, max: lvl.cooldown.charges });
    }
  }
  const none = !actions.pickUp && !actions.delete && actions.sell === null;

  return (
    <div className="panel" data-testid="selection">
      <span className="panel-text">
        <strong>{title}</strong> · {t('item.level', { level: e.level })}
        {info && <> · {info}</>}
      </span>
      <span className="panel-actions">
        {actions.pickUp && (
          <button
            type="button"
            className="btn"
            onClick={() => dispatch({ type: 'itemAction', at: cell, action: 'pickUp' })}
          >
            {t('item.pickUp')}
          </button>
        )}
        {actions.sell !== null && (
          <button
            type="button"
            className="btn"
            onClick={() => dispatch({ type: 'itemAction', at: cell, action: 'sell' })}
          >
            {t('item.sell', { amount: `${actions.sell} 💎` })}
          </button>
        )}
        {actions.delete && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => dispatch({ type: 'itemAction', at: cell, action: 'delete' })}
          >
            {t('item.delete')}
          </button>
        )}
        {none && <span className="hud-sub">{t('item.noActions')}</span>}
      </span>
    </div>
  );
}
