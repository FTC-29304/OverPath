import type { Waypoint } from '../model/types';

export function isPrecision(wp: Waypoint, index: number): boolean {
  if (index === 0) return false;
  return wp.precision ?? wp.actions.some((a) => a.kind === 'servo' || a.kind === 'motor' || a.kind === 'command');
}
