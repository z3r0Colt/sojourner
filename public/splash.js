/* The splash screen's clock. Loaded as a classic script from index.html's
 * head, ahead of the app bundle and ahead of the body, so that the timer
 * starts at the first paint rather than after several hundred kilobytes of
 * JavaScript have been fetched and run. The markup and styles it drives are
 * in index.html for the same reason -- see the comment there.
 *
 * Two conditions have to be met before the splash goes:
 *
 *   1. MIN_MS has passed. The splash is a deliberate pause, not only a
 *      progress report; on a warm start the app is ready long before this.
 *   2. The app has said it is ready -- `window.sojournerSplash.ready()`,
 *      called from AppShell once the database has answered with the books
 *      and translations it needs to draw anything.
 *
 * MAX_MS is the backstop. If the app never reports ready -- a failed query,
 * a crash caught by the error boundary, a database that will not open --
 * the splash still leaves, because whatever the app has to show (including
 * its crash screen) is more useful than a loading bar that never finishes.
 *
 * This file is plain ES5-ish JavaScript on purpose: it is copied verbatim
 * out of public/, so nothing compiles or polyfills it.
 */
(function () {
  "use strict";

  /** The splash shows for at least this long. */
  var MIN_MS = 3000;
  /** ...and never for longer than this, ready or not. */
  var MAX_MS = 60000;
  /** How long the fade out runs; must match the transition in index.html. */
  var FADE_MS = 420;

  /* The clock starts here, in the head, before the splash has been parsed --
   * which is the earliest honest answer to "how long has the reader been
   * waiting?" */
  var startedAt = Date.now();
  var appReady = false;
  var leaving = false;
  var note = "Starting Sojourner…";

  /* ------------------------------------------------------------ appearance */

  var prefs = (function () {
    try {
      return JSON.parse(localStorage.getItem("bsa-ui-prefs") || "{}") || {};
    } catch (e) {
      return {};
    }
  })();

  function media(query) {
    return !!(window.matchMedia && window.matchMedia(query).matches);
  }

  /* The app's own theme list, as `uiStore` stores it. Three of the themes are
   * dark; "system" follows the OS. Decided here rather than in a stylesheet
   * because it has to be settled before the splash is painted -- a media
   * query alone would get "system" right and every explicit choice wrong. */
  function splashIsDark() {
    var theme = prefs.theme || "system";
    if (theme === "system") return media("(prefers-color-scheme: dark)");
    return theme === "dark" || theme === "oled" || theme === "contrast-dark";
  }

  document.documentElement.setAttribute("data-splash-theme", splashIsDark() ? "dark" : "light");

  function reduceMotion() {
    if (document.documentElement.getAttribute("data-reduce-motion") === "on") return true;
    if (prefs.reduceMotion) return true;
    return media("(prefers-reduced-motion: reduce)");
  }

  /* ---------------------------------------------------------------- verse */

  /* Text taken verbatim from the King James Version that the app itself
   * ships (bibles/King James Version (1769).xml), so the splash quotes the
   * same words the reader will find when they look the verse up. The one
   * departure: that edition carries the Hebrew letter headings of Psalm 119
   * inside the verse, so 119:105 begins "NUN. Thy word..." -- the heading is
   * dropped here, being a division of the psalm rather than part of the
   * sentence. Public domain. */
  var VERSES = [
    ["Thy word is a lamp unto my feet, and a light unto my path.", "Psalm 119:105"],
    ["Open thou mine eyes, that I may behold wondrous things out of thy law.", "Psalm 119:18"],
    ["I am a stranger in the earth: hide not thy commandments from me.", "Psalm 119:19"],
    ["Thy statutes have been my songs in the house of my pilgrimage.", "Psalm 119:54"],
    ["Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.", "2 Timothy 2:15"],
    ["These were more noble than those in Thessalonica, in that they received the word with all readiness of mind, and searched the scriptures daily, whether those things were so.", "Acts 17:11"],
    ["The entrance of thy words giveth light; it giveth understanding unto the simple.", "Psalm 119:130"],
    ["Let the word of Christ dwell in you richly in all wisdom.", "Colossians 3:16"],
    ["But his delight is in the law of the LORD; and in his law doth he meditate day and night.", "Psalm 1:2"],
    ["Did not our heart burn within us, while he talked with us by the way, and while he opened to us the scriptures?", "Luke 24:32"],
    ["The law of the LORD is perfect, converting the soul: the testimony of the LORD is sure, making wise the simple.", "Psalm 19:7"]
  ];

  /* ------------------------------------------------------------- progress */

  /** Where the bar should sit, 0-1, for a given moment. */
  function progressAt(elapsed) {
    if (appReady && elapsed >= MIN_MS) return 1;
    if (elapsed < MIN_MS) {
      // Most of the bar is simply the minimum wait running down, eased so it
      // moves off the mark promptly and settles as it approaches the hand-off.
      var t = elapsed / MIN_MS;
      return 0.03 + 0.93 * (1 - Math.pow(1 - t, 2));
    }
    // Past the minimum and still waiting on the app: creep toward -- but
    // never reach -- full, so the bar keeps saying "working" without ever
    // claiming to have finished.
    var over = (elapsed - MIN_MS) / 12000;
    return 0.96 + 0.035 * (1 - Math.exp(-over));
  }

  function statusAt(elapsed) {
    if (appReady && elapsed >= MIN_MS) return "Ready";
    if (elapsed > MIN_MS + 1500 && !appReady) return "Still " + note.charAt(0).toLowerCase() + note.slice(1);
    return note;
  }

  /* ------------------------------------------------------------- the loop */

  var splash = null;
  var barEl = null;
  var statusEl = null;
  var lastWidth = -1;
  var lastStatus = "";

  function frame() {
    var elapsed = Date.now() - startedAt;

    var width = Math.round(progressAt(elapsed) * 1000) / 10;
    if (barEl && width !== lastWidth) {
      barEl.style.width = width + "%";
      lastWidth = width;
    }

    var status = statusAt(elapsed);
    if (statusEl && status !== lastStatus) {
      statusEl.textContent = status;
      lastStatus = status;
    }

    if (elapsed >= MAX_MS || (appReady && elapsed >= MIN_MS)) {
      dismiss();
      return;
    }
    window.requestAnimationFrame(frame);
  }

  /** Takes the splash out of the document, and the ground with it, so the
   * app's own background applies again. */
  function teardown() {
    splash.remove();
    document.documentElement.removeAttribute("data-splash-theme");
  }

  function dismiss() {
    if (leaving) return;
    leaving = true;
    if (!splash) return;
    splash.setAttribute("aria-busy", "false");

    // A beat at 100% before the fade, so the bar is seen to finish rather
    // than disappearing mid-stride.
    var hold = reduceMotion() ? 0 : 260;
    window.setTimeout(function () {
      if (reduceMotion()) {
        teardown();
        return;
      }
      splash.setAttribute("data-leaving", "true");
      window.setTimeout(teardown, FADE_MS);
    }, hold);
  }

  /** Wires up the elements once the body has been parsed. */
  function start() {
    splash = document.getElementById("splash");
    if (!splash) return;
    barEl = document.getElementById("splash-bar");
    statusEl = document.getElementById("splash-status");

    var verse = VERSES[Math.floor(Math.random() * VERSES.length)];
    var verseEl = document.getElementById("splash-verse-text");
    var citeEl = document.getElementById("splash-cite");
    if (verseEl) verseEl.textContent = "“" + verse[0] + "”";
    if (citeEl) citeEl.textContent = verse[1] + " · KJV";

    // The app may have finished before the body did -- unlikely, but the
    // loop handles it either way, and `dismiss` is guarded against running
    // twice.
    window.requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  /* ------------------------------------------------------------------ api */

  window.sojournerSplash = {
    /** The app has loaded enough to be shown. */
    ready: function () {
      appReady = true;
    },
    /** Say what is being waited on, in the app's own words. */
    note: function (text) {
      if (typeof text === "string" && text) note = text;
    }
  };
})();
