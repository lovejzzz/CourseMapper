import { Component, type ReactNode } from 'react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main
        role="alert"
        style={{ maxWidth: 560, margin: '12vh auto', padding: 28, fontFamily: 'sans-serif', lineHeight: 1.6 }}
      >
        <h1>This part of EduTool could not open.</h1>
        <p>
          Reload to try again. Courses already saved on this device remain in your browser; recent unsaved edits may
          need to be entered again.
        </p>
        <button style={{ padding: '12px 20px', cursor: 'pointer' }} onClick={() => window.location.reload()}>
          Reload EduTool
        </button>
      </main>
    );
  }
}
