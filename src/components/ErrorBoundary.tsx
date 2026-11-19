import { Component, type ErrorInfo, type ReactNode } from 'react';
import { defaultLang, translate, type Lang, type MsgKey } from '../i18n/translate';
import { STORE_KEY } from '../store/storageKey';
import { downloadText } from './files';

function savedLang(): Lang {
  try {
    const l = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null')?.state?.view?.language;
    return l === 'tr' || l === 'en' ? l : defaultLang();
  } catch {
    return defaultLang();
  }
}

export function downloadSavedData(): boolean {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  downloadText(`overpath-saved-${new Date().toISOString().slice(0, 10)}.json`, raw, 'application/json');
  return true;
}

interface State {
  error: Error | null;
  armed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, armed: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('OverPath crashed:', error, info.componentStack);
  }

  render() {
    const { error, armed } = this.state;
    if (!error) return this.props.children;
    const lang = savedLang();
    const t = (k: MsgKey) => translate(lang, k);
    const reset = () => {
      if (!armed) return this.setState({ armed: true });
      try {
        localStorage.removeItem(STORE_KEY);
      } catch {
      }
      location.reload();
    };
    return (
      <div className="crash" role="alert" lang={lang} data-testid="crash">
        <div className="crash-card">
          <h1>{t('crash.title')}</h1>
          <p>{t('crash.body')}</p>
          <div className="crash-actions">
            <button className="primary" onClick={() => location.reload()}>
              {t('crash.reload')}
            </button>
            <button onClick={downloadSavedData} data-testid="crash-download">
              {t('crash.download')}
            </button>
            <button className="danger" onClick={reset} data-testid="crash-reset">
              {armed ? t('crash.resetConfirm') : t('crash.reset')}
            </button>
          </div>
          <p className="hint">{t('crash.hint')}</p>
          <details>
            <summary>{t('crash.details')}</summary>
            <pre className="mono">{String(error.stack ?? error.message)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
