# Changelog

What changed in each release of Sojourner, newest first, written for the
people who use it. The entries for 0.4.3 and earlier were gathered from the
commit history; each release's installers and their checksums are on the
[releases page](../../releases).

## Unreleased

**For someone new**

- A new install is asked one question, "What brings you here?" (reading,
  studying, preparing to preach or teach, leading family worship, or
  everything). The answer chooses the pages in the sidebar, where the app
  opens, and the arrangement it starts in. The rest wait under **More**, and
  Settings → Reading changes the answer or picks the pages one by one. Anyone
  already using the app is not asked and keeps every page.
- The tour is three things to do in the Bible itself (pick a verse, open a
  commentary on it, write a note) in place of ten things to be told. It waits
  for each, never takes over the keyboard, and runs on a phone.
- **Help**, at the foot of the sidebar, opens one page with the tour, the
  keyboard shortcuts and the tutorial. (It was Settings → Tutorial.)

**Everywhere**

- The strip of study panes beside the text can show each pane's name
  ("Commentary", "Cross references"…) under "Study this passage". A new
  install starts with the names showing; the button at the strip's foot
  shows or hides them.
- The sidebar gathers the Lexicon, Dictionary, Encyclopedia and Factbook
  under **Look up**. The **Resources** page is now called **Books**.
- A page opened from the sidebar while a narrow study pane has the focus
  (Settings, Books, Guided study) opens in the widest pane, not squeezed
  into the narrow one.
- "Send to sermon" and "Save as illustration" show for someone who came to
  preach, who chose everything, who was never asked, or who has a sermon
  open. A commentary entry's tools appear when the pointer is on it.
- The search box shows the tabs that suit what you came for, and always any
  tab with something found in it.
- On a wide screen a verse's number sits at its first line, and on a large
  monitor the Bible toolbar names its tools.
- The opening screen stays three seconds the first time and about one after.

**The web app**

- It uses Cloudflare Web Analytics to count visits and see which devices
  and browsers people use. Settings → About and the README say so. The
  Windows and Linux apps have no analytics.

**Fixed**

- The backup reminder could be skipped for a whole session when the
  automatic-backup setting was the last thing to load.
- On a phone, **Commentary on this verse** could open several entries past
  the verse chosen (Genesis 1:3 opened on verse 9). It now lands on the
  verse.

**Behind the scenes**

- Tests, type checks and a linter now run on every push.

## 0.4.3 (2026-10-14)

- **Commentary on this verse** in the verse menu, on every screen size. A
  new commentary pane opens on a commentary that covers the book.
- **Sojourner on the web**, at app.gentleking.org: the same app in a
  browser, installable on a phone, tablet or computer, with your data kept in
  the browser and the books read as you go or downloaded once for use
  without the internet. Library shelves and the Atlas's terrain and
  satellite maps are there too.
- On a phone: every pane keeps its place when you switch away and back; the
  list pages, search, settings, Harmony and the sermon filters fit the
  screen.
- A page's controls move under its title when they do not fit beside it.
- Search is lighter on the web, and a backup made by a newer version is
  refused rather than half read.

## 0.4.2 (2026-10-11)

- **The Psalter sings through every stanza.** Play carries on from the
  stanza shown to the end of the psalm, the staff and the count following,
  unless repeat is turned off. Previous and Next while playing carry the
  singing on. The words under the staff can be hidden; both choices are
  remembered.

## 0.4.1 (2026-10-10)

- **Sojourner for Linux**: a `.deb` and an AppImage, built beside the
  Windows installer.
- Recordings play on Linux, the system accent is read from KDE and GNOME
  47 or later, and wording follows the platform.
- **Print this chapter** is no longer cropped to its pane (Windows too).

## 0.4.0 (2026-10-06)

- **Color text**: every person, place, time and number in its own color,
  and **Who's speaking**, which sets God's own words in small capitals.
- **Guided study**: a course through the Westminster Shorter Catechism in
  four units, with unit reviews, a printed notebook, leader mode and the
  Standards side by side.
- **Atlas**: a real map with terrain and satellite imagery as optional map
  packs, twenty more journeys, Roman roads and the great Old Testament
  routes, and a ruler.
- **Other devices**: Sojourner in a browser on the same network.
- The classic catechism expositions as commentary on the Standards; the
  "Mine" pane renamed **My study**; sermons follow one track.

## Earlier

- **0.3.5** (2026-09-29): book search works again, every shipped book
  opens, and translations you add are marked as yours.
- **0.3.4** (2026-09-28): exact Greek and Hebrew search, and a
  word-by-word interlinear.
- **0.3.3** (2026-09-25): the sermon writer's release.
- **0.3.2** (2026-09-25): memory work grows up; a new install opens on
  Today.
- **0.3.1** (2026-09-24): family worship, the Three Forms of Unity in
  public-domain translations, the whole of Matthew Henry, and Calvin apart
  from his editors.
- **0.2.7** (2026-09-23): search one translation or all.
