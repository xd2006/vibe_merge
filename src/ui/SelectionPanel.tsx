import {
  availableActions,
  cellOf,
  cellState,
  indexOf,
  popCost,
  skipCooldownCost,
  type Cell,
  type Entity,
  type GameState,
} from '@/core';
import { formatDuration, t } from '@/i18n/ru';
import { generatorName, itemName, rewardText } from './names';
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

  const cs = cellState({ board, lockGroups }, indexOf(board, cell));
  if (cs.kind !== 'open') {
    const name =
      e.kind === 'item'
        ? itemName(rules, e.chain, e.level)
        : generatorName(rules, e.generator, e.level);
    const unlockLevel =
      cs.kind === 'group' ? rules.levels.find((l) => l.unlocks.includes(cs.group)) : null;
    const text =
      cs.kind === 'locked'
        ? t('item.lockUnlockable', { name, level: e.level })
        : cs.kind === 'level'
          ? t('cell.level', { level: cs.level })
          : cs.kind === 'closed'
            ? t('cell.closed')
            : unlockLevel
              ? t('item.lockSealed', { level: unlockLevel.id })
              : t('item.lockSealedNever');
    return (
      <div className="panel" data-testid="selection">
        <span className="panel-text">{text}</span>
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
  const info: string[] = [];
  let skipCost: number | null = null;
  if (e.kind === 'generator') {
    const lvl = rules.generators.get(e.generator)!.levels[e.level - 1]!;
    if (e.cooldownUntil !== null) {
      info.push(t('item.cooldown', { time: left(e.cooldownUntil) }));
      skipCost = skipCooldownCost(rules, state, e);
    } else if (e.charges !== null && lvl.cooldown?.charges) {
      info.push(t('item.charges', { charges: e.charges, max: lvl.cooldown.charges }));
    }
    if (e.bag && e.cooldownUntil === null) {
      const left = e.bag.reduce((a, b) => a + b, 0);
      const total = lvl.produces.reduce((a, p) => a + p.weight, 0);
      info.push(t('item.bag', { left, total }));
      if (e.cyclesLeft !== null && lvl.cooldown?.cycles) {
        info.push(t('item.cycles', { left: e.cyclesLeft, max: lvl.cooldown.cycles }));
      }
    }
    if (e.usesLeft !== null) info.push(t('item.usesLeft', { left: e.usesLeft }));
  }
  const collect = actions.collect;
  const none =
    !actions.pickUp && !actions.delete && actions.sell === null && !collect && skipCost === null;

  return (
    <div className="panel" data-testid="selection">
      <span className="panel-text">
        <strong>{title}</strong> · {t('item.level', { level: e.level })}
        {info.map((x) => (
          <span key={x}> · {x}</span>
        ))}
      </span>
      <span className="panel-actions">
        {skipCost !== null && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={hard < skipCost}
            onClick={() => dispatch({ type: 'skipCooldown', at: cell })}
          >
            {skipCost === 0 ? t('item.skipFree') : t('item.skip', { cost: `${skipCost} 💎` })}
          </button>
        )}
        {collect && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => dispatch({ type: 'collect', at: cell })}
          >
            {collect === 'storage'
              ? t('item.collect')
              : t('item.collectReward', {
                  reward: collect.map((r) => rewardText(session, r)).join(', '),
                })}
          </button>
        )}
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
