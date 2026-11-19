import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { prefetchParts } from './lazyLoad';
import './styles.css';

export function startOverPath(rootElement: HTMLElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
  if (import.meta.env.PROD) setTimeout(prefetchParts, 3000);
}
