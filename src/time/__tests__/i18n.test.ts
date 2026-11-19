import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { tr } from '../i18n/tr';
import { translate } from '../i18n/translate';

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
  it('Turkish has exactly the English keys', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
  });
  it('no empty strings and the same placeholders', () => {
    const empty = (Object.keys(en) as (keyof typeof en)[]).filter((k) => !tr[k].trim());
    const mismatch = (Object.keys(en) as (keyof typeof en)[]).filter((k) => params(tr[k]).join() !== params(en[k]).join());
    expect(empty).toEqual([]);
    expect(mismatch).toEqual([]);
  });
  it('fills placeholders', () => {
    expect(translate('en', 'steps.total', { s: '12.3' })).toBe('Total 12.3 s / 30 s');
    expect(translate('tr', 'steps.total', { s: '12.3' })).toBe('Toplam 12.3 sn / 30 sn');
  });
});
