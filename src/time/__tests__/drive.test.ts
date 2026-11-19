import { describe, expect, it } from 'vitest';
import { defaultCalibration } from '../model/defaults';
import { driveDisplacement, fitRuns, msForDistance, powerScale, robotVelocity, solveDrive, turnMs } from '../sim/drive';

const cal = { ...defaultCalibration(), forwardInPerSec: 40, strafeInPerSec: 30, forwardExtraMs: 50, strafeExtraMs: 20 };

describe('timed-drive model', () => {
  it('scales speed with power above the friction deadband', () => {
    expect(powerScale(cal, cal.calPower)).toBeCloseTo(1);
    expect(powerScale(cal, cal.minPower)).toBe(0);
    expect(powerScale(cal, 0.01)).toBe(0);
    expect(powerScale(cal, 1)).toBeGreaterThan(1.9);
  });

  it('drives forward at the forward speed and strafes at the strafe speed', () => {
    const f = driveDisplacement(cal, 0, cal.calPower, 1000);
    expect(f.f).toBeCloseTo(40 * 1.05);
    expect(f.l).toBeCloseTo(0);
    const s = driveDisplacement(cal, 90, cal.calPower, 1000);
    expect(s.l).toBeCloseTo(30 * 1.02);
    expect(s.f).toBeCloseTo(0);
    const r = driveDisplacement(cal, -90, cal.calPower, 1000);
    expect(r.l).toBeCloseTo(-30 * 1.02);
  });

  it('mixes diagonals like the robot does (largest wheel = power)', () => {
    const v = robotVelocity(cal, 45, cal.calPower);
    expect(v.f).toBeCloseTo(20);
    expect(v.l).toBeCloseTo(15);
  });

  it('0 ms goes nowhere', () => {
    expect(driveDisplacement(cal, 0, 0.5, 0)).toEqual({ f: 0, l: 0 });
  });

  it('solveDrive is the exact inverse (within 0.1 in) for any direction', () => {
    for (let i = 0; i < 300; i++) {
      const f = (Math.sin(i * 12.9898) * 43758.5453) % 60;
      const l = (Math.sin(i * 78.233) * 12345.678) % 60;
      if (Math.hypot(f, l) < 4) continue;
      const sol = solveDrive(cal, f, l, 0.5)!;
      const d = driveDisplacement(cal, sol.dirDeg, 0.5, sol.ms);
      expect(Math.hypot(d.f - f, d.l - l)).toBeLessThan(0.1);
    }
  });

  it('snaps near-45° directions and keeps the distance along the snapped move', () => {
    const sol = solveDrive(cal, 30, 1.5, 0.5, 5)!;
    expect(sol.dirDeg).toBe(0);
    const d = driveDisplacement(cal, 0, 0.5, sol.ms);
    expect(d.f).toBeCloseTo(30, 1);
    const free = solveDrive(cal, 30, 1.5, 0.5, 0)!;
    expect(free.dirDeg).not.toBe(0);
  });

  it('returns null when it cannot move', () => {
    expect(solveDrive(cal, 0, 0, 0.5)).toBeNull();
    expect(solveDrive(cal, 10, 0, 0.02)).toBeNull();
    expect(msForDistance(cal, 0, 0.02, 10)).toBeNull();
  });

  it('fits speed and ramp/coast time from two runs', () => {
    const fit = fitRuns(1000, 40.66, 2000, 78.66)!;
    expect(fit.inPerSec).toBeCloseTo(38, 2);
    expect(fit.extraMs).toBe(70);
    expect(fitRuns(1000, 40, 2000, 30)).toBeNull();
    expect(fitRuns(1000, 0, 2000, 30)).toBeNull();
  });

  it('estimates IMU turn time', () => {
    expect(turnMs(cal, 1, 0.5, 1.5, 2500)).toBe(0);
    const t90 = turnMs(cal, 90, 0.5, 1.5, 2500);
    expect(t90).toBeCloseTo((90 / cal.turnDegPerSec) * 1000 + 250, -1);
    expect(turnMs(cal, 179, 0.02, 1.5, 2500)).toBe(2500);
  });
});
