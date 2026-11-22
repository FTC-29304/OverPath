import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { generateAuto, generateCalibration } from '../../../src/time/codegen/java';
import { defaultAuto, defaultCalibration, defaultHardware } from '../../../src/time/model/defaults';
import { mirrorAuto } from '../../../src/time/model/mirror';
import type { Auto, HardwareConfig } from '../../../src/time/model/types';

const OUT = process.env.GEN_OUT;

test.skipIf(!OUT)('generate sample Java for javac', () => {
  const hw: HardwareConfig = {
    ...defaultHardware(),
    mechanisms: [
      { id: 'm1', label: 'Claw', kind: 'servo', javaName: 'clawServo', hardwareName: 'claw' },
      { id: 'm2', label: 'Intake', kind: 'crservo', javaName: 'intake', hardwareName: 'intake' },
      { id: 'm3', label: 'Lift', kind: 'motor', javaName: 'liftMotor', hardwareName: 'lift' },
    ],
    commands: ['score', 'say "hi"'],
    commandSetup: '',
  };
  const cal = defaultCalibration();
  const full: Auto = {
    id: 'a',
    name: 'Gen Full',
    start: { x: 63, y: -12, heading: 180 },
    steps: [
      { id: '1', kind: 'drive', dirDeg: 0, power: 0.5, ms: 600 },
      { id: '2', kind: 'turn', heading: 90, power: 0.5 },
      { id: '3', kind: 'wall', face: 'back', power: 0.3, ms: 1200, alignHeading: true },
      { id: '4', kind: 'servo', mechanismId: 'm1', position: 0.65 },
      { id: '5', kind: 'motor', mechanismId: 'm2', power: -1, ms: 800, background: false },
      { id: '6', kind: 'motor', mechanismId: 'm3', power: 0.4, ms: 0, background: false },
      { id: '7', kind: 'command', name: 'score', ms: 300, background: false, stopCommand: '' },
      { id: '8', kind: 'command', name: 'say "hi"', ms: 0, background: false, stopCommand: '' },
      { id: '8b', kind: 'motor', mechanismId: 'm2', power: 1, ms: 1500, background: true },
      { id: '8c', kind: 'command', name: 'score', ms: 1200, background: true, stopCommand: 'say "hi"' },
      { id: '9', kind: 'servo', mechanismId: '', position: 0.2 },
      { id: '10', kind: 'drive', dirDeg: -37.5, power: 0.4, ms: 450 },
      { id: '11', kind: 'wait', ms: 250 },
    ],
  };
  const files = [
    generateAuto(full, hw, cal),
    generateAuto({ ...defaultAuto('GenDefault'), id: 'b' }, hw, cal),
    generateAuto({ ...mirrorAuto(full, 'rotate180'), name: 'Gen Mirror' }, hw, cal),
    generateAuto({ ...defaultAuto('GenEmpty'), id: 'c', steps: [] }, hw, cal),
    generateCalibration(hw, cal),
    generateAuto({ ...full, id: 'r', name: 'Gen Robot' }, { ...hw, commandSetup: defaultHardware().commandSetup }, cal),
  ];
  const dir = `${OUT}/${hw.packageName.replace(/\./g, '/')}`;
  mkdirSync(dir, { recursive: true });
  for (const f of files) writeFileSync(`${dir}/${f.fileName}`, f.code);
  expect(new Set(files.map((f) => f.fileName)).size).toBe(files.length);
});
