import { emitNow, type Ctx } from '../context';
import type { CheatCommand, RejectReason } from '../types';
import { refillEnergy } from './energy';
import { completeLevel } from './levels';
import { advanceTime } from './time';

/** Чит-действия; все события команды помечаются `cheat: true` в движке. */
export function cheat(ctx: Ctx, command: CheatCommand): RejectReason | undefined {
  const cheats = ctx.rules.config.cheats;
  if (!cheats[command.cheat].enabled) return 'reject.cheatDisabled';

  switch (command.cheat) {
    case 'addHard': {
      const amount = cheats.addHard.amount;
      ctx.s.hard += amount;
      emitNow(ctx, { type: 'cheat_used', name: 'addHard', amount });
      return undefined;
    }
    case 'refillEnergy':
      refillEnergy(ctx);
      emitNow(ctx, { type: 'cheat_used', name: 'refillEnergy' });
      return undefined;
    case 'skipLevel': {
      if (ctx.s.level.completedAll) return 'reject.allLevelsDone';
      emitNow(ctx, { type: 'cheat_used', name: 'skipLevel' });
      return completeLevel(ctx);
    }
    case 'skipTime': {
      if (!(command.minutes > 0)) return 'reject.notAllowed';
      emitNow(ctx, { type: 'cheat_used', name: 'skipTime', minutes: command.minutes });
      advanceTime(ctx, Math.round(command.minutes * 60_000));
      return undefined;
    }
  }
}
