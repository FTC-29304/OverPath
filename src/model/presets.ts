export interface MotorPreset {
  id: string;
  label: string;
  ticksPerRev: number;
}

export interface WheelPreset {
  id: string;
  label: string;
  diameterIn: number;
  kind: 'mecanum' | 'traction';
}

export const CUSTOM = 'custom';

export const MOTOR_PRESETS: MotorPreset[] = [
  { id: 'gobilda-1150', label: 'goBILDA 5203 1150 rpm (5.2:1)', ticksPerRev: 145.1 },
  { id: 'gobilda-435', label: 'goBILDA 5203 435 rpm (13.7:1)', ticksPerRev: 384.5 },
  { id: 'gobilda-312', label: 'goBILDA 5203 312 rpm (19.2:1)', ticksPerRev: 537.7 },
  { id: 'gobilda-223', label: 'goBILDA 5203 223 rpm (26.9:1)', ticksPerRev: 751.8 },
  { id: 'gobilda-117', label: 'goBILDA 5203 117 rpm (50.9:1)', ticksPerRev: 1425.1 },
  { id: 'rev-hdhex-20', label: 'REV HD Hex 20:1 spur gearbox', ticksPerRev: 560 },
  { id: 'rev-hdhex-40', label: 'REV HD Hex 40:1 spur gearbox', ticksPerRev: 1120 },
  { id: 'rev-corehex', label: 'REV Core Hex', ticksPerRev: 288 },
];

export const WHEEL_PRESETS: WheelPreset[] = [
  { id: 'gobilda-mecanum-96', label: 'goBILDA 96 mm mecanum', diameterIn: 3.78, kind: 'mecanum' },
  { id: 'gobilda-mecanum-104', label: 'goBILDA 104 mm mecanum', diameterIn: 4.09, kind: 'mecanum' },
  { id: 'gobilda-mecanum-140', label: 'goBILDA 140 mm mecanum', diameterIn: 5.51, kind: 'mecanum' },
  { id: 'rev-mecanum-75', label: 'REV 75 mm mecanum', diameterIn: 2.95, kind: 'mecanum' },
  { id: 'rev-traction-90', label: 'REV 90 mm traction', diameterIn: 3.54, kind: 'traction' },
];

export function matchMotor(model: string, ticksPerRev: number): MotorPreset | null {
  const p = MOTOR_PRESETS.find((m) => m.id === model);
  return p && Math.abs(p.ticksPerRev - ticksPerRev) < 1e-6 ? p : null;
}

export function matchWheel(model: string, diameterIn: number): WheelPreset | null {
  const p = WHEEL_PRESETS.find((w) => w.id === model);
  return p && Math.abs(p.diameterIn - diameterIn) < 1e-6 ? p : null;
}
