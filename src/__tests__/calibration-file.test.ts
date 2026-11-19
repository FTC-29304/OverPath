import { describe, expect, it } from 'vitest';
import { CALIBRATION_KEYS, calibrationDiff, parseCalibration } from '../codegen/calibrationFile';
import { defaultConfig } from '../model/defaults';
import { DEFAULT_CONSTANT_KEYS } from './helpers/constantKeys';

import FIXTURE from './fixtures/calibration.json?raw';

describe('calibration.json from the robot', () => {
  it('reads every value the Java tuner writes', () => {
    const r = parseCalibration(FIXTURE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.drivetrain).toBe('mecanum');
    expect(r.file.profile).toBe('competition');
    expect(Object.keys(r.file.values).sort()).toEqual([...CALIBRATION_KEYS].sort());
    expect(r.file.values.turnRadiusIn).toBeCloseTo(8.022);
    expect(r.file.values.alongPct).toBeCloseTo(0.0222);
    expect(r.file.report).toEqual(['frontLeftMotor: OK', 'Say "hi" \\ there']);
    expect(r.file.rejected).toEqual([]);
  });

  it('every calibration value is a planner constant with the same name', () => {
    for (const k of CALIBRATION_KEYS) expect(DEFAULT_CONSTANT_KEYS).toContain(k);
  });

  it('rejects non-JSON, other files, newer versions and empty files', () => {
    expect(parseCalibration('nope')).toEqual({ ok: false, error: 'calibFile.notJson' });
    expect(parseCalibration('{"kind":"something-else"}')).toEqual({ ok: false, error: 'calibFile.notCalibration' });
    expect(parseCalibration('{"kind":"overpath-calibration","version":2,"values":{"minPower":0.1}}')).toEqual({ ok: false, error: 'calibFile.newerVersion' });
    expect(parseCalibration('{"kind":"overpath-calibration","version":1,"values":{}}')).toEqual({ ok: false, error: 'calibFile.empty' });
  });

  it('leaves out values outside a sane range instead of applying them', () => {
    const r = parseCalibration('{"kind":"overpath-calibration","version":1,"values":{"turnRadiusIn":80,"minPower":0.12,"alongPct":"x"}}');
    expect(r.ok && r.file.values).toEqual({ minPower: 0.12 });
    expect(r.ok && r.file.rejected).toEqual(['turnRadiusIn']);
  });

  it('a tank file says tank; an unknown profile is null', () => {
    const r = parseCalibration('{"kind":"overpath-calibration","version":1,"drivetrain":"TANK","profile":"garage","values":{"minPower":0.12}}');
    expect(r.ok && r.file.drivetrain).toBe('tank');
    expect(r.ok && r.file.profile).toBeNull();
  });

  it('the diff lists only values that change', () => {
    const c = defaultConfig().constants;
    const r = parseCalibration(`{"kind":"overpath-calibration","version":1,"values":{"minPower":${c.minPower},"turnRadiusIn":9.5}}`);
    expect(r.ok && calibrationDiff(c, r.file)).toEqual([['turnRadiusIn', c.turnRadiusIn, 9.5]]);
  });
});
