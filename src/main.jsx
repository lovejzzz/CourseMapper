import React, { useState, useEffect, Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// FaqChatbot removed — merged into ChatPanel
const Changelog = lazy(() => import('./pages/Changelog'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const Contact = lazy(() => import('./pages/Contact'));
import { CourseStoreProvider } from './model/courseStore';
import { AuthProvider } from './contexts/AuthContext';
import { AIConfigProvider } from './contexts/AIConfigContext';
import { UIProvider } from './contexts/UIContext';
import { CourseProvider } from './contexts/CourseContext';
import ErrorBoundary from './components/ErrorBoundary';
import { PageSkeleton } from './components/LoadingScreen';
import { getLegacyPathTelemetry } from './lib/legacyPathTelemetry';
import './index.css';

// v0.14.3 WS-C (C1): the Crucible driver reads legacy-branch hit counters
// post-generation via page.evaluate(() => window.__cmLegacyPathTelemetry()).
// Always on — exposes the live function (not a snapshot) so reads see every
// compile that ran before the read.
window.__cmLegacyPathTelemetry = getLegacyPathTelemetry;

function Router() {
  const getPage = () => {
    const h = window.location.hash;
    if (h === '#/faq') {
      window.location.hash = '#/';
      return 'app';
    } // redirect old bookmarks
    if (h === '#/changelog') return 'changelog';
    if (h === '#/privacy') return 'privacy';
    if (h === '#/terms') return 'terms';
    if (h === '#/contact') return 'contact';
    return 'app';
  };
  const [page, setPage] = useState(getPage);

  useEffect(() => {
    const onHash = () => {
      setPage(getPage());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <div style={{ display: page === 'app' ? 'block' : 'none' }}>
        <App />
      </div>
      <Suspense fallback={<PageSkeleton />}>
        {page === 'changelog' && <Changelog />}
        {page === 'privacy' && <PrivacyPolicy />}
        {page === 'terms' && <TermsOfService />}
        {page === 'contact' && <Contact />}
      </Suspense>
    </>
  );
}

// Keep a single root reference so HMR re-renders don't call createRoot twice
// on the same container (which triggers a React warning and can cause DOM errors).
const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element — check index.html');
if (!container._reactRoot) {
  container._reactRoot = ReactDOM.createRoot(container);
}
container._reactRoot.render(
  <React.StrictMode>
    <AuthProvider>
      <AIConfigProvider>
        <UIProvider>
          <CourseProvider>
            <CourseStoreProvider>
              <ErrorBoundary>
                <Router />
              </ErrorBoundary>
            </CourseStoreProvider>
          </CourseProvider>
        </UIProvider>
      </AIConfigProvider>
    </AuthProvider>
  </React.StrictMode>,
);
