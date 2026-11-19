export type PlannerMode = 'path' | 'time';
export type HandoffLanguage = 'en' | 'tr';

const MODE_KEY = 'ftc-planner-mode';
const LANGUAGE_KEY = 'ftc-planner-mode-language';

export function readMode(): PlannerMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'time' ? 'time' : 'path';
  } catch {
    return 'path';
  }
}

export function switchMode(mode: PlannerMode, language: HandoffLanguage) {
  try {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    return;
  }
  location.reload();
}

export function takeHandoffLanguage(): HandoffLanguage | null {
  try {
    const language = localStorage.getItem(LANGUAGE_KEY);
    localStorage.removeItem(LANGUAGE_KEY);
    return language === 'en' || language === 'tr' ? language : null;
  } catch {
    return null;
  }
}
