import type { ReactNode } from 'react';

export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(m[1] !== undefined ? <code key={k++}>{m[1]}</code> : <b key={k++}>{m[2]}</b>);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
