import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function EmailSignInButton({ reauthenticate = false, className = '', labelOverride = '' }) {
  const { user, loading, signInWithEmail, reauthenticateWithEmail } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef(null);
  const form = useRef(null);
  const trigger = useRef(null);
  const label = labelOverride || (reauthenticate ? 'Sign in again with email' : 'Email sign-in');
  useEffect(() => {
    if (!open) return;
    const current = dialog.current;
    current?.showModal();
    return () => current?.close();
  }, [open]);
  function close() {
    form.current?.reset();
    setOpen(false);
    setMessage('');
    trigger.current?.focus();
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    const fields = new FormData(event.currentTarget);
    try {
      const ok = reauthenticate
        ? await reauthenticateWithEmail(fields.get('password'))
        : await signInWithEmail(fields.get('email'), fields.get('password'));
      if (ok) close();
      else setMessage('Sign-in failed. Check your email and password and try again.');
    } catch {
      setMessage('Sign-in failed. Please try again.');
    } finally {
      fields.delete('password');
      const passwordInput = form.current?.querySelector('input[name="password"]');
      if (passwordInput) passwordInput.value = '';
      setBusy(false);
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={loading}
        onClick={() => setOpen(true)}
        className={
          className || 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40'
        }
      >
        {label}
      </button>
      {open && (
        <dialog
          ref={dialog}
          aria-label={label}
          className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/40"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) close();
          }}
        >
          <form ref={form} onSubmit={submit} className="space-y-4">
            <h2 className="text-lg font-semibold">{label}</h2>
            <p className="text-sm">
              Use your EduTool email account. Your Google and AI connection passwords may be different.
            </p>
            <label className="block">
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                readOnly={reauthenticate}
                defaultValue={reauthenticate ? user?.email : ''}
                className="mt-1 block w-full rounded border border-slate-300 p-2"
              />
            </label>
            <label className="block">
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1 block w-full rounded border border-slate-300 p-2"
              />
            </label>
            {message && (
              <p role="alert" className="text-sm text-red-700">
                {message}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" disabled={busy} onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-40"
              >
                {busy ? 'Signing in…' : 'Continue'}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
