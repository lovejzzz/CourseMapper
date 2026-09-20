/** Account-owned caches never adopt unowned legacy browser data implicitly. */
let activeUid = null;

export function setAccountStorageUser(uid) {
  activeUid = uid || null;
}

export function accountStorageKey(base, uid = activeUid) {
  return uid ? `${base}:account:${encodeURIComponent(uid)}` : base;
}

// Notify mounted editors when their own sign-in merge has finished.
export function notifyAccountCacheChanged(base, uid) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('coursemapper-account-cache', { detail: { key: accountStorageKey(base, uid) } }),
    );
  }
}

export function subscribeAccountCache(base, uid, listener) {
  const key = accountStorageKey(base, uid);
  const onChange = (event) => {
    if (event.detail?.key === key) listener();
  };
  window.addEventListener('coursemapper-account-cache', onChange);
  return () => window.removeEventListener('coursemapper-account-cache', onChange);
}
