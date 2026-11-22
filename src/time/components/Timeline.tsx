import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import type { Auto, SimResult } from '../model/types';
import type { MsgKey } from '../i18n/translate';
import { AUTO_MS } from '../rules/biobuzz';
import { usePlanner } from '../store/plannerStore';
import { fmtSec } from './format';

interface Props {
  auto: Auto;
  sim: SimResult;
  timeMs: number | null;
  setTimeMs: (ms: number | null) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
}

export function Timeline({ auto, sim, timeMs, setTimeMs, playing, setPlaying }: Props) {
  const t = useT();
  const select = usePlanner((s) => s.select);
  const selectedId = usePlanner((s) => s.selectedStepId);
  const span = Math.max(sim.totalMs, 1);
  const last = useRef<number | null>(null);
  const timeRef = useRef(timeMs);
  useEffect(() => {
    timeRef.current = timeMs;
  });

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    last.current = null;
    const tick = (now: number) => {
      const prev = last.current ?? now;
      last.current = now;
      const next = (timeRef.current ?? 0) + (now - prev);
      timeRef.current = next;
      if (next >= sim.totalMs) {
        setTimeMs(sim.totalMs);
        setPlaying(false);
        return;
      }
      setTimeMs(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, sim.totalMs, setTimeMs, setPlaying]);

  const toggle = () => {
    if (playing) return setPlaying(false);
    if (timeMs == null || timeMs >= sim.totalMs) setTimeMs(0);
    setPlaying(true);
  };

  return (
    <div className="timeline">
      <button className="small" onClick={toggle} data-testid="play" disabled={sim.totalMs <= 0}>
        {playing ? t('timeline.pause') : t('timeline.play')}
      </button>
      <div className="tl-track">
        <div className="tl-blocks">
          {sim.steps.map((st) => {
            const step = auto.steps[st.index];
            if (!step || st.ms <= 0) return null;
            return (
              <button
                key={step.id}
                className={`tl-block kind-${step.kind} ${step.id === selectedId ? 'selected' : ''}`}
                style={{ left: `${(st.startMs / span) * 100}%`, width: `${(st.ms / span) * 100}%` }}
                title={`${st.index + 1}. ${t(`kind.${step.kind}` as MsgKey)} · ${fmtSec(st.ms)} s`}
                aria-label={`${st.index + 1}. ${t(`kind.${step.kind}` as MsgKey)} · ${fmtSec(st.ms)} s`}
                onClick={() => {
                  select(step.id);
                  setPlaying(false);
                  setTimeMs(st.startMs);
                }}
              />
            );
          })}
          {sim.totalMs > AUTO_MS && <div className="tl-limit" style={{ left: `${(AUTO_MS / span) * 100}%` }} />}
        </div>
        {sim.steps.some((st) => st.bgMs) && (
          <div className="tl-bg" role="group" aria-label={t('timeline.bg')}>
            {sim.steps.map((st) => {
              const step = auto.steps[st.index];
              if (!step || !st.bgMs || st.startMs >= span) return null;
              const label = `${st.index + 1}. ${t(`kind.${step.kind}` as MsgKey)} ∥ ${fmtSec(st.bgMs)} s`;
              return (
                <button
                  key={step.id}
                  className={`tl-block kind-${step.kind} ${step.id === selectedId ? 'selected' : ''}`}
                  style={{ left: `${(st.startMs / span) * 100}%`, width: `${(Math.min(st.bgMs, span - st.startMs) / span) * 100}%` }}
                  title={label}
                  aria-label={label}
                  onClick={() => {
                    select(step.id);
                    setPlaying(false);
                    setTimeMs(st.startMs);
                  }}
                />
              );
            })}
          </div>
        )}
        <input
          type="range"
          min={0}
          max={span}
          step={10}
          value={timeMs ?? 0}
          aria-label={t('timeline.aria')}
          onChange={(e) => {
            setPlaying(false);
            setTimeMs(Number(e.target.value));
          }}
        />
      </div>
      <span className="mono tl-time">
        {fmtSec(timeMs ?? 0)} / {fmtSec(sim.totalMs)} s
      </span>
    </div>
  );
}
