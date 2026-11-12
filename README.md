<p align="center">
  <img src="public/brand/sojourner-lockup.png#gh-light-mode-only" alt="Sojourner" width="360">
  <img src="public/brand/sojourner-lockup-dark.png#gh-dark-mode-only" alt="Sojourner" width="360">
</p>

<p align="center"><a href="https://gentleking.org">gentleking.org</a></p>

# Sojourner

*Bible Study Companion for Windows and Linux*

A private, offline study companion for reading Scripture alongside the historic commentaries, confessions, and reference works of the church. Everything it needs is inside the installer. There is no account, no sync service, and no network traffic unless you press *Check for updates*: your notes, highlights, prayers, and sermons live in one file on your own computer, and you can back it up, export it, and restore it whenever you like.

## Download

Get the latest installer and the book library packs from the [releases page](../../releases/latest).

- **Sojourner_x.y.z_x64-setup.exe** installs the app. Windows 10 or 11, 64-bit; per-user, no administrator rights; the WebView2 runtime is bundled, so it installs offline.
- **Sojourner_x.y.z_amd64.deb** installs it on Ubuntu, Linux Mint, Debian and their relatives (Ubuntu 24.04, Mint 22, Debian 13 or newer, 64-bit): `sudo apt install ./Sojourner_x.y.z_amd64.deb`.
- **Sojourner_x.y.z_amd64.AppImage** runs without installing on most other 64-bit Linux systems from 2024 on (Fedora 40 or newer, for example): make it executable (`chmod +x`) and open it. It needs `libfuse2` (on Ubuntu 24.04, `libfuse2t64`).
- **Sojourner-Library-x.y.z.sjpack** is the optional library of 271 Puritan and Reformed works. Install it from inside the app: Settings → Book library → Install from file.
- **Church-Fathers**, **Ancient-literature** and **Nineteenth-century** `.sjpack` files are further shelves, each installed and removed on its own: the Ante-Nicene and Nicene and Post-Nicene Fathers (38 volumes); Josephus, Philo, 1 Enoch, Tacitus, Pliny and Suetonius; Schaff's *History* and *Creeds* and Edersheim.

The installer is not yet code-signed, so Windows SmartScreen warns on first run: choose *More info*, then *Run anyway*. The Linux packages are not signed either (that is usual on Linux); the release notes give each file's SHA-256 to check with `sha256sum`.

From 0.3.4 on, the installer is built by GitHub Actions from the source in this repository (`.github/workflows/release.yml`), not on anyone's own computer. The library packs are built separately and attached to the release by hand.

## Sojourner on the web

