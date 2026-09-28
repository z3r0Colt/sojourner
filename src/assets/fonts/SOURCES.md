# Fonts

## Ezra SIL 2.51 (`SILEOT.woff`) — the Hebrew

Added 2026-09-28 for the Hebrew with its vowel points and cantillation (styles.css,
"Sojourner Hebrew"). It replaced Noto Serif Hebrew 2.004, which set a meteg directly under
the vowel it goes with: וַֽיְהִי's patah and meteg drew as one mark that reads as a qamats,
and כֵֽן's tsere and meteg as a stroke with two dots. Ezra SIL, made after the typography of
the Biblia Hebraica Stuttgartensia, sets the meteg beside the vowel, and the accents and
points of the Westminster Leningrad Codex (TAHOT) without collisions or dotted circles
(checked at the interlinear's sizes on Genesis 1:1-7, 19:16, Psalm 23:1-4 and Esther 8:9).

| File | From |
|---|---|
| `SILEOT.woff` | `EzraSIL-2.51-web/web/SILEOT.woff` in https://software.sil.org/downloads/r/ezra/EzraSIL-2.51-web.zip (SIL's own web package, zip sha256 `7c19544c173c91e6ac47f605dae2cfa7e61e428abdafe27cf3f225fec4406357`; the woff's sha256 `c5b6a195d770b98a576969e550f4395283086ef63769118d4ff5d0a3d28afd2e`), unmodified |
| `EzraSIL-Licenses.txt` | `EzraSIL-2.51-web/Licenses.txt`, same package |
| `EzraSIL-FONTLOG.txt` | `EzraSIL-2.51-web/FONTLOG.txt`, same package |

Font software © 1997-2007 SIL International, with Reserved Font Names "SIL" and "Ezra",
under the SIL Open Font License 1.1; the Hebrew layout intelligence © 2003 & 2007 Ralph
Hancock and John Hudson under the MIT/X11 License. Both licences are in
`EzraSIL-Licenses.txt`. The font is shipped as SIL published it, not subset or converted,
so the Reserved Font Names do not come into it. It has no bold; bold Hebrew is drawn bold by
the browser from the regular.

## Noto Serif, Greek and Greek Extended — the Greek

`NotoSerifGreek-*.woff2` and `NotoSerifGreekExt-*.woff2`: Noto Serif 2.015, © The Noto Project
Authors, under the SIL Open Font License 1.1 (`NotoSerif-OFL.txt`). Made 2026-09-28 from the
unhinted `NotoSerif-Regular.ttf` and `NotoSerif-Bold.ttf` in
https://github.com/notofonts/latin-greek-cyrillic/releases/download/NotoSerif-v2.015/NotoSerif-v2.015.zip
(zip sha256 `0e9a43c8a4b94ac76f55069ed1d7385bbcaf6b99527a94deb5619e032b7e76c1`) with fontTools:

    pyftsubset NotoSerif-<Weight>.ttf --unicodes="U+0300-036F,U+0370-03FF" --layout-features='*' --flavor=woff2 --output-file=NotoSerifGreek-<Weight>.woff2
    pyftsubset NotoSerif-<Weight>.ttf --unicodes="U+0300-036F,U+1F00-1FFF" --layout-features='*' --flavor=woff2 --output-file=NotoSerifGreekExt-<Weight>.woff2

Glyphs are the font's own, not changed; only the characters outside these ranges are left
out. The files before them were the same font's Greek and Greek Extended ranges without the
combining marks (U+0300-036F), so a letter the text writes with a mark apart -- the TR's
χ̅ξ̅ς᾽ (666, Revelation 13:18) with its combining overlines -- was drawn in Times New Roman,
and its ς᾽ in Noto Serif. A word the text writes with a combining iota subscript (τῇ as τ + ῆ
+ U+0345, about 1,500 of TAGNT's words) is composed to the font's own ῇ when drawn; nothing
in the text is changed.

| File | sha256 |
|---|---|
| `NotoSerifGreek-Regular.woff2` | `3fdb7dcf915bc18262a8a6c52a6c498db633d40f06c1036af114cc811aee9e35` |
| `NotoSerifGreek-Bold.woff2` | `68681eff9499d71f11939b66dc17cf27a01872260d688ec0338b8567f24fbf28` |
| `NotoSerifGreekExt-Regular.woff2` | `154ee0bed72009c8ff69498699d693e60c84d7ecdc452d6850d6d33521f9d5ef` |
| `NotoSerifGreekExt-Bold.woff2` | `cc60b7019e6a67305556188c4350588cb0b6e2dca2c5c149c6512de4bca44cfa` |

## OpenDyslexic — the "Dyslexia-friendly" reading font

`OpenDyslexic-*.woff2`, under the SIL Open Font License 1.1 with Reserved Font Name
OpenDyslexic (`OFL.txt`).
