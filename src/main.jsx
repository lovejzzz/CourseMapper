import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// FaqChatbot removed — merged into ChatPanel
import Changelog from './pages/Changelog';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { CourseStoreProvider } from './model/courseStore';
import { AuthProvider } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

function Router() {
  const getPage = () => {
    const h = window.location.hash;
    if (h === '#/faq') { window.location.hash = '#/'; return 'app'; } // redirect old bookmarks
    if (h === '#/changelog') return 'changelog';
    if (h === '#/privacy') return 'privacy';
    if (h === '#/terms') return 'terms';
    return 'app';
  };
  const [page, setPage] = useState(getPage);

  useEffect(() => {
    const onHash = () => setPage(getPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <div style={{ display: page === 'app' ? 'block' : 'none' }}><App /></div>
      {page === 'changelog' && <Changelog />}
      {page === 'privacy' && <PrivacyPolicy />}
      {page === 'terms' && <TermsOfService />}
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
      <CourseStoreProvider>
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
      </CourseStoreProvider>
    </AuthProvider>
  </React.StrictMode>
);
