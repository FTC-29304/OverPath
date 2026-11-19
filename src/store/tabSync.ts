import { STORE_KEY } from './storageKey';

const BURST = 20;
const BURST_MS = 2000;
const NOTIFY_EVERY_MS = 4000;

export function watchOtherTabs(reload: () => unknown, onSynced: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let recent: number[] = [];
  let lastNotice = -Infinity;
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORE_KEY || e.newValue === null || e.newValue === e.oldValue) return;
    const now = Date.now();
    recent = recent.filter((t) => now - t < BURST_MS);
    if (recent.length >= BURST) return;
    recent.push(now);
    void Promise.resolve(reload()).then(() => {
      if (now - lastNotice < NOTIFY_EVERY_MS) return;
      lastNotice = now;
      onSynced();
    });
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
