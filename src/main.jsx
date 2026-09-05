import React, { Suspense, lazy, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import ErrorBoundary from './studio/ErrorBoundary';
const Studio = lazy(() => import('./studio/Studio'));
const InfoPage = lazy(() => import('./studio/InfoPage'));

function Application() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const navigate = () => setHash(location.hash);
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  const info = hash.match(/^#\/(privacy|terms|contact|legacy)(?:[/?]|$)/)?.[1];
  return (
    <Suspense
      fallback={
        <p role="status" style={{ padding: 40, fontFamily: 'sans-serif' }}>
          Opening EduTool…
        </p>
      }
    >
      {info ? <InfoPage page={info} /> : <Studio />}
    </Suspense>
  );
}
const container = document.getElementById('root');
if (!container) throw new Error('Missing application root.');
container._reactRoot ??= ReactDOM.createRoot(container);
container._reactRoot.render(
  <React.StrictMode>
    <ErrorBoundary>
      <Application />
    </ErrorBoundary>
  </React.StrictMode>,
);
