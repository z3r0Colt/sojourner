# Sojourner improvement plan

Written 2026-11-11 against 0.4.3 (commit f530fc3), after reading the code and
walking the live web app as a first-time visitor on a desktop and a phone.

## The aim

A newcomer should be reading within a minute and studying within five, and the
app should feel like one thing. Nothing a present user relies on is taken away.

## The governing idea

Sojourner serves four kinds of people: the reader, the student, the preacher,
and the head of a household leading family worship. Today it shows every tool
to all four. A first-time reader meets 21 sidebar destinations, 17 unlabelled
icons on the Bible page, 12 search tabs, and a "send to sermon" microphone on
every commentary entry.

The cure is already half built. `src/workspace/presets.ts` holds four preset
workspaces (Devotion, Sermon prep, Word study, Family worship) that match those
four people. The plan asks one question at the door, shapes the app to the
answer, and keeps everything else one click away.

## How we will know it worked

A person who has never seen the app can do these five things unaided, in under
five minutes, on a desktop and on a phone:

1. Open John 3:16.
2. Read what a commentary says about that verse.
3. Write a note on it.
4. Find that note again.
5. Say where they would go to learn more about the app.

Colt runs this with one or two newcomers before Phase 2 and again after
Phase 3, and writes down where each one stalls. Those notes outrank the
guesses in this plan. Phase 3's order is set by them.

## Baseline (verified 2026-11-11)

- `npm test` passes: 89 files, 1,029 tests, 1 skipped. `npx tsc --noEmit` is clean.
- No workflow runs the tests. `release.yml` and `web.yml` only build and ship.
- No linter, no changelog. `ReadingPane.tsx` is 2,015 lines.
- The first-run tour never shows on a phone (`AppShell.tsx:337` mounts
  `TourOverlay` only when not compact).
- A sidebar click lands in the focused pane, whatever its size. With a
  commentary column focused, Settings, Resources and Guided study each open
  squeezed into that column.

## Decisions that belong to Colt

Each has a recommended default. The work proceeds on the default unless Colt
says otherwise.

| # | Decision | Recommended |
|---|---|---|
| D1 | What the analytics may see | Decided: the full standard analytics, disclosed |
| D2 | Cloudflare's bot-detection script | Turn it off in the dashboard |
| D3 | The question at the door (Phase 2) | Yes, with a "show me everything" answer |
| D4 | Fold Lexicon, Dictionary, Encyclopedia and Factbook under one "Look up" | Yes, as a group that opens, not a merged page |

**D1 in full.** Decided by Colt, 2026-11-11: the full, standard analytics,
plainly disclosed. Cloudflare's automatic setup stays on and adds the beacon to
the page; the app's policy lets it through. (For the record: the web app is a
hash router and the beacon drops what follows a `#` or a `?`, so what it
reports of the address is "/". The first draft of this plan wrongly said a
search would ride out in it.)

**D2 in full.** The live page also carries an inline script from Cloudflare's
JavaScript Detections (the `__CF$cv$params` block, part of Bot Fight Mode). It
is not analytics. The policy blocks it and it logs two console errors on every
load. It cannot be allowed without `'unsafe-inline'`, which would undo the
policy. Turn it off under Security, Bots.

---

## Phase 1. Foundations and evidence

Small, low risk, no change to how the app is used.

