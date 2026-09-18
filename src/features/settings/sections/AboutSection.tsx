import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Download, Globe, Mail, RefreshCw } from "lucide-react";
import { api } from "../../../api/client";
import type { UpdateCheck } from "../../../api/types";
import { Button } from "../../../components/ui/Button";

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

/** The running version, and the one control in this app that reaches the
 * network.
 *
 * A button and deliberately not a check at launch: the paragraph below
 * promises this app makes no network request of its own accord, and that stays
 * literally true only while nothing here runs unasked. Nothing is downloaded
 * or installed either -- the reader is handed a link and does the rest, which
 * is the whole of the update story (see `crate::update`). */
function Updates({ version }: { version: string | null }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function check() {
    setChecking(true);
    setFailed(null);
    setResult(null);
    try {
      setResult(await api.checkForUpdate());
    } catch (e) {
      setFailed(String(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">
          Version <span className="font-medium text-ink">{version ?? "—"}</span>
        </p>
        <Button icon={RefreshCw} onClick={check} disabled={checking}>
          {checking ? "Checking…" : "Check for updates"}
        </Button>
      </div>

      <div aria-live="polite">
        {result?.update_available && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-sm text-ink-2">
              <span className="font-medium text-ink">Version {result.latest}</span> is available.
            </p>
            <Button variant="primary" icon={Download} onClick={() => openUrl(result.url).catch(() => {})}>
              Open download page
            </Button>
          </div>
        )}

        {result && !result.update_available && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-3">
            <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            {result.latest
              ? "You are running the latest version."
              : "No releases have been published yet."}
          </p>
        )}

        {failed && (
          <div className="mt-2">
            <p className="text-sm text-danger">Could not reach GitHub.</p>
            <p className="mt-0.5 text-xs text-ink-4">{failed}</p>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-4">
        Asks GitHub for the latest version number, and nothing else. Nothing about you is sent, and
        nothing installs itself — you download the installer and run it when you choose.
      </p>
    </div>
  );
}

/** Where the app comes from, and how to write back about it.
 *
 * Both are hand-offs, not requests: the website goes to the system browser and
 * the address to whatever handles mail here, so the promise above -- that this
 * app makes no network request of its own accord -- still holds. The running
 * version rides along in the subject line, since the first thing any report
 * needs is which build it came from. */
function Contact({ version }: { version: string | null }) {
  const subject = `Sojourner feedback${version ? ` (version ${version})` : ""}`;
  const mail = `mailto:sojourner@gentleking.org?subject=${encodeURIComponent(subject)}`;

  return (
    <div className="mb-6 rounded-lg border border-line bg-surface-2 p-3">
      <dl className="space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
          <dt className="sr-only">Ministry website</dt>
          <dd className="min-w-0 text-ink-2">
            <ExternalLink href="https://gentleking.org">gentleking.org</ExternalLink>
            <span className="text-ink-3"> — the ministry behind Sojourner.</span>
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
          <dt className="sr-only">Feedback</dt>
          <dd className="min-w-0 break-words text-ink-2">
            <ExternalLink href={mail}>sojourner@gentleking.org</ExternalLink>
            <span className="text-ink-3"> — questions, corrections, and what you would like to see next.</span>
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-ink-4">
        Both open outside the app — the site in your browser, the address in your mail program. Nothing is
        sent from here, and nothing about you goes with them.
      </p>
    </div>
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
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    api.appVersion().then(setVersion).catch(() => {});
  }, []);

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

      <Updates version={version} />
      <Contact version={version} />

      <div className="space-y-4 text-sm leading-relaxed text-ink-2">
        <p>
          A private, offline study companion for reading Scripture alongside the historic commentaries, confessions, and reference works of the church,
          built for the sojourner making their way through this world toward the next (1 Peter 2:11; Hebrews 11:13).
        </p>
        <p>
          Everything lives in one file on this device. There is no account, no sync service, and no network request this app makes of its own accord —
          the update check above is the only one it can make, and only when you press it.
          Your notes, highlights, and prayers stay yours. Back up or export any time from Settings → Data &amp; backups.
        </p>
        <p>
          Included are multiple Bible translations, classic commentaries (Matthew Henry, Jamieson-Fausset-Brown, Spurgeon's Treasury of David, and others),
          the Westminster Standards, Strong's lexicon with interlinear Hebrew and Greek, a Bible dictionary and encyclopedia, an atlas of the biblical world,
          two harmonies of the Gospels, reading plans, and tools for prayer and Scripture memory.
        </p>
        <p>
          The library of Puritan and Reformed works is a separate download, so the app itself stays small. Install it from Settings → Book library; nothing is
          fetched from here.
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
        <Source name="Greek New Testament — text, parsing, and Strong's tagging">
          The Translators Amalgamated Greek New Testament and the Translators Brief Lexicon of Extended Strong's for Greek, © Tyndale House Cambridge, used
          under a{" "}
          <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0</ExternalLink> licence, from{" "}
          <ExternalLink href="https://github.com/STEPBible/STEPBible-Data">STEPBible.org</ExternalLink>. The interlinear pane shows its Textus Receptus
          wordstream — the Greek behind the King James Version, and the text Strong numbered — so each word's Strong's number is the one that edition prints,
          not one this app inferred.
        </Source>
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
