# Tunes you supply

Drop tune files here and run `npm run import:tunes`. They are read into
`reference/psalter/tunes.json`, built into `content.db`, and shipped inside
the app — nothing is fetched at runtime.

This folder exists because the public-domain collection `npm run fetch:tunes`
draws on is a general hymn library. It has Old 100th, St Anne, Tallis' Canon
and Winchester New, but not the Scottish psalm tunes — **Dundee, French,
Martyrs, Crimond, Coleshill, Wiltshire, Belmont, Bangor, York, Stroudwater** —
which are what the 1650 psalter is actually sung to. Those tunes are all long
out of copyright, but no freely-licensed machine-readable collection of them
appears to be published, so they have to come from wherever you hold them.

## What to put here

Either format works:

- **`.mid` / `.midi`** — a hymn MIDI is normally all four parts at once. The
  melody is taken as the top line: the highest note sounding at each fresh
  attack. That is what the congregation sings, and all this app keeps.
- **`.abc`** — a single melody line, slurs marking any syllable carried over
  two notes.

## Naming

The filename gives the tune its name, and may name the metre after a dot:

| File | Tune | Metre |
| --- | --- | --- |
| `Dundee.CM.mid` | Dundee | Common Metre (8.6.8.6) |
| `French.8.6.8.6.mid` | French | the same metre, written out |
| `Martyrs.mid` | Martyrs | worked out from the note count |

Leave the metre off and it is inferred, which works whenever the note count
means only one thing. 28 notes can only be Common Metre; 48 could be either
`L.M.6` or `6.6.6.6.D.`, so that one has to be named. The importer says which
when it cannot tell.

## What gets rejected, and why

A psalm tune has exactly one note per syllable — that is what lets the words
sit under the notes, and what lets any Common Metre tune carry any Common
Metre psalm. So a tune whose melody does not come out to its metre's syllable
count is reported and left out rather than shipped: a tune that does not fit
cannot carry the words.

If a file is rejected for a note count that is close but not exact, the usual
cause is a MIDI with a pickup note, a repeated section, or an ornament — trim
it to one note per syllable and it will import.

## Re-running

`import:tunes` replaces everything it imported last time and leaves the
fetched tunes alone; `fetch:tunes` does the reverse. A tune you supply wins a
name collision with a fetched one, so you can override a fetched tune by
dropping in your own file of the same name.

**Keep the files here.** This folder is the source of truth for the tunes it
owns, which is how removing one takes effect — delete `Dundee.CM.mid`, re-run
`import:tunes`, and Dundee leaves the app. The flip side is that emptying the
folder and re-running removes every imported tune, so these files want to stay
checked in alongside the rest of the psalter's source data.
