/**
 * Vitest setup file.
 *
 * Node.js 22+ defines its own `localStorage`/`sessionStorage` globals (behind
 * --localstorage-file), which prevents vitest from overwriting them with the
 * jsdom equivalents.  We patch them here so every test in the jsdom environment
 * gets the real jsdom-backed Storage object.
 */

const jsdomWindow = (global as unknown as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  Object.defineProperty(global, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: jsdomWindow.localStorage,
    writable: true,
  });
  Object.defineProperty(global, 'sessionStorage', {
    configurable: true,
    enumerable: true,
    value: jsdomWindow.sessionStorage,
    writable: true,
  });
}
