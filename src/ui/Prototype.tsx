import { useEffect, useRef, useState } from 'react';
import type { GameConfig } from '@/config';
import { BoardView } from '@/render';
import { exposeDebugHook } from './debug';
import { EnergyBar, RejectionToast } from './Hud';
import { GameSession } from './session';

/** Экран прототипа: HUD сверху, доска на всё оставшееся место. */
export function Prototype({ config }: { config: GameConfig }) {
  const [session] = useState(() => new GameSession(config));
  const boardHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = boardHost.current;
    if (!host) return;
    let view: BoardView | null = null;
    let cancelled = false;
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    void BoardView.create(host, {
      rules: session.engine.rules,
      onCommand: (c) => session.dispatch(c),
      dark,
    }).then((v) => {
      // StrictMode монтирует эффект дважды: первую доску уничтожаем, как только она создастся.
      if (cancelled) return v.destroy();
      view = v;
      v.update(session.state);
    });
    const unsubscribe = session.subscribe(() => view?.update(session.state));
    const removeDebugHook = exposeDebugHook(session);
    session.start();
    return () => {
      cancelled = true;
      unsubscribe();
      removeDebugHook();
      session.stop();
      view?.destroy();
    };
  }, [session]);

  return (
    <div className="prototype">
      <header className="hud">
        <EnergyBar session={session} />
      </header>
      <div className="board" ref={boardHost} data-testid="board" />
      <RejectionToast session={session} />
    </div>
  );
}
