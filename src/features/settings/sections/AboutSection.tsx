import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { create } from "zustand";
import { Check, Download, Globe, Mail, RefreshCw } from "lucide-react";
import { api } from "../../../api/client";
import { useTranslations } from "../../../api/queries";
import type { UpdateCheck } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { openContent, targetFor } from "../../../workspace/openContent";
import { usePaneOptional } from "../../../workspace/PaneContext";
import { useWorkspaceStore } from "../../../state/workspaceStore";
import { licenceParagraphs } from "./licenceText";
// The notice DataWar's licence asks to go with every copy of its data, as
// the data folder keeps it, so the two cannot drift apart.
import dataWarLicence from "../../../../reference/webster1828/LICENSE-DataWar.txt?raw";

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

/** Every translation that ships with its own terms -- the modern ones and,
 * later, the Greek and Hebrew editions -- credited in the words its licence
 * asks for. Read from the library, so a translation added to the build is
 * credited without anyone remembering to add a line here. */
function TranslationCredits() {
  const { data: translations } = useTranslations();
  const credited = (translations ?? []).filter((t) => t.credit && t.license_status !== "licensed");
  return (
    <>
      {credited.map((t) => (
        <Source key={t.id} name={t.name}>
          {t.credit}
          {t.license && !t.credit!.includes(t.license) ? ` ${t.license}.` : ""}
          {t.scope ? ` Covers the ${t.scope}.` : ""}
        </Source>
      ))}
    </>
  );
}

function useLexiconSources() {
  return useQuery({ queryKey: ["lexiconSources"], queryFn: () => api.listLexiconSources(), staleTime: Infinity });
}

/** The lexicon shelf, credited from the database like the translations. */
function LexiconCredits() {
  const { data: sources } = useLexiconSources();
  return (
    <>
      {(sources ?? []).map((l) => (
        <Source key={l.code} name={`${l.name} (${l.entry_count.toLocaleString()} entries)`}>
          {l.credit}
        </Source>
      ))}
    </>
  );
}

/** One credited source: what it is, and on what terms it is here. Side by
 * side where the page has the width for it, and the name above its terms
 * where it has not: About opened from a Webster entry can be a pane a third
 * of the window wide, and a name column of fixed width there left the terms
 * none at all. `credit` names it for openAboutAt. */
function Source({ name, credit, children }: { name: string; credit?: string; children: React.ReactNode }) {
  return (
    <div data-credit={credit} className="flex scroll-mt-4 flex-col gap-0.5 py-2.5 @xl:flex-row @xl:gap-3">
      <dt className="shrink-0 font-medium text-ink @xl:w-64">{name}</dt>
      <dd className="min-w-0 flex-1 leading-relaxed text-ink-3">{children}</dd>
    </div>
  );
}

/** Brings `el` to the top of the page's own scroll, and moves nothing else:
 * scrollIntoView goes on to scroll the pane's clipped frame too, and took
 * the pane's header out of sight. */
function scrollToTop(el: HTMLElement) {
  let scroller = el.parentElement;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
  if (!scroller) return;
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - margin;
}

/** A credit an About page has been asked to go to, and the pane asked (see
 * openAboutAt). A store rather than a prop, because the page asked may be
 * open already, and must hear of it. */
export const useCreditAsked = create<{ asked: { credit: string; paneId: string } | null }>(() => ({ asked: null }));

/**
 * Opens Settings → About at one source's credit (a `Source`'s `credit`):
 * "Sources and licences" under a Webster entry means Webster's credit and
 * DataWar's notice, not the top of a long page.
 *
 * In the Settings pane already open, if there is one -- one showing About
 * first, else any, turned to About -- as "Open in Webster" uses the
 * Dictionary pane: every click used to open another About, identical to the
 * last, as another tab. Ctrl+click or a middle-click still opens a new one.
 */
