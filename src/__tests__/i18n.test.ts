import { describe, expect, it } from 'vitest';
import { checkAuto } from '../rules/biobuzz';
import { compile } from '../compile/compile';
import { validateConfig } from '../codegen/java';
import { en, type MsgKey } from '../i18n/en';
import { tr } from '../i18n/tr';
import { msg, translate, type Msg } from '../i18n/translate';
import { defaultConfig, makeWaypoint } from '../model/defaults';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const backticks = (s: string) => (s.match(/`/g) ?? []).length;
const bolds = (s: string) => (s.match(/\*\*/g) ?? []).length;

describe('Turkish dictionary', () => {
  const keys = Object.keys(en) as MsgKey[];

  it('has every English key and no extra ones', () => {
    expect(Object.keys(tr).sort()).toEqual([...keys].sort());
  });

  it.each(keys)('%s: non-empty, same placeholders and markup as English', (k) => {
    expect(tr[k].trim()).not.toBe('');
    expect(placeholders(tr[k])).toEqual(placeholders(en[k]));
    expect(backticks(tr[k]) % 2).toBe(0);
    expect(bolds(tr[k]) % 2).toBe(0);
  });
});

describe('translate', () => {
  it('fills placeholders, including nested messages', () => {
    const m: Msg = msg('cfg.hwName', { what: msg('motor.leftFront') });
    expect(translate('en', m.key, m.params)).toBe('Front left motor needs a hardware config name.');
    expect(translate('tr', m.key, m.params)).toBe('Sol ön motor için bir yapılandırma adı gerekli.');
  });

  it('leaves unknown placeholders alone', () => {
    expect(translate('en', 'export.steps')).toBe('{n} steps');
  });
});

describe('every message the app can produce has a translation', () => {
  const both = (m: Msg) => {
    for (const lang of ['en', 'tr'] as const) {
      const s = translate(lang, m.key, m.params);
      expect(s).not.toMatch(/\{\w+\}/);
    }
  };

  it('rules check messages', () => {
    const bad = compile(
      { id: 'a', name: 'a', waypoints: [makeWaypoint(0, -50, 90), makeWaypoint(36, -50, 90), makeWaypoint(0, 0, 90)] },
      defaultConfig(),
    );
    const report = checkAuto(bad, 20, 18);
    expect(report.issues.length).toBeGreaterThan(3);
    report.issues.forEach((i) => both(i.message));
  });

  it('settings validation messages', () => {
    const c = defaultConfig();
    c.output = 'opmode';
    c.imu = '';
    c.motors.rightBack = 'class';
    c.commands = ['', 'x', 'x'];
    c.constants.ticksPerRev = 0;
    c.hubUsb = 'DOWN';
    const issues = validateConfig(c);
    expect(issues.length).toBeGreaterThan(4);
    issues.forEach((i) => both(i.message));
  });
});
