// The provider code never enters a URL on the main course page or persistent browser storage.
export async function connectIdentity({ api, popup, windowObject = window, timeoutMs = 300000 }) {
  if (!popup) throw new Error('Allow the connection popup, then try again.');
  let cleanup = () => {};
  try {
    const { authorizationUrl, state } = await api('connection/start', {});
    const callback = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The connection expired. Start again.')), timeoutMs);
      let closedChecks = 0;
      const closedTimer = setInterval(() => {
        // Allow the callback's queued postMessage to arrive before treating closure as cancellation.
        if (popup.closed && ++closedChecks >= 3) reject(new Error('The identity sign-in was cancelled.'));
      }, 500);
      const onMessage = (event) => {
        if (
          event.origin !== windowObject.location.origin ||
          event.source !== popup ||
          event.data?.type !== 'coursemapper-identity-link' ||
          event.data.state !== state
        )
          return;
        if (event.data.error || !event.data.code) reject(new Error('The identity sign-in was cancelled.'));
        else resolve({ state, code: event.data.code });
      };
      windowObject.addEventListener('message', onMessage);
      cleanup = () => {
        clearTimeout(timer);
        clearInterval(closedTimer);
        windowObject.removeEventListener('message', onMessage);
      };
      popup.location.replace(authorizationUrl);
    });
    return await api('connection/finish', await callback);
  } finally {
    cleanup();
    popup.close();
  }
}
