import { beforeEach, describe, expect, it } from 'vitest';
import { usePlanner } from '../store/plannerStore';
import { blankStep } from '../model/defaults';

const st = () => usePlanner.getState();
const active = () => st().autos.find((a) => a.id === st().activeId)!;

describe('store', () => {
  beforeEach(() => {
    st().restore({ autos: [{ id: 'a', name: 'RedAuto', start: { x: 63, y: 0, heading: 180 }, steps: [] }] });
    usePlanner.setState({ past: [], future: [] });
  });

  it('adds, edits, moves and removes steps with undo/redo', () => {
    st().insertStep(blankStep('drive', 0.5));
    st().insertStep(blankStep('wait', 0.5));
    const [d, w] = active().steps;
    st().updateStep(d.id, { ms: 900 });
    st().moveStep(w.id, -1);
    expect(active().steps.map((s) => s.kind)).toEqual(['wait', 'drive']);
    expect(active().steps[1]).toMatchObject({ ms: 900 });
    st().undo();
    expect(active().steps.map((s) => s.kind)).toEqual(['drive', 'wait']);
    st().undo();
    expect(active().steps[0]).toMatchObject({ ms: 500 });
    st().redo();
    expect(active().steps[0]).toMatchObject({ ms: 900 });
    st().removeStep(d.id);
    expect(active().steps.map((s) => s.kind)).toEqual(['wait']);
  });

  it('updateStep never changes the kind or id', () => {
    st().insertStep(blankStep('drive', 0.5));
    const id = active().steps[0].id;
    st().updateStep(id, { kind: 'wait', id: 'x' } as never);
    expect(active().steps[0]).toMatchObject({ id, kind: 'drive' });
  });

  it('mirror and duplicate make new autos and select them', () => {
    st().mirrorActive();
    expect(active().name).toBe('BlueAuto');
    expect(active().start).toEqual({ x: -63, y: 0, heading: 0 });
    st().duplicateAuto();
    expect(st().autos.length).toBe(3);
    st().deleteAuto();
    expect(st().autos.length).toBe(2);
  });

  it('restore rejects files that are not backups', () => {
    expect(st().restore({ hello: 1 })).toBe(false);
    expect(st().restore('nope')).toBe(false);
  });
});
