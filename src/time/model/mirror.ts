import { wrapDeg } from '../geometry/transform';
import type { Auto, MirrorMode, RobotFace, Step } from './types';
import { newId } from './defaults';

const SWAP_FACE: Record<RobotFace, RobotFace> = { front: 'front', back: 'back', left: 'right', right: 'left' };

function mirrorHeading(h: number, mode: MirrorMode): number {
  return wrapDeg(mode === 'rotate180' ? h + 180 : 180 - h);
}

function mirrorStep(s: Step, mode: MirrorMode): Step {
  const id = newId('st');
  switch (s.kind) {
    case 'drive':
      return { ...s, id, dirDeg: mode === 'flipX' ? wrapDeg(-s.dirDeg) : s.dirDeg };
    case 'turn':
      return { ...s, id, heading: mirrorHeading(s.heading, mode) };
    case 'wall':
      return { ...s, id, face: mode === 'flipX' ? SWAP_FACE[s.face] : s.face };
    default:
      return { ...s, id };
  }
}

export function mirrorName(name: string): string {
  if (/red/i.test(name)) return name.replace(/red/i, (m) => (m === 'RED' ? 'BLUE' : m === 'red' ? 'blue' : 'Blue'));
  if (/blue/i.test(name)) return name.replace(/blue/i, (m) => (m === 'BLUE' ? 'RED' : m === 'blue' ? 'red' : 'Red'));
  return `${name}Mirror`;
}

export function mirrorAuto(auto: Auto, mode: MirrorMode): Auto {
  const { x, y, heading } = auto.start;
  return {
    id: newId('auto'),
    name: mirrorName(auto.name),
    start: {
      x: -x + 0,
      y: mode === 'rotate180' ? -y + 0 : y,
      heading: mirrorHeading(heading, mode),
    },
    steps: auto.steps.map((s) => mirrorStep(s, mode)),
  };
}
