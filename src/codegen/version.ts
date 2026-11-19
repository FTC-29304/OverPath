export const RUNNER_VERSION = '3.0.0';

export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const parts = (v: string | null | undefined) => (v ?? '').split('.').map((p) => parseInt(p, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
