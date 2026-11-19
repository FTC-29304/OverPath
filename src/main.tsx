import { readMode } from './shared/plannerMode';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

const rootElement = document.getElementById('root')!;

if (readMode() === 'time') {
  void import('./time/startOverTime').then((module) => module.startOverTime(rootElement));
} else {
  void import('./startOverPath').then((module) => module.startOverPath(rootElement));
}