export function openAboutAt(credit: string, e: React.MouseEvent) {
  const panes = useWorkspaceStore.getState().panes;
  const open = panes.find((p) => p.kind === "settings" && p.params.section === "about") ?? panes.find((p) => p.kind === "settings");
  openContent("settings", { section: "about" }, { target: targetFor(e, open?.id ?? "new") });
  // Opened or gone to, the page is in the pane that now has the focus.
  useCreditAsked.setState({ asked: { credit, paneId: useWorkspaceStore.getState().focusedPaneId } });
}

export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // A credit this page was asked to go to, as it opened or since.
  const paneId = usePaneOptional()?.id;
  const asked = useCreditAsked((s) => (s.asked && s.asked.paneId === paneId ? s.asked : null));
  // The credits read from the library come before the one asked for, and
  // move it down as they arrive: go to it once they have.
  const translations = useTranslations();
  const lexicons = useLexiconSources();
  const creditsPlaced = !translations.isPending && !lexicons.isPending;
  useEffect(() => {
    if (!asked || !creditsPlaced) return;
    useCreditAsked.setState({ asked: null });
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-credit="${asked.credit}"]`);
    if (el) scrollToTop(el);
  }, [asked, creditsPlaced]);

  useEffect(() => {
    api.appVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <div ref={rootRef} className="@container">
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
          Included are multiple Bible translations, a timeline of the biblical events, classic commentaries (Matthew Henry, Jamieson-Fausset-Brown, Spurgeon's Treasury of David, and others),
          the Westminster Standards, Strong's lexicon with interlinear Hebrew and Greek, a Bible dictionary and encyclopedia, Webster's 1828 dictionary of the English language, an atlas of the biblical world,
          two harmonies of the Gospels, reading plans, and tools for prayer and Scripture memory.
        </p>
        <p>
          The book library is a set of separate downloads, one per shelf, so the app itself stays small: Puritan and Reformed works, the Church Fathers,
          ancient literature around the Bible, and nineteenth-century histories. Install any of them from Settings → Book library; nothing is fetched from
          here. Beside every verse, the books on those shelves that cite it are counted and listed.
        </p>
      </div>

      <h2 className="mb-1 mt-8 text-lg font-semibold text-ink">Sources and licences</h2>
      <p className="mb-4 text-sm text-ink-3">
        Everything here is either in the public domain or used under a licence that asks only to be credited.
      </p>
      <dl className="divide-y divide-line text-sm">
        <Source name="Bible translations, commentaries, and confessions">
          The King James Version, the American Standard Version, and the other translations and classic works included here are in the public domain,
          except where a translation is listed below with its own terms.
        </Source>
        <Source name="The creeds and the Three Forms of Unity">
          Public domain, from Philip Schaff's <i>The Creeds of Christendom</i> (1877): the received English of the Apostles', Nicene and Athanasian
          creeds; the Heidelberg Catechism in the Tercentenary translation (1863); and the Belgic Confession and the Canons of Dort in the English of
          the Reformed (Dutch) Church in America. That English leaves out the Canons' Rejection of Errors, which is given in Thomas Scott's
          translation (<i>The Articles of the Synod of Dort</i>, 1818).
        </Source>
        <Source name="Calvin's Commentaries">
          The Calvin Translation Society's edition (Edinburgh, 1843–55). Its translators' and editors' footnotes are shown after the paragraph they
          belong to and marked <i>Editor's note</i>, apart from Calvin's own words.
        </Source>
        <TranslationCredits />
        <LexiconCredits />
        <Source name="Strong's lexicon and Thayer's">Public domain.</Source>
        <Source name="Greek New Testament — text, parsing, and Strong's tagging">
          The Translators Amalgamated Greek New Testament and the Translators Brief Lexicon of Extended Strong's for Greek, © Tyndale House Cambridge, used
          under a{" "}
          <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0</ExternalLink> licence, from{" "}
          <ExternalLink href="https://github.com/STEPBible/STEPBible-Data">STEPBible.org</ExternalLink>. The interlinear pane shows its Textus Receptus
          wordstream — the Greek behind the King James Version, and the text Strong numbered — so each word's Strong's number is the one that edition prints,
          not one this app inferred.
        </Source>
        <Source name="Hebrew Old Testament — text, parsing, and Strong's tagging">
          The Translators Amalgamated Hebrew OT, © Tyndale House Cambridge, used under a{" "}
          <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0</ExternalLink> licence, from{" "}
          <ExternalLink href="https://github.com/STEPBible/STEPBible-Data">STEPBible.org</ExternalLink>: the Leningrad Codex word by word, with the
          Open Scriptures Hebrew Bible's parsing, in English chapter and verse numbering so that the interlinear, the word study and the Hebrew text line up
          with the English beside them.
        </Source>
        <Source name="Parsing glossary">
          Written for Sojourner. Its list of Greek and Hebrew parsing terms was checked against STEPBible's Translators Expansion of Greek Morphology
          Codes (TEGMC) and Translators Expansion of Hebrew Morphology Codes (TEHMC), data created by{" "}
          <ExternalLink href="https://github.com/STEPBible/STEPBible-Data">STEPBible.org</ExternalLink> based on work at Tyndale House Cambridge, used
          under a <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0</ExternalLink> licence; the rarer
          Hebrew stems keep the names of the{" "}
          <ExternalLink href="https://hb.openscriptures.org/parsing/HebrewMorphologyCodes.html">Open Scriptures Hebrew Bible morphology codes</ExternalLink>{" "}
          (Creative Commons Attribution 4.0). The tables were consulted, not copied; the explanations follow the standard grammars.
        </Source>
        <Source name="Factbook — people, places and their family and verses">
          The Translators Individualised Proper Names with all References, © Tyndale House Cambridge, used under a{" "}
          <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0</ExternalLink> licence, from{" "}
          <ExternalLink href="https://github.com/STEPBible/STEPBible-Data">STEPBible.org</ExternalLink>. Its identifications, family links and references
          are used; its short descriptions, which it notes were adapted from an AI model's output, are not.
        </Source>
        <Source name="Timeline — events, dates and eras">
          The Theographic Bible Metadata, © Robert Rouse, used under a{" "}
          <ExternalLink href="https://creativecommons.org/licenses/by-sa/4.0/">Creative Commons Attribution-ShareAlike 4.0</ExternalLink> licence, from{" "}
          <ExternalLink href="https://github.com/robertrouse/theographic-bible-metadata">theographic-bible-metadata</ExternalLink>: its events, their dates
          and verses, and the year of each verse. Its chronology is a traditional one, Ussher's for the early ages and later reckonings for the kings and
          the life of Christ; the dates are approximate and are shown as the source gives them. The eras are bounded by its own events, and the fifteen events
          Sojourner adds (the fall of Jerusalem, Ezra, Nehemiah and others) are dated by its year for the verse that records them. The timeline data
          (reference/timeline) is shared under the same licence.
        </Source>
        <Source name="Timeline — church history">
          Written for Sojourner. Every date is taken from a source, and each event quotes that source's own words for it: Philip Schaff's{" "}
          <i>History of the Christian Church</i> and <i>The Creeds of Christendom</i>, the editors' prolegomena to the <i>Nicene and Post-Nicene
          Fathers</i> (Second Series, 1890–1900), and <i>The New Schaff-Herzog Encyclopedia of Religious Knowledge</i> (1908–14), all public domain, in
          the <ExternalLink href="https://ccel.org">Christian Classics Ethereal Library</ExternalLink>'s texts and page images. The six events after 1914,
          which those works do not reach, are each dated from two independent references named with the event, and quote only the words that give
          the date.
        </Source>
        <Source name="Book library shelves">
          Public domain. The Church Fathers (the Ante-Nicene and Nicene and Post-Nicene series, 1885–1900, and Lightfoot's Apostolic Fathers), Josephus
          (Whiston), Philo (Yonge), Schaff's History of the Christian Church and Creeds of Christendom, and Edersheim, as epubs from the{" "}
          <ExternalLink href="https://ccel.org">Christian Classics Ethereal Library</ExternalLink>; 1 Enoch (R. H. Charles, 1917), Tacitus, Pliny and
          Suetonius from <ExternalLink href="https://www.gutenberg.org">Project Gutenberg</ExternalLink>. Each book's source is listed in the shelf's
          own file.
        </Source>
        <Source name="Easton's and Smith's Bible dictionaries">Public domain.</Source>
        <Source name="Webster's 1828 dictionary" credit="webster-1828">
          Noah Webster, <i>An American Dictionary of the English Language</i> (1828): public domain. Prepared from the database in{" "}
          <ExternalLink href="https://github.com/DataWar/1828-dictionary">DataWar/1828-dictionary</ExternalLink>, © 2021 DataWar, used under the MIT
          licence, whose notice follows. Its Scripture links are Sojourner's, made from Webster's own citations.
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-ink-3 hover:text-ink">The MIT licence</summary>
            {/* Set to the column: the file's own line breaks, at eighty
                columns, left every other line a stub here. */}
            <div className="mt-1 space-y-1.5 text-xs leading-relaxed text-ink-3">
              {licenceParagraphs(dataWarLicence).map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </details>
        </Source>
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
        <Source name="Bible atlas — coastlines, rivers, modern borders and towns">
          Made with Natural Earth. Free vector and raster map data at naturalearthdata.com. Public domain.
        </Source>
        <Source name="Bible atlas — terrain pack">
          Elevation from the Terrain Tiles on AWS: SRTM and GMTED2010 courtesy of the U.S. Geological Survey; ETOPO1, U.S. National Oceanic and
          Atmospheric Administration; EU-DEM produced using Copernicus data and information funded by the European Union.
        </Source>
        <Source name="Bible atlas — the map">
          Drawn with MapLibre GL JS, © MapLibre contributors, under the BSD 3-Clause licence. Its names are set in Noto Sans, © The Noto Project Authors, under the SIL Open
          Font License, as distributed by the OpenMapTiles fonts project; the licence ships beside the fonts.
        </Source>
        <Source name="Ezra SIL">
          The font the Hebrew is set in, with its vowel points and cantillation: Ezra SIL 2.51, © SIL International, used under the SIL Open Font
          License, its Hebrew layout © Ralph Hancock and John Hudson under the MIT licence. SIL's web font, unmodified; the licences ship beside it.
        </Source>
        <Source name="Noto Serif">
          The font the Greek is set in, with its accents and breathings, © The Noto Project Authors, used under the SIL Open Font License; the licence
          ships beside the fonts.
        </Source>
        <Source name="OpenDyslexic">
          Used under the SIL Open Font License; the licence text ships beside the font.
        </Source>
      </dl>

      <h2 className="mb-1 mt-8 text-lg font-semibold text-ink">Considered and not included</h2>
      <p className="mb-3 text-sm text-ink-3">
        Readers ask about these. They are left out because their terms do not allow an app to give them away, not because of their quality.
      </p>
      <dl className="divide-y divide-line text-sm">
        <Source name="NET Bible">Free to read online, but its licence does not permit redistributing the whole text inside another program.</Source>
        <Source name="ESV, NIV, NASB, NKJV, NLT, CSB">
          In copyright. A reader who holds a licensed copy in Zefania XML can add it from Settings → Library; it is marked as licensed there and never
          leaves this computer.
        </Source>
        <Source name="Danby's Mishnah (1933)">Not yet in the public domain.</Source>
        <Source name="Post-1929 English translations of Reformed works">
          Wilhelmus à Brakel's <i>Christian's Reasonable Service</i>, Bavinck's <i>Reformed Dogmatics</i>, Turretin's <i>Institutes</i> in Dennison's
          edition, and Vos's <i>Biblical Theology</i> are in copyright in English. The originals are older, but the translations are not.
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
