export const MERMAID_MODULE_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11.14.0/+esm';

let _mermaid = null;
let _mermaidPromise = null;

export async function loadMermaidRuntime() {
  if (_mermaid) return _mermaid;
  if (_mermaidPromise) return _mermaidPromise;

  _mermaidPromise = import(/* @vite-ignore */ MERMAID_MODULE_URL)
    .then((mod) => {
      _mermaid = mod.default || mod;
      return _mermaid;
    })
    .catch((err) => {
      _mermaidPromise = null;
      throw new Error(
        `Failed to load the diagram renderer. Check your network connection and try again. ${err?.message || ''}`.trim(),
      );
    });

  return _mermaidPromise;
}