The same app also runs in a browser, on phones, tablets and computers, at **[app.gentleking.org](https://app.gentleking.org)**. It is a progressive web app: nothing to download from a store. Installing it gives it its own icon and window, and the app offers to after your first visit:

- **iPhone and iPad**: in Safari (or Chrome), tap the Share button, then *Add to Home Screen*. Do this: Safari clears a website's data after a week or so unused, but keeps an app's on the home screen.
- **Android**: tap *Install* when the app offers, or Chrome's ⋮ menu → *Install app*.
- **Mac**: in Safari, File → *Add to Dock* (macOS Sonoma or later); in Chrome or Edge, the install icon in the address bar.
- **Windows and Linux**: in Chrome or Edge, the install icon in the address bar. Firefox can't install web apps, but the app works as it is in a Firefox tab.

- **Your data stays on your device.** Notes, highlights, prayers and sermons are kept in your browser's private storage, as the desktop app keeps them in a file. There are no accounts and no sync. Settings → Data & backups exports everything to a file (the same format as the desktop app's, so it goes either way) and imports it again. Safari can clear a site's data after a few weeks without a visit unless the app is on the home screen, so export now and then; the app reminds you.
- **The books are read as you go.** The Bibles, commentaries, lexicons and reference works are fetched from `data.gentleking.org` in small pieces as you open them, and kept on the device once read. Settings → Data & backups → *Use without the internet* downloads all of it (about 900 MB) so the app works with no connection. Cloudflare, which hosts both addresses, logs requests the way any web host does.
- **The web app has analytics.** It uses Cloudflare Web Analytics to count visits and see which devices and browsers people use, so we know what to fix first. It sets no cookies and does not track you across sites. The Windows and Linux apps have no analytics at all.
- **Library shelves** (Puritans, Church Fathers and the rest) are added from Settings and read online; *Keep on this device* stores a single book. The Atlas has its terrain and satellite maps built in.
- **One tab at a time**: the app's storage allows only one open copy, and a second tab says so and offers to take over.
- **Left out**: Other devices, the offline neural voice (the browser's own voices read aloud instead), backups to a folder, and your own audio, video and MOBI files. Adding your own EPUB and PDF books works; they stay in the browser and are not part of an export.

The Windows and Linux installers are unchanged and remain the way to have everything on your own computer.

## What is included

- **Thirteen English Bible translations**: King James (1769), American Standard (1901), Young's Literal, Darby, Webster's, Geneva (1599), Douay-Rheims, Tyndale, the World English Bible, and four modern ones free to share: the Berean Standard Bible, the Literal Standard Version, and unfoldingWord's Literal and Simplified Texts. Translations you own can be added from Zefania XML.
- **Commentaries**: Matthew Henry's Commentary on the Whole Bible (the complete work, not the Concise), Calvin's Commentaries with the translators' footnotes marked as theirs, Jamieson-Fausset-Brown, Barnes' Notes on the New Testament, and Spurgeon's Treasury of David on every Psalm.
- **Confessions**: the Westminster Confession and the Larger and Shorter Catechisms with their Scripture proofs and a topic index, with commentaries on them by Hodge, Shaw, and Vincent; the Apostles', Nicene, Athanasian, and Chalcedonian creeds; the Belgic Confession, the Heidelberg Catechism, and the Canons of Dort with their Rejection of Errors, all in public-domain translations from Schaff's *Creeds of Christendom* and Thomas Scott. The Shorter, Larger and Heidelberg catechisms and the Catechism for Young Children can all be memorized.
- **Original languages**: the Hebrew Old Testament (Leningrad Codex), five editions of the Greek New Testament (Textus Receptus, Byzantine, SBLGNT, Westcott–Hort, Tregelles) with a view of where they differ, the Septuagint and the Latin Vulgate. Strong's, Thayer's, Brown–Driver–Briggs, Abbott-Smith and Liddell–Scott–Jones; a word study for any word; search by grammar; a word-by-word interlinear that sets each Greek and Hebrew word under the English phrase it is translated by, or keeps the original order if you prefer. Every word's parsing is spelled out in plain English ("aorist active imperative" rather than a code), with a short explanation of each term. Double-click any word in the text for its entry.
- **Reference**: the International Standard Bible Encyclopedia (9,349 articles), Easton's and Smith's dictionaries merged into one (nearly 6,000 entries), Noah Webster's *American Dictionary of the English Language* of 1828 (69,580 entries), which gives the senses the King James words still carried then ("prevent", "let", "conversation"), and over 340,000 cross references.
- **Atlas**: 1,342 places of the biblical world, each with every verse that names it, and fourteen journeys from Abraham to Paul's voyage to Rome.
- **Factbook and timeline**: a page for each of 4,275 people, places and things, telling apart the Bible's several Zechariahs by the verses that name them, with their families and every verse; and a zoomable timeline of 464 events from Creation to Paul in Rome, with the kings of Judah and Israel side by side, followed by 296 events of church history from the apostolic age to the twentieth century, in ten eras, each dated by and quoting its source (chiefly Schaff's *History of the Christian Church* and *Creeds of Christendom*).
- **Book library** (separate downloads): 271 Puritan and Reformed works, the Church Fathers in 38 volumes, Josephus, Philo and the Roman historians, and Schaff and Edersheim — each book's Scripture references counted beside every verse they cite.
- **And**: two harmonies of the Gospels, six reading plans, the 1650 Scottish Metrical Psalter on a page of its own, all 163 settings lined to their metre, with playable tunes, and an offline neural voice that reads any chapter, commentary, or book aloud, starting where you are.

## What it does

**Reading and study.** Split the window into up to eight panes; drag them to dock, stack them as tabs or open a new tab in any pane (Ctrl+T), pick a quick arrangement, and save named workspaces. The lists and contents beside a page fold away and resize, so a thin pane keeps room to read. Linked panes follow each other: click a verse and the commentary, cross references, confession proofs, encyclopedia, atlas, the people and places it names, the timeline, and the books in your library that cite it all turn to that verse. The timeline scrolls on past either end, with an overview strip beneath it to drag and Shift+wheel to pan; a *Church history* switch shows or hides the church's events, and a creed or a book on your shelves opens from its event. Compare translations side by side, or one verse across every translation. In the interlinear, hover over a Greek or Hebrew word for its parsing; the word's popup and the Word Study page give it too, each term with its explanation. Highlight in five named colours, underline, bookmark, and write notes on a verse, a highlight, or a chapter. Seven themes including sepia, true black, and high contrast, a dyslexia-friendly font, and reduced motion.

