/**
 * Notify the user when generation completes, especially if they're on another tab.
 * Uses the Notification API (with permission request) and title flashing.
 */

let titleInterval = null;

export function notifyDone(message = 'Course map is ready!') {
  // 1. Browser Notification (if tab is not focused)
  if (document.hidden) {
    if (Notification.permission === 'granted') {
      new Notification('Course Mapper', { body: message, icon: '/favicon.ico' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          new Notification('Course Mapper', { body: message, icon: '/favicon.ico' });
        }
      });
    }
  }

  // 2. Flash the document title
  const originalTitle = document.title;
  let flash = true;
  clearInterval(titleInterval);
  titleInterval = setInterval(() => {
    document.title = flash ? `✅ ${message}` : originalTitle;
    flash = !flash;
  }, 1000);

  // Stop flashing when tab becomes visible
  const stopFlash = () => {
    if (!document.hidden) {
      clearInterval(titleInterval);
      titleInterval = null;
      document.title = originalTitle;
      document.removeEventListener('visibilitychange', stopFlash);
    }
  };
  document.addEventListener('visibilitychange', stopFlash);

  // Auto-stop after 30 seconds
  setTimeout(() => {
    clearInterval(titleInterval);
    titleInterval = null;
    document.title = originalTitle;
    document.removeEventListener('visibilitychange', stopFlash);
  }, 30000);
}

/** Request notification permission early (call on app load). */
export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
