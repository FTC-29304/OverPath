import { useEffect } from 'react';
import { useT } from '../i18n';
import { TOAST_MS, useToasts, type Toast } from '../store/toasts';

function ToastItem({ t: item }: { t: Toast }) {
  const t = useT();
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), TOAST_MS[item.kind]);
    return () => clearTimeout(timer);
  }, [item.id, item.kind, dismiss]);
  return (
    <div className={`toast ${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'} data-testid="toast">
      <span>{item.text}</span>
      {item.action && (
        <button
          className="small"
          onClick={() => {
            item.action!.run();
            dismiss(item.id);
          }}
          data-testid="toast-action"
        >
          {item.action.label}
        </button>
      )}
      <button className="icon" onClick={() => dismiss(item.id)} aria-label={t('toast.close')}>
        ✕
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => (
        <ToastItem key={x.id} t={x} />
      ))}
    </div>
  );
}
