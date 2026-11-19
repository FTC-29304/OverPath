import { describe, expect, it } from 'vitest';
import { generateJava } from '../codegen/java';
import { compile } from '../compile/compile';
import { defaultConfig, makeWaypoint } from '../model/defaults';
import type { Action, Auto } from '../model/types';
import { simulate } from '../sim/simulate';

function preloadAuto(actions: Action[]): Auto {
  const start = makeWaypoint(-36, -63, 90);
  start.actions = actions;
  return { id: 'a', name: 'Preload', waypoints: [start, makeWaypoint(-36, -39, 90, 0.6)] };
}

const shoot: Action = { id: 's', kind: 'command', name: 'shoot', ms: 1500 };
const intakeBg: Action = { id: 'i', kind: 'motor', mechanismId: 'mech_intake', power: 1, ms: 2000, background: true };

describe('timed motor and command actions', () => {
  it('compiles durations; background only applies when there is a duration', () => {
    const steps = compile(
      preloadAuto([shoot, intakeBg, { id: 'x', kind: 'command', name: 'beep', ms: 0, background: true }]),
      defaultConfig(),
    ).steps;
    expect(steps.slice(0, 3)).toMatchObject([
      { kind: 'command', name: 'shoot', ms: 1500, background: false },
      { kind: 'motor', ms: 2000, background: true },
      { kind: 'command', name: 'beep', ms: 0, background: false },
    ]);
  });

  it('old saved commands without ms still run once', () => {
    const steps = compile(preloadAuto([{ id: 'o', kind: 'command', name: 'score' }]), defaultConfig()).steps;
    expect(steps[0]).toMatchObject({ kind: 'command', ms: 0, background: false });
  });

  it('the sequence waits for a timed step but not for a background one', () => {
    const c = defaultConfig();
    const waiting = simulate(compile(preloadAuto([shoot]), c).steps, c.drivetrain, c.constants);
    const none = simulate(compile(preloadAuto([]), c).steps, c.drivetrain, c.constants);
    expect(waiting.total - none.total).toBeCloseTo(1.5);

    const bg = simulate(compile(preloadAuto([intakeBg]), c).steps, c.drivetrain, c.constants);
    expect(bg.sequenceEnd).toBeCloseTo(none.total);
    expect(bg.total).toBeCloseTo(Math.max(none.total, 2));
    expect(bg.entries[0].background).toBe(2);
  });

  it('generates commandFor / startMotorFor and a start+stop registration for timed commands', () => {
    const code = generateJava(preloadAuto([shoot, intakeBg]), defaultConfig()).code;
    expect(code).toContain('.commandFor("shoot", 1500)');
    expect(code).toContain('.startMotorFor(intakeMotor, 1.0, 2000)');
    expect(code).toMatch(/registerCommand\("shoot",\n\s+\(\) -> \{\n\s+\},\n\s+\(\) -> \{\n\s+\}\);/);
    expect(code).toContain('runner.registerCommand("score", () -> {');
  });

  it('generates startCommandFor and motorFor', () => {
    const code = generateJava(
      preloadAuto([
        { ...shoot, background: true },
        { ...intakeBg, background: false },
      ]),
      defaultConfig(),
    ).code;
    expect(code).toContain('.startCommandFor("shoot", 1500)');
    expect(code).toContain('.motorFor(intakeMotor, 1.0, 2000)');
  });
});
