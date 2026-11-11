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
| D1 | What the analytics may see | Visits only, with page tracking off |
| D2 | Cloudflare's bot-detection script | Turn it off in the dashboard |
| D3 | The question at the door (Phase 2) | Yes, with a "show me everything" answer |
| D4 | Fold Lexicon, Dictionary, Encyclopedia and Factbook under one "Look up" | Yes, as a group that opens, not a merged page |

**D1 in full.** Cloudflare's beacon, left to itself, reports every address the
app visits, and the app's address mirrors what is on screen. A search rides in
it (`/search?q=justified+by+faith`), as do lexicon entries, encyclopedia
articles and Factbook pages (`routeFor` in `src/workspace/paneKinds.ts`). That
is more than "count visits and see which devices and browsers people use". The
recommended course is to place the beacon ourselves with `"spa": false`, so it
reports one page load and nothing after. This needs Colt to copy the site token
from the Cloudflare dashboard (Web Analytics, the site, "manual setup") and to
switch off automatic injection there. The token is public by nature and safe to
commit.

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
- Per D1, add the beacon tag in the web build only (the `tags` list in
  `transformIndexHtml`), with `"spa": false`. The desktop page gains nothing.
- The service worker already leaves other origins alone (`web-public/sw.js:53`).
- Add a test beside the plugin that the policy names exactly these two hosts
  and that the desktop build's `index.html` carries no beacon.

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
> no analytics and make no network request unless you press Check for updates.

**1.3 Run the tests on every push.** A new `.github/workflows/test.yml` on
`push` and `pull_request`: `npm ci`, `npx tsc --noEmit`, `npm test`, then
`cargo test --lib --manifest-path src-tauri/Cargo.toml` (the Linux packages it
needs are listed in `release.yml:260`).

**1.4 Small blemishes.**
- Verse numbers sit mid-way down a multi-line verse in the desktop Bible pane;
  on a phone they sit at the first line, which is right. Make the desktop match.
- After D2, confirm the live console is clean.

**Colt's part in Phase 1.** D1 and D2 in the dashboard, and the newcomer test.

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