**Search.** One box covers Scripture, commentary, your notes and prayers, your books, the confessions, the encyclopedia, the lexicons, the Factbook, your sermons, and your illustrations, with the same rules on every tab: "exact phrases", OR, -exclusions, (grouping), words near each other, +exact forms and case (+LORD), prefixes, and regular expressions. Filters can be typed in the box and saved with it (in:psalms, t:kjv, G26, red:, has:note). Older spellings are matched (shew and show), results are counted by book and translation, and a concordance view lines every hit up on its word. Search the Greek and Hebrew by grammar ("every aorist imperative in Ephesians") without knowing a code letter.

**Sermons.** A manuscript editor whose points are its outline, with live passage blocks that render in the sermon's translation. Drag a point in the outline, or press Alt+Shift+↑/↓, and it moves with its sub-points and everything under them. Part of a point can be set apart as its explanation, illustration, application, a transition, or a kind you name, each in its own colour through to preaching mode and print. Twelve templates to start from, among them Three points, Me · We · God · You · We, Verse by verse, and Children and youth. A microphone button on every verse, commentary entry, confession section, lexicon entry, encyclopedia article, and book selection sends it into the open sermon with its source, and an idea inbox (Ctrl+Alt+I from anywhere) holds thoughts that have no sermon yet until you drag one in. A six-stage prep track, timed rehearsals, a full-screen preaching mode with a clock, slides generated from the manuscript (mark any line for a slide of its own) with PowerPoint export, fill-in handouts, printing, Markdown export, and a podium file: the manuscript as one web page for a phone or tablet, with every passage written in, turned by a tap and needing no internet. Sermon series can produce a reading plan for the congregation and a memory verse a week, printed as cards to hand out, and an illustrations file warns when a story has already been told in a series.

**Devotion.** A Today page, where a new install opens, with where you left off, today's plan, this Sunday's sermon, memory cards due, and people to pray for. Reading plans with catch-up tools and a builder for your own. A prayer journal in the ACTS pattern and a prayer list with a record of when each person was prayed for. Scripture and catechism memory with spaced repetition and three practice modes: whole psalms and chapters learned a part at a time, verses practised both ways (the words, and where they are), ready-made sets from the Romans Road to the Ten Commandments, the catechism's proof texts beside its answers, a verse read aloud for practice away from the screen, and a calendar of the days you practised rather than a streak. Family worship adds a verse to learn together and three questions to talk over (Faith, Love and Hope), which a family can reword, add to, or reset; a sermon series adds a verse a week, with cards to print for the congregation. The Psalter page, under Devotion, opens any of the 150 psalms in the 1650 metre with its tunes, sized to taste, and returns to the one you last sang.

**The library.** The book library packs arrive as shelves, and the Books page sorts every book by shelf and subject: sermons, theology, commentary, Christian life, the Fathers by series. Beside each verse, a small count shows how many books on your shelves cite it; click it for the list, and click a citation to open the book at that page. Add your own EPUB, PDF, and MOBI books and your audio and video files too: they are indexed for search, scanned for the verses they cite, and can be linked to passages, down to a moment in a recording. Read aloud starts on the page you are viewing in an EPUB, PDF or MOBI book, or from a passage you select (*From selection*) where the text can be selected, and the book follows along; click a paragraph to move the voice there, or pick a passage from the player's *Jump to a passage* list. Scripture references, Roman numerals and ordinals are read as they are said ("Isa. lxvi. 23" as "Isaiah 66, verse 23", "Sermon II." as "Sermon 2.").

**Your data.** Snapshots, automatic backups, export and import of the whole database, an integrity check, a copy to a folder synced by OneDrive or Dropbox, study stats with a reading heatmap, and a Trash that holds deleted notes for thirty days.

Every bundled work is in the public domain or used under a licence that asks only to be credited; Settings → About lists each source and its terms. Sojourner's own code is under the Apache License 2.0 (`LICENSE`). Questions and corrections: sojourner@gentleking.org.

## Code signing

Release installers are to be signed with a Certum code-signing certificate (SimplySign) issued to Colt McClish. Until that is in place, the installer is unsigned (see [Download](#download)).

**Privacy policy.** This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. The one such request is *Check for updates* in Settings → About, which asks GitHub for the latest release. The web app at app.gentleking.org is a separate thing and has analytics, as [described above](#sojourner-on-the-web).

## For developers

Sojourner is a desktop application built with Tauri, Rust, and React/TypeScript, and the same frontend built for the web.

- [docs/DEVELOPING.md](docs/DEVELOPING.md): building it, the tests, the content and library packs, the web version, and Windows packaging.
- [.github/RELEASING.md](.github/RELEASING.md): cutting a release.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release.
- [docs/house-rules.md](docs/house-rules.md): the names and layout rules a new feature should keep to.
