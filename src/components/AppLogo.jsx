import React, { useEffect, useState } from 'react';

function getLogoSrc(isDark) {
  return `${import.meta.env.BASE_URL}${isDark ? 'CMlogo-dark.png' : 'CMlogo.png'}`;
}

function documentPrefersDark() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

export default function AppLogo({ className = '', alt = 'EduTool.dev' }) {
  const [isDark, setIsDark] = useState(documentPrefersDark);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains('dark'));

    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return <img src={getLogoSrc(isDark)} alt={alt} className={className} />;
}