**1.1 Let the analytics through, honestly.**
- `tools/vite-web-pwa.ts`, `headers()`: add `https://static.cloudflareinsights.com`
  to `script-src` and `https://cloudflareinsights.com` to `connect-src`. Nothing
  wider. Both are already compatible with the page's cross-origin isolation
  (the script is served `Cross-Origin-Resource-Policy: cross-origin`, and the
  report endpoint answers CORS for the app's origin).
- Cloudflare adds the beacon itself; no tag or token is kept in the repository.
- A test beside the plugin holds the policy to exactly these two hosts and
  the desktop page to none.

**1.2 Say so.**
- `src/features/settings/sections/AboutSection.tsx:283`, the `onWeb` branch:
  replace "nothing about you is sent" with the notice below. The desktop branch
  is untouched.
- `README.md:38`: the same correction in the web section. Lines 12, 77 and 228
  speak of the desktop app and stay true.
- No first-visit banner.

> The web app uses Cloudflare Web Analytics to count visits and see which
> devices and browsers people use, so we know what to fix first. It sets no
> cookies and does not track you across sites. The Windows and Linux apps have
> no analytics at all.

**1.3 Run the tests on every push.** A new `.github/workflows/test.yml` on
`push` and `pull_request`: `npm ci`, `npx tsc --noEmit`, `npm test`, then
`cargo test --lib --manifest-path src-tauri/Cargo.toml` (the Linux packages it
needs are listed in `release.yml:260`).

**1.4 Small blemishes.**
- Verse numbers sit mid-way down a multi-line verse in the desktop Bible pane;
  on a phone they sit at the first line, which is right. Make the desktop match.
- After D2, confirm the live console is clean.

**Colt's part in Phase 1.** D2 in the dashboard, and the newcomer test.

**Done when.** The live console shows no errors, the Cloudflare dashboard shows
visits, About carries the notice, and a push runs the tests.

## Phase 2. One question at the door

The heart of the plan. Screenshots go to Colt before anything is pushed.

**2.1 The question.** On a first launch (the `tour_done` setting unset), before
anything else, a single dialog on desktop and phone alike:

> What brings you here?
> Reading the Bible · Studying it deeply · Preparing to preach or teach ·
> Leading family worship · Show me everything

One tap, no second screen. The answer is kept in a new setting, `purpose`, in
user.db beside `landing_page` (`src/hooks/useSetting.ts`).

**2.2 What the answer shapes.** One table in one new module
(`src/features/onboarding/purpose.ts`), so the mapping is plain to read and
test:

| Purpose | Sidebar shows | Opens on | Workspace preset |
|---|---|---|---|
| Reading | Today, Bible, Notes, Highlights, Reading plans, Prayer, Memory | Today | Devotion |
| Studying | the above, with Look up, Confessions, Harmony, Atlas, Timeline, Resources, Guided study | Bible | Word study |
| Preaching | Studying, with Sermons and Illustrations | Bible | Sermon prep |
| Family worship | Reading, with Family worship, Psalter, Guided study, Confessions | Today | Family worship |
| Everything | all 21, as now | Today | none |

Everything not shown sits under a **More** row at the foot of the sidebar that
opens the rest in place. Settings gains a "Sidebar" block where each item can
be turned on or off and the purpose changed. Search and Go to (Ctrl+K) still
reach every page whatever the sidebar shows.

**2.3 Present users see no change.** Anyone with `tour_done` already set gets
"Everything" and is never asked. They may choose a purpose in Settings.

**2.4 Full pages open wide.** When a sidebar click would land a full page
(`defaultWidth` of 900 or more in `PANE_KINDS`) in a study column, it goes to
the widest pane instead. The rule lives where routes become pane content
(`Workspace.tsx:59`, `openContent.ts`). Ctrl+click still opens a new pane.

**2.5 Names on the icons.** The Add-pane strip (`Workspace.tsx`,
`data-tour="add-pane"`) shows labels until the reader collapses it, as the
sidebar already does. The Bible toolbar's eight right-hand icons show labels
when the pane has room; `ReadingPane.tsx` already measures this for Compare
and Interlinear (`TOOLBAR_NARROW_BELOW_PX`).

**2.6 "Look up" (D4).** Lexicon, Dictionary, Encyclopedia and Factbook become
one sidebar group. Each keeps its own page and route.

**Tests.** The purpose table (every sidebar route appears in "Everything";
every purpose includes Bible and Today), the landing rule, and the
present-user path.

**Done when.** A first run as "Reading" shows eight sidebar rows and no
unlabelled icon, and an upgrade from 0.4.3 looks as it did.

**As built (2026-11-11).** Four things differ from the table above, each on
purpose:

- *Studying* starts with the Bible and Matthew Henry beside it, not the Word
  study preset. Three panes of Greek and Hebrew is a hard first sight; a verse
  and what is said about it is the heart of the app.
- *Look up* is a heading over the four pages, not a row that opens. A row
  that opens would have hidden four pages from present users.
- A page goes to the widest pane only when the focused pane is narrower than
  640 pixels, measured, so a commentary someone has widened still takes it.
- The Bible toolbar has room for names only from a pane 1,400 pixels wide,
  which in practice means a single pane on a large monitor. Below that the
  icons stay bare. The study strip is named at every desktop width.

Present users see two changes: the Look up heading (Confessions now sits
below Factbook), and a small button at the foot of the study strip that shows
the names. An upgrade over real data from the version before was tried: not
asked, all 21 pages, panes kept.

## Phase 3. Reveal by degrees

Ordered by what the newcomers stumbled on. The likely list:

- **A tour of three doings.** `TourOverlay.tsx` has ten steps that tell. Replace
  them with three that wait for the reader to act: click a verse, open a
  commentary on it, write a note. It runs on phones too.
- **One Help door.** A Help row at the foot of the sidebar gathers the
  Tutorial (now inside Settings), the shortcuts sheet (Ctrl+/) and "show the
  tour again". `tutorialContent.test.ts` already checks every shortcut is
  explained; keep it passing.
- **Calmer commentary entries.** Each entry carries three icons. Show them on
  hover or focus, and show "send to sermon" only when the purpose includes
  preaching or a sermon is open.
- **Search tabs.** Twelve tabs wrap to three rows. Show the tabs that fit the
  purpose and have results; the rest go under "More".
- **Names that agree.** The same shelf of books is called Library, Resources,
  Book library, Library shelves and Library packs. Settle one word for each
  thing and use it everywhere, the tutorial and README included.
- **Translation menu.** It lists 21 bare codes. Group them (English, Greek,
  Hebrew, Latin) and give each its full name on hover or in a second line. The
  comment at `ReadingPane.tsx:1155` explains why the menu must stay narrow;
  honour it.
- **Splash.** Three seconds on every launch (`MIN_MS` in `public/splash.js`).
  Keep it for the first launch and drop to about one second after.
- **Guided study stays as named.** More courses are coming; give its landing
  page a course list so the Shorter Catechism is one of several.

**Done when.** The five-task test passes with fresh newcomers on both devices.

**As built (2026-11-11).** Done without newcomer notes, so in the plan's own
order. When Colt has watched someone use it, their stumbles outrank this.

- *The tour* asks for three things and waits for each: pick a verse by its
  number, open a commentary on it, write a note. It is a coach beside the
  app, not a dialog over it, and it runs on a phone. A student, whose
  commentary is already open, is shown it turning to the verse instead.
- *Help* is a row at the foot of the sidebar. Behind it are the tour, the
  shortcuts sheet and the tutorial, on one page (it was Settings → Tutorial).
- *Sermon tools* (Send to sermon, Save as illustration) show for a preacher,
  for "everything", for anyone never asked, and for anyone with a sermon
  open. A commentary entry's remaining tools wait for the pointer.
- *Search tabs* are five for a reader. A tab with something found in it
  always shows.
- *The splash* holds three seconds on a first launch and about one after.

Not done, and why:

- *Translation menu.* It was already grouped by language with each full name
  on hover. Nothing to add without widening a menu the code keeps narrow on
  purpose.
- *Guided study's course list.* There is one course. A list of one teaches
  nothing; build it with the second course.
- *The Bible toolbar on a laptop.* Its seven tools are still bare icons below
  1,400 pixels. Naming some and not others looked worse than naming none.

**A decision for Colt: the word "Library".** The audit found the names are
steadier than first thought. "The book library" comes as "shelves"; a "pack"
is the file that installs a shelf on the desktop. The real knot is one word
used three ways: the sidebar heading *Library* (Confessions, Timeline, Atlas,
Resources), the page *Resources* (which the tutorial and About call "your
library"), and Settings → *Library* on the desktop. The recommendation is to
rename the page **Resources** to **Books**, which is what it holds and what
its search tab is already called, and leave the rest. Colt agreed, and it is done: the
page is Books in the sidebar, its heading, the tutorial and every message
that names it. Its address (`/resources`) is unchanged, so saved workspaces
and links still open.

## Phase 4. Keep it so

No change the reader can see.

- Split `ReadingPane.tsx` (2,015 lines) by concern: toolbar, verse rows, verse
  menu, popups. Then `queries.ts` (1,765) by feature and `EpubReader.tsx` (1,352).
  Tests pass unchanged before and after each split.
- ESLint with typescript-eslint and the React hooks rules, run in `test.yml`.
- `CHANGELOG.md`, begun from the git history of 0.4.x.
- A test that the version agrees across `package.json`,
  `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
- README divided: `README.md` for readers, `docs/DEVELOPING.md` for builders.
- `docs/house-rules.md`: one page of names and layout rules (the glossary from
  Phase 3, where full pages open, when an icon needs a label, how a new feature
  joins a purpose) so later features fit the rest.

**Done when.** No source file exceeds about 800 lines without a stated reason,
and lint and tests run on every push.

**As built (2026-11-12).**

- *Lint.* ESLint's and typescript-eslint's recommended rules and the two
  rules of hooks, on every push. It found 25 things in the whole frontend.
  One was a real fault: the backup reminder could be skipped for a session
  when the automatic-backup setting loaded last. The rest were three lists
  made stable, eight places that now say why they are as they are, and three
  stale directives.
- *Changelog and versions.* `CHANGELOG.md` back to 0.2.7 from the commit
  history, and a test that the three version numbers agree and the current
  one has an entry.
- *README.* The README is for someone who wants the app; building and
  packaging moved to `docs/DEVELOPING.md` unchanged. The code signing policy
  stays on the README, where the certificate's terms want it.
- *House rules.* `docs/house-rules.md`.
- *Splits.* Moved, not rewritten, and each checked in the running app:
  - `api/queries.ts` (1,765 lines, 198 hooks) is eleven files by feature
    under `api/queries/`, behind one index. No import elsewhere changed.
  - `ReadingPane.tsx` went from 2,061 lines to about 1,490. The toolbar and
    its menus are `ReadingToolbar.tsx`; the chapter note box and two color
    text helpers have files of their own.
  - `EpubReader.tsx` went from 1,352 to about 1,080. What it asks of a book
    apart from drawing it is `epubBook.ts`.

**The 800-line mark was not met, and here is why.** These remain over it:

| File | Lines | Why it is left |
|---|---|---|
| `api/types.ts` | 1,548 | Type declarations only; one file is easier to search than ten. |
| `tutorialContent.ts` | 1,421 | The tutorial's text, as data. |
| `ReadingPane.tsx` | ~1,490 | One component holding the reading state: selection, highlights, find, word lookup, keys, read aloud. Its parts share that state, and nothing tests the component whole. Cutting further means turning those parts into hooks, which should follow tests of the pane, not precede them. |
| `EpubReader.tsx` | ~1,080 | The same: one component around epub.js's rendition, with no test that opens a book. |
| `FamilyWorshipView.tsx`, `SearchPanel.tsx`, `workspaceStore.ts`, `commands.ts`, `ttsStore.ts` | 850 to 1,040 | Not touched. Each is one subject, and none stood in the way of this work. |

The next step, when there is appetite for it, is a test that mounts the Bible
pane with a chapter and exercises selecting, highlighting and noting. With
that in place the pane can be taken apart safely.

---

## Rules for every phase

- Work on the designated branch. One commit per numbered item, in plain words
  like the existing history.
- `npm test` and `npx tsc --noEmit` pass before each push.
- Nothing is removed from the app. Things are hidden by default, never deleted.
- Desktop and web share one frontend; check both `onWeb` branches.
- Existing settings, saved workspaces and routes keep working.
- Stop and show Colt screenshots before pushing anything in Phase 2 or 3 that
  changes what a user sees.
- The web app cannot be run in a cloud session as it stands (`wasm-bindgen` is
  not installed and the content build takes several minutes). Either install
  the toolchain the README names, or verify with unit tests and against
  app.gentleking.org after a deploy, and say which was done.
