import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id'>): number;
  dismiss(id: number): void;
}

let next = 1;
export const TOAST_MS = { info: 6000, error: 9000 } as const;
const MAX = 3;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) => {
    const id = next++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-MAX) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = (text: string, action?: Toast['action']) => useToasts.getState().push({ text, kind: 'info', action });
export const toastError = (text: string) => useToasts.getState().push({ text, kind: 'error' });
