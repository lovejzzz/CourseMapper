import React from 'react';

const CHUNK_RELOAD_PREFIX = 'coursemapper:chunk-reload:';

export function isChunkLoadError(error) {
  const message = String(error?.message || error || '');
  return /failed to fetch dynamically imported module|loading chunk \d+ failed|importing a module script failed|error loading dynamically imported module|chunkloaderror/i.test(
    message,
  );
}

function getChunkReloadKey() {
  if (typeof window === 'undefined') return CHUNK_RELOAD_PREFIX;
  return `${CHUNK_RELOAD_PREFIX}${window.location.origin}${window.location.pathname}${window.location.hash}`;
}

function hasTriedChunkReload() {
  if (typeof window === 'undefined') return true;
  try {
    return window.sessionStorage.getItem(getChunkReloadKey()) === '1';
  } catch {
    return true;
  }
}

function markChunkReloadTried() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getChunkReloadKey(), '1');
  } catch {
    /* best effort */
  }
}

function clearChunkReloadTried() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(getChunkReloadKey());
  } catch {
    /* best effort */
  }
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, recoveringFromChunkError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
    if (isChunkLoadError(error) && typeof window !== 'undefined' && !hasTriedChunkReload()) {
      markChunkReloadTried();
      this.setState({ recoveringFromChunkError: true });
      window.setTimeout(() => {
        window.location.reload();
      }, 250);
    }
  }

  handleRetry = () => {
    if (isChunkLoadError(this.state.error) && typeof window !== 'undefined') {
      clearChunkReloadTried();
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null, recoveringFromChunkError: false });
  };

  render() {
    if (this.state.hasError) {
      const isChunkError = isChunkLoadError(this.state.error);
      return (
        <div className="glass rounded-squircle shadow-glass p-7 my-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-squircle-xs flex items-center justify-center flex-shrink-0 ${
                isChunkError ? 'bg-blue-100' : 'bg-red-100'
              }`}
            >
              <svg
                className={`w-5 h-5 ${isChunkError ? 'text-blue-600' : 'text-red-500'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className={`text-sm font-semibold mb-1 ${isChunkError ? 'text-blue-800' : 'text-red-700'}`}>
                {isChunkError ? 'Updating EduTool' : 'Something went wrong'}
              </h3>
              <p className={`text-xs mb-3 ${isChunkError ? 'text-blue-700/80' : 'text-red-500/80'}`}>
                {isChunkError
                  ? this.state.recoveringFromChunkError
                    ? 'A newer version is ready. Your course brief is saved; reloading once.'
                    : 'The app could not load a newer bundle. Refresh the page to continue.'
                  : this.state.error?.message || 'An unexpected error occurred while rendering this section.'}
              </p>
              <button
                onClick={this.handleRetry}
                className={`tactile px-4 py-2 rounded-squircle-xs text-xs font-semibold text-white shadow-sm hover:brightness-110 transition-all duration-200 ${
                  isChunkError ? 'bg-blue-600' : 'bg-gradient-to-r from-red-500 to-rose-600'
                }`}
              >
                {isChunkError ? 'Refresh' : 'Try Again'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
