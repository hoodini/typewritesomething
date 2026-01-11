/**
 *
 * Inspired by a girl, Ms. Jayme Bergman
 *
 */
import App from './App';
import isDebugMode from './helpers/isDebugMode';
import './tracking/analytics';

const splash = document.getElementById('splash')!;
let appStarted = false;

const startApp = (e?: Event): void => {
  // Prevent starting twice
  if (appStarted) return;

  // Check for meta keys on keyboard events
  if (e && 'altKey' in e) {
    const keyEvent = e as KeyboardEvent;
    if (keyEvent.altKey || keyEvent.ctrlKey || keyEvent.metaKey) {
      return;
    }
  }

  appStarted = true;
  splash.classList.add('hide');

  // Remove all event listeners
  splash.removeEventListener('click', startApp);
  splash.removeEventListener('touchstart', startApp);
  splash.removeEventListener('touchend', startApp);
  splash.removeEventListener('keydown', startApp);
  splash.removeEventListener('keyup', startApp);
  document.removeEventListener('keydown', startApp);
  document.removeEventListener('click', startApp);

  try {
    const app = new App();
    app.start();
    app.focusText();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start app:', error);
    appStarted = false;
  }
};

const onload = (): void => {
  if (window.location.hash) {
    window.location.hash = '';
  }

  // Make splash focusable and focus it
  splash.setAttribute('tabindex', '0');
  splash.focus();

  // Multiple event listeners for comprehensive support
  splash.addEventListener('click', startApp);
  splash.addEventListener('touchstart', startApp);
  splash.addEventListener('touchend', startApp);
  splash.addEventListener('keydown', startApp);
  splash.addEventListener('keyup', startApp);

  // Document-level listeners as fallback
  document.addEventListener('keydown', startApp);
  document.addEventListener('click', startApp);

  window.removeEventListener('load', onload);
};

/**
 * basic app handlers
 */
window.addEventListener('load', onload);

// Register service worker to control making site work offline
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      if (reg.installing) {
        // eslint-disable-next-line no-console
        console.log('Service worker installing');
      } else if (reg.waiting) {
        // eslint-disable-next-line no-console
        console.log('Service worker installed');
      } else if (reg.active) {
        // eslint-disable-next-line no-console
        console.log('Service worker active');
      }
    })
    .catch((e): void => {
      // eslint-disable-next-line no-console
      console.error('Service Worker failed');
      // eslint-disable-next-line no-console
      console.error(e);
    });
}

// TODO: add unit tests for debug mode
// Mostly just debugs CSS for text-input
if (isDebugMode()) {
  document.body.classList.add('debug');
}
