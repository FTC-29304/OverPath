import { afterEach, describe, expect, it } from 'vitest';
import { STORE_KEY } from '../store/storageKey';
import { watchOtherTabs } from '../store/tabSync';

const g = globalThis as unknown as { window?: EventTarget };
const tick = () => new Promise((r) => setTimeout(r, 0));

function storageEvent(key: string, newValue: string | null, oldValue: string | null = 'old') {
  return Object.assign(new Event('storage'), { key, newValue, oldValue });
}

describe('two tabs', () => {
  afterEach(() => {
    delete g.window;
  });

  it('reloads on every change another tab saves, tells the user once, and stops when asked', async () => {
    g.window = new EventTarget();
    let reloads = 0;
    let told = 0;
    const stop = watchOtherTabs(
      () => reloads++,
      () => told++,
    );
    g.window.dispatchEvent(storageEvent('something-else', 'x'));
    g.window.dispatchEvent(storageEvent(STORE_KEY, null));
    g.window.dispatchEvent(storageEvent(STORE_KEY, 'same', 'same'));
    expect(reloads).toBe(0);
    g.window.dispatchEvent(storageEvent(STORE_KEY, 'a'));
    g.window.dispatchEvent(storageEvent(STORE_KEY, 'b'));
    await tick();
    expect(reloads).toBe(2);
    expect(told).toBe(1);
    stop();
    g.window.dispatchEvent(storageEvent(STORE_KEY, 'c'));
    expect(reloads).toBe(2);
  });

  it('a runaway burst stops syncing instead of looping forever', async () => {
    g.window = new EventTarget();
    let reloads = 0;
    watchOtherTabs(
      () => reloads++,
      () => {},
    );
    for (let i = 0; i < 100; i++) g.window.dispatchEvent(storageEvent(STORE_KEY, `v${i}`));
    await tick();
    expect(reloads).toBe(20);
  });
});
