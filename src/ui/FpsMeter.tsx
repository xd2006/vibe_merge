import { useEffect, useState } from 'react';

/** Счётчик FPS поверх прототипа: среднее за полсекунды и минимум за последние 5 секунд. */
export function FpsMeter({ read }: { read: () => number | null }) {
  const [fps, setFps] = useState<{ now: number; min: number } | null>(null);

  useEffect(() => {
    const history: number[] = [];
    const timer = setInterval(() => {
      const v = read();
      if (v === null) return;
      history.push(v);
      if (history.length > 10) history.shift();
      setFps({ now: Math.round(v), min: Math.round(Math.min(...history)) });
    }, 500);
    return () => clearInterval(timer);
  }, [read]);

  if (!fps) return null;
  return (
    <div className={fps.min < 30 ? 'fps fps-low' : 'fps'} data-testid="fps">
      {fps.now} FPS · min {fps.min}
    </div>
  );
}
