import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import FaqChatbot from './pages/FaqChatbot';
import Changelog from './pages/Changelog';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { CourseStoreProvider } from './model/courseStore';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

function Router() {
  const getPage = () => {
    const h = window.location.hash;
    if (h === '#/faq') return 'faq';
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
      {page === 'faq' && <FaqChatbot />}
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
        <Router />
      </CourseStoreProvider>
    </AuthProvider>
  </React.StrictMode>
);
