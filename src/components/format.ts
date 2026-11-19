import { toDisplay, type DisplayPrefs } from '../geometry/transform';

export function fmtPos(p: DisplayPrefs, inches: number): string {
  return toDisplay(p, inches, true).toFixed(1);
}
