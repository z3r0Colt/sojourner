import { openUrl } from "@tauri-apps/plugin-opener";

/** An external link. `target="_blank"` inside a webview can navigate the app
 * window itself out of the app, so hand the URL to the system browser (the
 * same route NoteBody takes for links in a note). */
function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        openUrl(href).catch(() => {});
      }}
      className="text-accent hover:underline"
    >
      {children}
    </a>
  );
}

/** One credited source: what it is, and on what terms it is here. */
function Source({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 font-medium text-ink sm:w-64">{name}</dt>
      <dd className="min-w-0 flex-1 leading-relaxed text-ink-3">{children}</dd>
    </div>
  );
}

export function AboutSection() {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">About</h2>
      <div className="mb-6 flex items-center gap-3">
        <span className="brand-mark h-10 w-10 shrink-0" aria-hidden="true" />
        <p className="text-sm leading-tight text-ink-3">
          <span className="block font-semibold text-ink">Sojourner</span>
          Bible Study Companion
        </p>
      </div>

      <div className="space-y-4 text-sm leading-relaxed text-ink-2">
        <p>
          A private, offline study companion for reading Scripture alongside the historic commentaries, confessions, and reference works of the church,
          built for the sojourner making their way through this world toward the next (1 Peter 2:11; Hebrews 11:13).
        </p>
        <p>
          Everything lives in one file on this device. There is no account, no sync service, and no network request this app makes of its own accord.
          Your notes, highlights, and prayers stay yours. Back up or export any time from Settings → Data &amp; backups.
        </p>
        <p>
          Included are multiple Bible translations, classic commentaries (Matthew Henry, Jamieson-Fausset-Brown, Spurgeon's Treasury of David, and others),
          the Westminster Standards, Strong's lexicon with interlinear Hebrew and Greek, a Bible dictionary and encyclopedia, an atlas of the biblical world,
          two harmonies of the Gospels, reading plans, and tools for prayer and Scripture memory.
        </p>
      </div>

      <h2 className="mb-1 mt-8 text-lg font-semibold text-ink">Sources and licences</h2>
      <p className="mb-4 text-sm text-ink-3">
        Everything here is either in the public domain or used under a licence that asks only to be credited.
      </p>
      <dl className="divide-y divide-line text-sm">
        <Source name="Bible translations, commentaries, and confessions">
          The King James Version, the American Standard Version, and the other translations and classic works included here are in the public domain.
        </Source>
        <Source name="Strong's lexicon and Thayer's">Public domain.</Source>
        <Source name="Easton's and Smith's Bible dictionaries">Public domain.</Source>
        <Source name="International Standard Bible Encyclopedia (1915)">
          James Orr, general editor. Public domain. Prepared from the edition distributed by the CrossWire Bible Society.
        </Source>
        <Source name="Harmonies of the Gospels">
          A. T. Robertson, <i>A Harmony of the Gospels for Students of the Life of Christ</i> (1922), based on the Broadus Harmony: public domain. The
          four-column chronological harmony follows the table of contents of Robert M. Sutherland's <i>A Four-Column Parallel and Chronological Harmony of the
          Gospels</i> (2020), whose stated terms permit reproduction with attribution. In both cases the event divisions and their references are reproduced,
          not the verse text those books set in parallel.
        </Source>
        <Source name="Bible atlas — places and region extents">
          Geographic data, and the scholarly estimates of how far each region reached, © OpenBible.info, used under a{" "}
          <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0</ExternalLink>{" "}
          licence. Some underlying data comes from OpenStreetMap contributors, under the Open Database License.
        </Source>
        <Source name="Bible atlas — coastlines and rivers">
          Made with Natural Earth. Free vector and raster map data at naturalearthdata.com. Public domain.
        </Source>
        <Source name="OpenDyslexic">
          Used under the SIL Open Font License; the licence text ships beside the font.
        </Source>
      </dl>

      <blockquote className="mt-8 rounded-lg border border-line bg-surface-2 p-4">
        <p className="reading-font text-base italic leading-relaxed text-ink">
          “The LORD bless thee, and keep thee: the LORD make his face shine upon thee, and be gracious unto thee: the LORD lift up his countenance upon thee, and
          give thee peace.”
        </p>
        <footer className="mt-2 text-xs text-ink-3">Numbers 6:24-26</footer>
      </blockquote>
    </div>
  );
}
