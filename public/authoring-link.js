// Send only to the same-origin opener that initiated this one-time connection.
const callback = new URLSearchParams(location.search);
const result = {
  type: 'coursemapper-identity-link',
  state: callback.get('state'),
  code: callback.get('code'),
  error: callback.has('error'),
};
history.replaceState(null, '', location.pathname);
if (window.opener && result.state) {
  window.opener.postMessage(result, location.origin);
  document.getElementById('status').textContent =
    'Return to CourseMapper to see the connection result. You can close this window.';
  window.close();
} else {
  document.getElementById('status').textContent =
    'Start the connection from CourseMapper. This callback cannot be used on its own.';
}
