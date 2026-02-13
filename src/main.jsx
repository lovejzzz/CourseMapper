import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import FaqChatbot from './pages/FaqChatbot';
import './index.css';

function Router() {
  const [page, setPage] = useState(() => window.location.hash === '#/faq' ? 'faq' : 'app');

  useEffect(() => {
    const onHash = () => setPage(window.location.hash === '#/faq' ? 'faq' : 'app');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <div style={{ display: page === 'app' ? 'block' : 'none' }}><App /></div>
      {page === 'faq' && <FaqChatbot />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
