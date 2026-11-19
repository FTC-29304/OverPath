import { en, type MsgKey } from './en';
import { tr } from './tr';

export type { MsgKey };
export type Lang = 'en' | 'tr';

export interface Msg {
  key: MsgKey;
  params?: Record<string, Param>;
}
export type Param = string | number | Msg;

export function msg(key: MsgKey, params?: Record<string, Param>): Msg {
  return params ? { key, params } : { key };
}

const DICTS: Record<Lang, Record<MsgKey, string>> = { en, tr };

export function translate(lang: Lang, key: MsgKey, params?: Record<string, Param>): string {
  const text = DICTS[lang][key] ?? en[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const p = params[name];
    if (p === undefined) return whole;
    return typeof p === 'object' ? translate(lang, p.key, p.params) : String(p);
  });
}

export function defaultLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  return nav?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
