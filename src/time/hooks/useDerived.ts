import { useMemo } from 'react';
import { checkAuto, type RuleReport } from '../rules/biobuzz';
import { simulate } from '../sim/simulate';
import { useActiveAuto, usePlanner } from '../store/plannerStore';
import type { Auto, SimResult } from '../model/types';

export function useDerived(): { auto: Auto; sim: SimResult; rules: RuleReport } {
  const auto = useActiveAuto();
  const cal = usePlanner((s) => s.calibration);
  const hw = usePlanner((s) => s.hw);
  const view = usePlanner((s) => s.view);
  const sim = useMemo(() => simulate(auto, cal, hw, view), [auto, cal, hw, view]);
  const rules = useMemo(() => checkAuto(auto, sim, view), [auto, sim, view]);
  return { auto, sim, rules };
}
