/** The app's side of the splash screen.
 *
 * The splash itself is written into index.html and driven by public/splash.js
 * so that it is on screen before any of this bundle exists -- read the
 * comments in those two files for why. All this side does is tell it what is
 * happening and, eventually, that the app is ready to be looked at.
 *
 * Every call is a no-op when the splash is not there (the unit tests, and any
 * later launch of the page without it), so callers never have to check.
 */

interface SplashHandle {
  ready(): void;
  note(text: string): void;
}

function handle(): SplashHandle | undefined {
  return (globalThis as { sojournerSplash?: SplashHandle }).sojournerSplash;
}

/** Say what the app is waiting on, in words the reader can make sense of. */
export function splashNote(text: string): void {
  handle()?.note(text);
}

/** The app has what it needs to draw itself; the splash may go. */
export function splashReady(): void {
  handle()?.ready();
}
