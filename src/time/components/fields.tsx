import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface NumProps {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  title?: string;
  testId?: string;
  className?: string;
}

export function NumField({ label, value, onChange, min = -Infinity, max = Infinity, step = 1, digits = 3, title, testId, className }: NumProps) {
  const id = useId();
  const shown = String(Math.round(value * 10 ** digits) / 10 ** digits);
  const [text, setText] = useState(shown);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(shown);
  }, [shown]);
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (text.trim() === '' || !Number.isFinite(n)) return setText(shown);
    const c = Math.min(max, Math.max(min, n));
    if (c !== value) onChange(c);
    setText(String(Math.round(c * 10 ** digits) / 10 ** digits));
  };
  return (
    <label className={`field-label ${className ?? ''}`} htmlFor={id} title={title}>
      <span>{label}</span>
      <input
        id={id}
        className="num"
        inputMode="decimal"
        value={text}
        step={step}
        data-testid={testId}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setText(shown);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}

interface TextProps {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId?: string;
}

export function TextField({ label, value, onChange, placeholder, testId }: TextProps) {
  const id = useId();
  return (
    <label className="field-label" htmlFor={id}>
      <span>{label}</span>
      <input id={id} className="text" value={value} placeholder={placeholder} data-testid={testId} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

interface CheckProps {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}

export function CheckField({ label, checked, onChange, testId }: CheckProps) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} data-testid={testId} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
