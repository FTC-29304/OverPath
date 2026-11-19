import { switchMode, type HandoffLanguage, type PlannerMode } from './plannerMode';

interface ModeSwitchProps {
  current: PlannerMode;
  language: HandoffLanguage;
  label: string;
  pathLabel: string;
  pathTitle: string;
  timeLabel: string;
  timeTitle: string;
}

export function ModeSwitch({ current, language, label, pathLabel, pathTitle, timeLabel, timeTitle }: ModeSwitchProps) {
  const options: { mode: PlannerMode; text: string; title: string }[] = [
    { mode: 'path', text: pathLabel, title: pathTitle },
    { mode: 'time', text: timeLabel, title: timeTitle },
  ];

  return (
    <div className="mode-switch" role="radiogroup" aria-label={label} data-testid="mode-switch">
      {options.map((option) => (
        <button
          key={option.mode}
          role="radio"
          aria-checked={option.mode === current}
          className={option.mode === current ? 'on' : ''}
          title={option.title}
          onClick={() => option.mode !== current && switchMode(option.mode, language)}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}
