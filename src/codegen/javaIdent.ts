const RESERVED = new Set(
  (
    'abstract assert boolean break byte case catch char class const continue default do double else enum ' +
    'extends final finally float for goto if implements import instanceof int interface long native new ' +
    'package private protected public return short static strictfp super switch synchronized this throw ' +
    'throws transient try void volatile while true false null var record yield sealed permits _'
  ).split(' '),
);

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isJavaIdentifier(s: string): boolean {
  return IDENT.test(s) && !RESERVED.has(s);
}

export function isJavaExpressionPath(s: string): boolean {
  const parts = s.split('.');
  return parts.every((p, i) => (i === 0 && p === 'this' && parts.length > 1) || isJavaIdentifier(p));
}

export function isPackageName(s: string): boolean {
  return s.split('.').every((p) => /^[a-z_][a-z0-9_]*$/i.test(p) && !RESERVED.has(p));
}

export function toClassName(name: string): string {
  const words = name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let out = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  if (!out) out = 'PathPlannerAuto';
  if (/^[0-9]/.test(out)) out = 'Auto' + out;
  return RESERVED.has(out) ? out + 'Auto' : out;
}

export function javaString(s: string): string {
  const body = s.replace(/[\\"]/g, (c) => '\\' + c).replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  return `"${body.replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))}"`;
}

export function jDouble(n: number, digits = 2): string {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f + 0;
  const s = r.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  return s.includes('.') ? s : s + '.0';
}

export function jLong(n: number): string {
  return String(Math.max(0, Math.round(n)));
}
