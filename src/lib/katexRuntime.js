export const KATEX_MODULE_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.mjs';
export const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css';
export const HTML2CANVAS_MODULE_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm';

let _katex = null;
let _katexPromise = null;
let _katexStylesheetPromise = null;
let _html2canvas = null;
let _html2canvasPromise = null;

function ensureKatexStylesheet() {
  if (typeof document === 'undefined') return Promise.resolve();
  if (document.querySelector('link[data-katex-runtime="true"]')) return Promise.resolve();
  if (_katexStylesheetPromise) return _katexStylesheetPromise;

  _katexStylesheetPromise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = KATEX_CSS_URL;
    link.crossOrigin = 'anonymous';
    link.setAttribute('data-katex-runtime', 'true');
    link.onload = () => resolve();
    link.onerror = () => {
      _katexStylesheetPromise = null;
      reject(new Error('Failed to load KaTeX stylesheet.'));
    };
    document.head.appendChild(link);
  });

  return _katexStylesheetPromise;
}

export async function loadKatexRuntime() {
  if (_katex) return _katex;
  if (_katexPromise) return _katexPromise;

  _katexPromise = Promise.all([import(/* @vite-ignore */ KATEX_MODULE_URL), ensureKatexStylesheet()])
    .then(([mod]) => {
      _katex = mod.default || mod;
      return _katex;
    })
    .catch((err) => {
      _katexPromise = null;
      throw new Error(
        `Failed to load the math renderer. Check your network connection and try again. ${err?.message || ''}`.trim(),
      );
    });

  return _katexPromise;
}

export async function loadHtml2CanvasRuntime() {
  if (_html2canvas) return _html2canvas;
  if (_html2canvasPromise) return _html2canvasPromise;

  _html2canvasPromise = import(/* @vite-ignore */ HTML2CANVAS_MODULE_URL)
    .then((mod) => {
      _html2canvas = mod.default || mod;
      return _html2canvas;
    })
    .catch((err) => {
      _html2canvasPromise = null;
      throw new Error(
        `Failed to load the math image renderer. Check your network connection and try again. ${err?.message || ''}`.trim(),
      );
    });

  return _html2canvasPromise;
}
