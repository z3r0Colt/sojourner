# Factbook

`TIPNR - Translators Individualised Proper Names with all References - STEPBible.org CC BY.txt`
is STEPBible's TIPNR, unmodified, fetched 2026-09-23 from
https://github.com/STEPBible/STEPBible-Data (Proper Nouns). © Tyndale House
Cambridge, CC BY 4.0.

The importer (`src-tauri/src/import/reference/factbook.rs`) reads from it:
each person, place and other named thing; every form of its name with the
Hebrew or Greek and its Strong's number; its family and, for places, founders
and inhabitants; and every verse that names it. It also reads TIPNR's one-line
summary, which TIPNR builds from those fields.

It does **not** read TIPNR's `@Brief`, `@Short` and `@Article` descriptions:
TIPNR notes they were adapted from the output of an AI model. The Factbook's
prose is the encyclopedia's and the dictionaries', linked by name.

`overrides.json` is this app's own: where an entity's encyclopedia article,
dictionary entry or atlas place cannot be found by name, or is found wrongly,
it says which. The build reports how many entities are still unlinked.
