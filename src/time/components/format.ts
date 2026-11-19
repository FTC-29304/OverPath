import type { ViewPrefs } from '../model/types';

export function fmtLen(view: Pick<ViewPrefs, 'units'>, inches: number): string {
  const v = view.units === 'cm' ? inches * 2.54 : inches;
  return (Math.round(v * 10) / 10 + 0).toFixed(1);
}

export function fromLen(view: Pick<ViewPrefs, 'units'>, value: number): number {
  return view.units === 'cm' ? value / 2.54 : value;
}

export function fmtSec(ms: number): string {
  return (ms / 1000).toFixed(1);
}
