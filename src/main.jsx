import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import FaqChatbot from './pages/FaqChatbot';
import Changelog from './pages/Changelog';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { CourseStoreProvider } from './model/courseStore';
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CourseStoreProvider>
      <Router />
    </CourseStoreProvider>
  </React.StrictMode>
);
