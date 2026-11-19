import { useCallback } from 'react';
import { usePlanner } from '../store/plannerStore';
import { translate, type Msg, type MsgKey, type Param } from './translate';

export * from './translate';

export type T = (key: MsgKey | Msg, params?: Record<string, Param>) => string;

export function useT(): T {
  const lang = usePlanner((s) => s.view.language);
  return useCallback<T>(
    (key, params) => (typeof key === 'string' ? translate(lang, key, params) : translate(lang, key.key, key.params)),
    [lang],
  );
}
