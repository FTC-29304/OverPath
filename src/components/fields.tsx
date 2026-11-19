import { useRef, useState, type ReactNode } from 'react';

interface NumProps {
  value: number;
  onCommit: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  label?: string;
  suffix?: string;
  title?: string;
  testId?: string;
}

const round = (n: number, digits: number) => String(Math.round(n * 10 ** digits) / 10 ** digits);

export function NumField({ value, onCommit, step = 1, min, max, digits = 2, label, suffix, title, testId }: NumProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  const commit = (text: string) => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) return;
    let c = n;
    if (min !== undefined) c = Math.max(min, c);
    if (max !== undefined) c = Math.min(max, c);
    if (c !== value) onCommit(c);
  };

  const input = (
    <input
      className="num"
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      value={draft ?? round(value, digits)}
      title={title}
      data-testid={testId}
      onFocus={() => setDraft(round(value, digits))}
      onWheel={(e) => (e.target as HTMLInputElement).blur()}
      onBlur={() => {
        if (!cancelled.current && draft !== null) commit(draft);
        cancelled.current = false;
        setDraft(null);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
  if (!label) return input;
  return (
    <label className="field-row">
      <span>{label}</span>
      <span className="with-suffix">
        {input}
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

interface TextProps {
  value: string;
  onChange: (s: string) => void;
  label?: ReactNode;
  error?: string;
  placeholder?: string;
  mono?: boolean;
  testId?: string;
}

export function TextField({ value, onChange, label, error, placeholder, mono, testId }: TextProps) {
  const input = (
    <input
      className={`text${mono ? ' mono' : ''}${error ? ' invalid' : ''}`}
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      data-testid={testId}
      aria-invalid={!!error}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  return (
    <label className="field-row stacked">
      {label && <span>{label}</span>}
      {input}
      {error && <small className="error">{error}</small>}
    </label>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  testId?: string;
}) {
  return (
    <div className="seg" role="radiogroup" data-testid={testId}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
