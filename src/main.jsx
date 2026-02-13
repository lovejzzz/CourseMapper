import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import FaqChatbot from './pages/FaqChatbot';
import Changelog from './pages/Changelog';
import './index.css';

function Router() {
  const getPage = () => {
    const h = window.location.hash;
    if (h === '#/faq') return 'faq';
    if (h === '#/changelog') return 'changelog';
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
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
