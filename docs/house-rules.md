# House rules

The names and layout rules Sojourner keeps to, so that a new feature fits the
rest. Each rule says where it lives in the code, and most are held by a test.
When a rule and the code disagree, one of them is wrong: fix it, do not work
around it.

## The one idea

A verse, what is said about it, and what you make of it. Everything else in
the app serves that. A new feature should be reachable from a verse, or it
should say plainly why it is not.

## Names

One word for each thing, everywhere: in the sidebar, the page's heading, the
tutorial, messages and the README.

| The thing | Its name | Not |
|---|---|---|
| The page of books, yours and the shelves' (`/resources`) | **Books** | Resources, your library |
| A set of books added together | a **shelf** | a collection |
| The file that installs a shelf on the desktop | a **pack** (`.sjpack`) | a library, a download |
| All the shelves together | **the book library** | the library |
| The sidebar heading over Confessions, Timeline, Atlas and Books | **Library** | |
| The sidebar heading over Lexicon, Dictionary, Encyclopedia, Factbook | **Look up** | Reference |
| A narrow pane that follows the text | a **study pane** | a panel, a sidebar |
| The strip that opens study panes | **Study this passage** | the Add pane strip (its name in code) |
| Your notes on the passage being read, as a study pane | **My study** | Mine |
| The courses | **Guided study** | the tutorial |
| The tour, the shortcuts and the tutorial | **Help** | Tutorial (the section's key in code) |
| What a new install says it came for | its **purpose** | a mode, a profile |

A page keeps its address when it is renamed (`/resources` is still Books), so
saved workspaces and links go on working.

## What a newcomer sees

- **Hide, never remove.** A page a purpose does not show is under More. A
  tool a purpose does not show comes back when it is wanted (the sermon tools
  return when a sermon is open). Go to and Search reach everything always.
- **Someone already here sees no change.** No purpose stored means
  "everything", and every purpose-shaped rule must give the app as it was for
  that case. `purpose.ts`, `useSermonTools.ts` and `searchTabs.ts` each have a
  test that says so.
- **Ask once, and take any answer.** The question at the door is one tap, and
  closing it is an answer.
- **Teach by doing.** The tour asks for three acts and waits. Do not add a
  step that only tells.

## Where things open

`src/workspace/openContent.ts` is the one way to open anything.

- A link inside a pane opens in that pane. Ctrl+click or a middle click
  opens a new pane, on every link in the app.
- A jump from outside the panes (the sidebar, Go to, the address) goes to the
  focused pane, unless that pane is narrower than 640 pixels and the thing is
  a page: then it goes to the widest pane (`paneForPage`).
- A passage goes to the Bible pane being read, never turning a study pane
  into a second Bible.
- A sermon being written is never replaced; what is opened goes beside it as
  a tab.
- On a phone there is one pane at a time and the others are tabs.

## Icons and their names

- Every icon-only button has a `label` (`IconButton` requires it): it is the
  accessible name, and the app's own tooltip (`data-tip`, `Tooltip.tsx`),
  which shows quickly under the pointer and under keyboard focus. Do not
  give an icon a `title` as well: the browser would show its slow tooltip
  over the quick one.
- A row of more than three icons that a newcomer must choose between gets
  names, or a way to show them. The study strip does; the sidebar does.
- Tools on a repeated row (every commentary entry, every verse) appear on
  hover or focus, and always where nothing hovers. The row being read aloud
  or turned to keeps its tools showing.
- Name a tool or leave the whole row unnamed. Half a row of names reads as a
  mistake.

## Adding a feature

1. **A page**: add it to `src/layout/nav.ts`, then give it a place in a
   purpose in `src/features/onboarding/purpose.ts`. A test fails if no
   purpose reaches it.
2. **A study pane**: add its kind to `STUDY_STRIP_KINDS` in
   `src/workspace/paneKinds.ts` and a short name to `STRIP_NAMES` in
   `Workspace.tsx`.
3. **A preacher's tool**: gate it with `useSermonTools()`.
4. **A search tab**: add it to `searchTabs.ts` under the purposes it suits.
5. **A shortcut**: add a row to `src/layout/shortcuts.ts` the day it ships.
   A test fails until the tutorial explains it.
6. **The tutorial**: an entry in `tutorialContent.ts`, with what it is, the
   steps, and a link.
7. **The changelog**: a line under *Unreleased* in `CHANGELOG.md`, written
   for the person using the app.

## Where a setting lives

`src/hooks/useSetting.ts` has the rule. Anything a person would miss after
reinstalling (their purpose, highlight names, templates) goes in user.db
through `useSetting`. Window and layout state (theme, text size, whether the
study strip shows its names) stays in `uiStore`.

## Words

- Plain words and sentence case. "Click" on a desk, "tap" on a phone.
- Say what a thing does for the reader, not how it is built.
- The desktop app makes no network request unless asked, and says so. The
  web app says what it sends and why. Keep both statements true: Settings →
  About, the README, and the test beside `tools/vite-web-pwa.ts`.

## Commits and comments

- A commit's subject is a plain sentence about what changed for the reader
  ("Keep a verse's number at its first line on a wide screen").
- A comment says why the code is as it is, most of all when it looks wrong.
  An `eslint-disable` line always carries its reason after ` -- `.
