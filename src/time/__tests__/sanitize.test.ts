import { describe, expect, it } from 'vitest';
import { defaultCalibration, defaultHardware, defaultView, ROBOT_COMMANDS, ROBOT_COMMAND_SETUP } from '../model/defaults';
import { sanitizeHardware, sanitizeSaved, sanitizeStep } from '../model/sanitize';

describe('sanitize saved data', () => {
  it('garbage falls back to a working planner', () => {
    for (const junk of [null, 42, 'x', [], { autos: 'no' }, { autos: [null, 3] }]) {
      const s = sanitizeSaved(junk);
      expect(s.autos.length).toBe(1);
      expect(s.activeId).toBe(s.autos[0].id);
      expect(s.calibration).toEqual(defaultCalibration());
      expect(s.hw).toEqual(defaultHardware());
      expect(s.view).toEqual(defaultView());
    }
  });

  it('older saves (no commandSetup) get the robot mechanism commands, keeping their own', () => {
    const old = sanitizeHardware({ commands: ['score'] });
    expect(old.commandSetup).toBe(ROBOT_COMMAND_SETUP);
    expect(old.commands).toEqual([...ROBOT_COMMANDS, 'score']);
    const chosen = sanitizeHardware({ commands: ['score'], commandSetup: '' });
    expect(chosen.commandSetup).toBe('');
    expect(chosen.commands).toEqual(['score']);
  });

  it('drops unknown steps, clamps numbers and fixes types', () => {
    expect(sanitizeStep({ kind: 'teleport' })).toBeNull();
    expect(sanitizeStep({ id: 'a', kind: 'drive', dirDeg: 500, power: 3, ms: -5 })).toEqual({ id: 'a', kind: 'drive', dirDeg: 180, power: 1, ms: 0 });
    expect(sanitizeStep({ id: 'b', kind: 'wall', face: 'top', power: 'x' })).toEqual({ id: 'b', kind: 'wall', face: 'back', power: 0.3, ms: 900, alignHeading: true });
    expect(sanitizeStep({ id: 'c', kind: 'drive', ms: 1234.6 })).toMatchObject({ ms: 1235 });
  });

  it('makes repeated ids unique and keeps a valid active auto', () => {
    const step = { id: 's1', kind: 'wait', ms: 100 };
    const s = sanitizeSaved({
      autos: [
        { id: 'a', name: 'A', start: { x: 0, y: 0, heading: 0 }, steps: [step, step] },
        { id: 'a', name: 'B', steps: [step] },
      ],
      activeId: 'zzz',
      calibration: { forwardInPerSec: -3, measured: true },
      view: { rotation: 45, language: 'tr', flatFaces: ['front', 'weird'] },
    });
    const ids = s.autos.flatMap((a) => [a.id, ...a.steps.map((x) => x.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.activeId).toBe('a');
    expect(s.calibration.forwardInPerSec).toBe(1);
    expect(s.calibration.measured).toBe(true);
    expect(s.view.rotation).toBe(0);
    expect(s.view.language).toBe('tr');
    expect(s.view.flatFaces).toEqual(['front']);
  });
});
