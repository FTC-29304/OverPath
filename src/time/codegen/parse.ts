import { wrapDeg } from '../geometry/transform';
import { newId } from '../model/defaults';
import { sanitizeStep } from '../model/sanitize';
import type { HardwareConfig, Mechanism, MechanismKind, RobotFace, Step } from '../model/types';

export interface SkippedLine {
  line: number;
  text: string;
}

export interface ParsedAuto {
  name: string | null;
  startHeading: number | null;
  steps: Step[];
  newMechanisms: Mechanism[];
  newCommands: string[];
  skipped: SkippedLine[];
}

export type ParseResult = { ok: true; auto: ParsedAuto } | { ok: false; error: 'parse.empty' | 'parse.noRunner' };

interface Statement {
  text: string;
  line: number;
}

interface Call {
  method: string;
  args: string[];
}

const FACES: Record<string, RobotFace> = { FRONT: 'front', BACK: 'back', LEFT: 'left', RIGHT: 'right' };
const STEP_METHODS = new Set(['drive', 'turnTo', 'pushWall', 'waitMs', 'servo', 'motor', 'startMotor', 'command', 'startCommand']);
const QUIET = /^(telemetry\s*\.|idle\s*\(|opModeIsActive\s*\(|if\s*\(\s*isStopRequested)/;

function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function statements(src: string): Statement[] {
  const out: Statement[] = [];
  let depth = 0;
  let cur = '';
  let line = 1;
  let startLine = 1;
  const flush = () => {
    const text = cur.replace(/\s+/g, ' ').trim();
    if (text) out.push({ text, line: startLine });
    cur = '';
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (!cur.trim() && c.trim()) startLine = line;
    if (c === '\n') line++;
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      cur += src.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (c === ';' || c === '{' || c === '}')) {
      flush();
      continue;
    }
    cur += c;
  }
  flush();
  return out;
}

function splitArgs(s: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
      cur += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function chain(text: string, runner: string): Call[] | null {
  if (!text.startsWith(`${runner}.`) && !text.startsWith(`${runner} .`)) return null;
  const calls: Call[] = [];
  let rest = text.slice(runner.length).trim();
  while (rest) {
    const m = /^\.\s*(\w+)\s*\(/.exec(rest);
    if (!m) return null;
    let depth = 1;
    let i = m[0].length;
    for (; i < rest.length && depth > 0; i++) {
      const c = rest[i];
      if (c === '"') {
        i++;
        while (i < rest.length && rest[i] !== '"') i += rest[i] === '\\' ? 2 : 1;
      } else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    if (depth !== 0) return null;
    calls.push({ method: m[1], args: splitArgs(rest.slice(m[0].length, i - 1)) });
    rest = rest.slice(i).trim();
  }
  return calls;
}

function num(arg: string | undefined): number | null {
  if (arg == null) return null;
  const m = /^\(?\s*(?:\((?:long|int|double|float)\)\s*)?([+-]?\s*(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)[lLdDfF]?\s*\)?$/.exec(arg.trim());
  return m ? Number(m[1].replace(/\s+/g, '')) : null;
}

function javaStr(arg: string | undefined): string | null {
  if (arg == null) return null;
  if (arg.trim() === 'null') return '';
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(arg.trim());
  return m ? m[1].replace(/\\(.)/g, (_, ch: string) => (ch === 'n' ? '\n' : ch === 't' ? '\t' : ch)) : null;
}

function bool(arg: string | undefined): boolean | null {
  return arg?.trim() === 'true' ? true : arg?.trim() === 'false' ? false : null;
}

function face(arg: string | undefined): RobotFace | null {
  const m = /^(?:OverTime\s*\.\s*)?Face\s*\.\s*(FRONT|BACK|LEFT|RIGHT)$/.exec(arg?.trim() ?? '');
  return m ? FACES[m[1]] : null;
}

function autoName(src: string): string | null {
  const ann = /@Autonomous\s*\(([^)]*)\)/.exec(src);
  const named = ann ? /name\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(ann[1]) : null;
  if (named) return named[1].replace(/\\(.)/g, '$1');
  return /\bclass\s+(\w+)/.exec(src)?.[1] ?? null;
}

const DECL =
  /\b(Servo|CRServo|DcMotor|DcMotorEx|DcMotorSimple)\s+(\w+)\s*=\s*(?:\(\s*\w+\s*\)\s*)?hardwareMap\s*\.\s*(?:get\s*\(\s*\w+\s*\.\s*class\s*,\s*|(?:servo|crservo|dcMotor)\s*\.\s*get\s*\(\s*)"((?:[^"\\]|\\.)*)"/g;

function declarations(src: string): Map<string, { kind: MechanismKind; hardwareName: string }> {
  const out = new Map<string, { kind: MechanismKind; hardwareName: string }>();
  for (const m of src.matchAll(DECL)) {
    out.set(m[2], { kind: m[1] === 'Servo' ? 'servo' : m[1] === 'CRServo' ? 'crservo' : 'motor', hardwareName: m[3] });
  }
  return out;
}

export function parseAuto(code: string, hw: HardwareConfig): ParseResult {
  if (!code.trim()) return { ok: false, error: 'parse.empty' };
  const src = stripComments(code);
  const ctor = /OverTime\s+(\w+)\s*=\s*new\s+OverTime\s*\(([^;]*)\)\s*;/.exec(src);
  const runner = ctor?.[1] ?? 'runner';
  const driveVars = new Set(ctor ? splitArgs(ctor[2]).slice(1, 5) : []);
  const declared = declarations(src);
  const all = statements(src);

  const isRunnerStep = (s: Statement) => {
    const calls = chain(s.text, runner);
    return !!calls && calls.some((c) => c.method === 'begin' || STEP_METHODS.has(c.method));
  };
  const first = all.findIndex(isRunnerStep);
  if (first < 0) return { ok: false, error: 'parse.noRunner' };

  const steps: Step[] = [];
  const skipped: SkippedLine[] = [];
  const newMechanisms: Mechanism[] = [];
  const newCommands: string[] = [];
  let startHeading: number | null = null;

  const mechanism = (javaName: string, want: 'servo' | 'motor'): Mechanism | null => {
    const fits = (m: Mechanism) => (want === 'servo' ? m.kind === 'servo' : m.kind !== 'servo');
    const known = hw.mechanisms.find((m) => m.javaName === javaName) ?? newMechanisms.find((m) => m.javaName === javaName);
    if (known) return fits(known) ? known : null;
    if (!/^[A-Za-z_]\w*$/.test(javaName) || driveVars.has(javaName)) return null;
    const decl = declared.get(javaName);
    const m: Mechanism = {
      id: newId('mech'),
      label: javaName,
      kind: decl?.kind ?? want,
      javaName,
      hardwareName: decl?.hardwareName ?? javaName,
    };
    if (!fits(m)) return null;
    newMechanisms.push(m);
    return m;
  };
  const command = (name: string) => {
    if (name && !hw.commands.includes(name) && !newCommands.includes(name)) newCommands.push(name);
  };

  const toStep = (c: Call): Step | null | 'begin' | 'stop' | 'ignore' => {
    const a = c.args;
    const id = newId('st');
    switch (c.method) {
      case 'begin': {
        const h = num(a[0]);
        if (h == null || a.length !== 1) return null;
        startHeading = wrapDeg(h);
        return 'begin';
      }
      case 'stop':
        return a.length ? null : 'stop';
      case 'showInit':
      case 'registerCommand':
      case 'onLoop':
        return 'ignore';
      case 'drive': {
        const [dir, power, ms] = [num(a[0]), num(a[1]), num(a[2])];
        if (dir == null || power == null || ms == null || a.length !== 3) return null;
        return { id, kind: 'drive', dirDeg: wrapDeg(dir), power, ms };
      }
      case 'turnTo': {
        const [heading, power] = [num(a[0]), num(a[1])];
        if (heading == null || power == null || a.length !== 2) return null;
        return { id, kind: 'turn', heading: wrapDeg(heading), power };
      }
      case 'pushWall': {
        const [f, power, ms, align] = [face(a[0]), num(a[1]), num(a[2]), bool(a[3])];
        if (!f || power == null || ms == null || align == null || a.length !== 4) return null;
        return { id, kind: 'wall', face: f, power, ms, alignHeading: align };
      }
      case 'waitMs': {
        const ms = num(a[0]);
        return ms == null || a.length !== 1 ? null : { id, kind: 'wait', ms };
      }
      case 'servo': {
        const pos = num(a[1]);
        const m = a.length === 2 && pos != null ? mechanism(a[0], 'servo') : null;
        return m && pos != null ? { id, kind: 'servo', mechanismId: m.id, position: pos } : null;
      }
      case 'motor':
      case 'startMotor': {
        const [power, ms] = [num(a[1]), num(a[2])];
        const m = a.length === 3 && power != null && ms != null ? mechanism(a[0], 'motor') : null;
        return m && power != null && ms != null ? { id, kind: 'motor', mechanismId: m.id, power, ms, background: c.method === 'startMotor' } : null;
      }
      case 'command': {
        const [name, ms] = [javaStr(a[0]), num(a[1])];
        if (!name || ms == null || a.length !== 2) return null;
        command(name);
        return { id, kind: 'command', name, ms, background: false, stopCommand: '' };
      }
      case 'startCommand': {
        const [name, ms, stopCommand] = [javaStr(a[0]), num(a[1]), javaStr(a[2])];
        if (!name || ms == null || stopCommand == null || a.length !== 3) return null;
        command(name);
        command(stopCommand);
        return { id, kind: 'command', name, ms, background: true, stopCommand };
      }
      default:
        return null;
    }
  };

  let stopped = false;
  for (const s of all.slice(first)) {
    if (stopped) break;
    const calls = chain(s.text, runner);
    if (calls) {
      for (const c of calls) {
        const r = toStep(c);
        if (r === 'stop') {
          stopped = true;
          break;
        }
        if (r === 'begin' || r === 'ignore') continue;
        const step = r ? sanitizeStep(r) : null;
        if (step) steps.push(step);
        else skipped.push({ line: s.line, text: `${runner}.${c.method}(${c.args.join(', ')})` });
      }
      continue;
    }
    const sleep = /^sleep\s*\(([^)]*)\)$/.exec(s.text);
    const ms = sleep ? num(sleep[1]) : null;
    if (ms != null) {
      steps.push({ id: newId('st'), kind: 'wait', ms: Math.round(Math.max(0, Math.min(30000, ms))) });
      continue;
    }
    if (QUIET.test(s.text)) continue;
    skipped.push({ line: s.line, text: s.text });
  }

  return { ok: true, auto: { name: autoName(src), startHeading, steps, newMechanisms, newCommands, skipped } };
}
