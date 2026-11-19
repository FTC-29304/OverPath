import { lazy, type ComponentType } from 'react';

const RELOADED = 'overpath-chunk-reload';

export function lazyPart<P extends object>(load: () => Promise<ComponentType<P>>) {
  return lazy<ComponentType<P>>(async () => {
    try {
      const component = await load();
      sessionStorage.removeItem(RELOADED);
      return { default: component };
    } catch (e) {
      if (!sessionStorage.getItem(RELOADED)) {
        sessionStorage.setItem(RELOADED, '1');
        location.reload();
        return new Promise<never>(() => {});
      }
      throw e;
    }
  });
}

export function prefetchParts() {
  void Promise.all([
    import('./components/ExportPanel'),
    import('./components/SettingsModal'),
    import('./codegen/calibration'),
    import('../java/OverPath.java?raw'),
  ]).catch(() => {
  });
}
