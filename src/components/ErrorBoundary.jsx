import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass rounded-squircle shadow-glass p-7 my-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-squircle-xs bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-700 mb-1">Something went wrong</h3>
              <p className="text-xs text-red-500/80 mb-3">
                {this.state.error?.message || 'An unexpected error occurred while rendering this section.'}
              </p>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="tactile px-4 py-2 rounded-squircle-xs text-xs font-semibold text-white bg-gradient-to-r from-red-500 to-rose-600 shadow-sm hover:brightness-110 transition-all duration-200"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
