import { useT, type MsgKey } from '../i18n';
import { AUTO_SECONDS, type Timeline as TL } from '../sim/simulate';
import type { StepKind } from '../model/types';

const KIND_LABEL: Record<StepKind, MsgKey> = {
  move: 'kind.move',
  turnTo: 'kind.turnTo',
  wait: 'kind.wait',
  servo: 'kind.servo',
  motor: 'kind.motor',
  command: 'kind.command',
  square: 'kind.square',
};

interface Props {
  timeline: TL;
  time: number;
  playing: boolean;
  activeStep: number;
  onTime: (t: number) => void;
  onPlay: (playing: boolean) => void;
}

export function Timeline({ timeline, time, playing, activeStep, onTime, onPlay }: Props) {
  const t = useT();
  const total = timeline.total;
  const span = Math.max(total, AUTO_SECONDS);
  const over = total > AUTO_SECONDS;
  const active = timeline.entries[activeStep];

  return (
    <div className="timeline" data-testid="timeline">
      <div className="tl-controls">
        <button
          className="primary small"
          disabled={total <= 0}
          onClick={() => {
            if (!playing && time >= total) onTime(0);
            onPlay(!playing);
          }}
          data-testid="play"
        >
          {playing ? t('timeline.pause') : t('timeline.play')}
        </button>
        <button
          className="small"
          onClick={() => {
            onPlay(false);
            onTime(0);
          }}
        >
          {t('timeline.reset')}
        </button>
        <span className="tl-time mono">
          {time.toFixed(1)} / <span className={over ? 'bad' : ''}>{total.toFixed(1)} s</span>
        </span>
        <span className="tl-step">
          {active ? `${activeStep + 1}. ${t(KIND_LABEL[active.step.kind])}` : ''}
        </span>
        {over && <span className="bad tl-over">{t('timeline.over')}</span>}
      </div>
      <div
        className="tl-bar"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const seek = (x: number) => onTime(Math.min(total, Math.max(0, ((x - r.left) / r.width) * span)));
          onPlay(false);
          seek(e.clientX);
          const move = (ev: PointerEvent) => seek(ev.clientX);
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
        role="slider"
        aria-label={t('timeline.aria')}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={time}
      >
        {timeline.entries
          .filter((e) => e.duration > 0)
          .map((e) => (
            <div
              key={e.index}
              className={`tl-seg tl-${e.step.kind}${e.index === activeStep ? ' active' : ''}`}
              style={{ left: `${(e.start / span) * 100}%`, width: `${(e.duration / span) * 100}%` }}
              title={t('timeline.segTitle', { kind: t(KIND_LABEL[e.step.kind]), s: e.duration.toFixed(2) })}
            />
          ))}
        {timeline.entries
          .filter((e) => e.background)
          .map((e) => (
            <div
              key={`bg${e.index}`}
              className={`tl-bg tl-${e.step.kind}`}
              style={{ left: `${(e.start / span) * 100}%`, width: `${((e.background ?? 0) / span) * 100}%` }}
              title={t('timeline.bgTitle', { kind: t(KIND_LABEL[e.step.kind]), s: (e.background ?? 0).toFixed(2) })}
            />
          ))}
        <div className="tl-30" style={{ left: `${(AUTO_SECONDS / span) * 100}%` }} />
        <div className="tl-head" style={{ left: `${(time / span) * 100}%` }} />
      </div>
      <div className="tl-legend">
        {(['move', 'turnTo', 'wait', 'motor', 'command'] as StepKind[]).map((k) => (
          <span key={k}>
            <i className={`tl-${k}`} /> {t(KIND_LABEL[k])}
          </span>
        ))}
        <span>
          <i className="tl-bg-key" /> {t('timeline.background')}
        </span>
        <span className="muted">{t('timeline.speedNote')}</span>
      </div>
    </div>
  );
}
