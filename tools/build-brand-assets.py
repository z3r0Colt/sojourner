#!/usr/bin/env python
"""Turn the two supplied logo renders into the brand assets the app ships.

The renders arrive as opaque artwork on a near-white ground. Everything that
uses the logo -- the splash screen, the sidebar mark, the Windows icon --
needs it cut out of that ground, so this does the cut once and writes the
sizes the app actually loads:

    public/brand/sojourner-mark.png          512px square, transparent -- sidebar, About
    public/brand/sojourner-mark-dark.png     the same, redrawn for a dark ground
    public/brand/sojourner-lockup.png        1040px wide, transparent -- splash screen
    public/brand/sojourner-lockup-dark.png   the same, redrawn for a dark ground
    brand/icon-source.png                    1024px square on an ivory tile -- `tauri icon`

Re-run after replacing anything in brand/source/:

    python tools/build-brand-assets.py
    npm run tauri icon brand/icon-source.png

Needs Pillow and numpy (`pip install pillow numpy`); neither is a runtime
dependency of the app, which is why they are not in package.json.
"""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "brand" / "source"
MARK_SRC = SOURCE_DIR / "logo-mark.png"
LOCKUP_SRC = SOURCE_DIR / "logo-lockup.png"

# A pixel counts as ground if it is this bright and this close to neutral.
# The renders' ground is #f7ffff-#ffffff with compression noise in it, and
# the lightest ink in the artwork (the pale end of the gold) is far below
# this, so the gap is comfortable.
GROUND_MIN_CHANNEL = 226
GROUND_MAX_SPREAD = 30


def cut_from_ground(src: Path) -> Image.Image:
    """Make the ground transparent, leaving the artwork and its white pages.

    Only ground *connected to the border* is removed, which is what keeps the
    white inside the book's pages: it is enclosed by the navy outline, so the
    fill never reaches it, and the mark stays the drawing it was designed as
    rather than a ring of strokes.
    """
    rgb = Image.open(src).convert("RGBA")
    # Flatten onto white first: the source is RGBA and any soft edge of its
    # own must be read against the ground it was drawn on, not against black.
    flat = Image.new("RGBA", rgb.size, (255, 255, 255, 255))
    flat.alpha_composite(rgb)
    arr = np.asarray(flat.convert("RGB")).astype(np.int16)

    lo = arr.min(axis=2)
    hi = arr.max(axis=2)
    groundish = (lo >= GROUND_MIN_CHANNEL) & ((hi - lo) <= GROUND_MAX_SPREAD)

    h, w = groundish.shape
    outside = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    def push(y: int, x: int) -> None:
        if 0 <= y < h and 0 <= x < w and groundish[y, x] and not outside[y, x]:
            outside[y, x] = True
            queue.append((y, x))

    for x in range(w):
        push(0, x)
        push(h - 1, x)
    for y in range(h):
        push(y, 0)
        push(y, w - 1)

    while queue:
        y, x = queue.popleft()
        push(y - 1, x)
        push(y + 1, x)
        push(y, x - 1)
        push(y, x + 1)

    alpha = np.where(outside, 0, 255).astype(np.uint8)
    out = flat.convert("RGB").convert("RGBA")
    out.putalpha(Image.fromarray(alpha))
    # One pixel of feather so the cut edge does not read as a staircase at
    # the sizes the splash and the icon are drawn at.
    out.putalpha(out.getchannel("A").filter(ImageFilter.GaussianBlur(1.0)))
    return out.crop(out.getchannel("A").getbbox())


# The pale ink the navy is redrawn in for a dark ground. Slightly blue rather
# than white, so it still belongs to the same drawing.
DARK_GROUND_INK = (226, 236, 248)


def for_dark_ground(img: Image.Image) -> Image.Image:
    """Redraw the cut-out artwork to be read against a dark ground.

    The logo is navy line-work with white pages behind it, which is a drawing
    made for a light ground: put it on a dark one and the navy disappears
    while the pages glare. Recoloring it is not a matter of inverting the
    image -- it is treating the artwork as ink coverage, and then choosing new
    ink. How much of a pixel is ink is how far it is from the white it was
    drawn on; the pages, being that white, come out as no ink at all and let
    the ground through. The navy is re-inked in pale blue. The gold is kept
    exactly as drawn -- it reads on a dark ground already -- and only made
    opaque where it is properly inked, so that the ground does not show
    through and dull it.
    """
    arr = np.asarray(img.convert("RGBA")).astype(np.float64)
    rgb, a = arr[:, :, :3], arr[:, :, 3:4] / 255.0
    # Against the white the artwork was drawn on, wherever the source is
    # already transparent.
    rgb = rgb * a + 255.0 * (1 - a)

    coverage = 1.0 - rgb.min(axis=2, keepdims=True) / 255.0
    warm = rgb[:, :, 0:1] > rgb[:, :, 2:3] + 18

    ink = np.where(warm, rgb, np.array(DARK_GROUND_INK, dtype=np.float64))
    # The gold's own ink never covers a pixel fully -- it is a mid-tone, so
    # `coverage` tops out around 0.7 where the stroke is solid. Left at that,
    # every gold pixel would be translucent and the ground would show through
    # the whole path. Solid gold is scaled to solid, and its soft edge keeps
    # the ramp it had.
    alpha = np.where(warm, np.clip(coverage / 0.72, 0, 1), coverage)

    out = np.concatenate([ink, np.clip(alpha * a * 255.0, 0, 255)], axis=2)
    return Image.fromarray(out.round().astype(np.uint8), "RGBA")


def fit_square(img: Image.Image, size: int, inset: float) -> Image.Image:
    """Centre `img` in a transparent square, leaving `inset` of it as margin."""
    box = int(round(size * (1 - 2 * inset)))
    scale = min(box / img.width, box / img.height)
    scaled = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return canvas


def on_tile(img: Image.Image, size: int) -> Image.Image:
    """The Windows icon: the mark on an ivory rounded tile.

    Cut out, the mark is navy line-work, and Windows draws app icons against a
    dark taskbar by default -- where navy on near-black is barely an icon at
    all. The tile is the same ground the artwork was designed on, so the mark
    still reads exactly as drawn, and it reads at 16px too.
    """
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.185), fill=255)
    ground = Image.new("RGBA", (size, size), (250, 252, 253, 255))
    tile.paste(ground, (0, 0), mask)
    tile.alpha_composite(fit_square(img, size, inset=0.11))
    return tile


def main() -> int:
    missing = [p for p in (MARK_SRC, LOCKUP_SRC) if not p.is_file()]
    if missing:
        for p in missing:
            print(f"missing source render: {p.relative_to(ROOT)}", file=sys.stderr)
        return 1

    brand_out = ROOT / "public" / "brand"
    brand_out.mkdir(parents=True, exist_ok=True)

    mark = cut_from_ground(MARK_SRC)
    fit_square(mark, 512, inset=0.02).save(brand_out / "sojourner-mark.png", optimize=True)
    fit_square(for_dark_ground(mark), 512, inset=0.02).save(brand_out / "sojourner-mark-dark.png", optimize=True)
    on_tile(mark, 1024).save(ROOT / "brand" / "icon-source.png", optimize=True)

    lockup = cut_from_ground(LOCKUP_SRC)
    width = 1040
    height = max(1, round(lockup.height * width / lockup.width))
    lockup.resize((width, height), Image.LANCZOS).save(brand_out / "sojourner-lockup.png", optimize=True)
    for_dark_ground(lockup).resize((width, height), Image.LANCZOS).save(
        brand_out / "sojourner-lockup-dark.png", optimize=True
    )

    written = (
        brand_out / "sojourner-mark.png",
        brand_out / "sojourner-mark-dark.png",
        brand_out / "sojourner-lockup.png",
        brand_out / "sojourner-lockup-dark.png",
        ROOT / "brand" / "icon-source.png",
    )
    for p in written:
        with Image.open(p) as im:
            print(f"{p.relative_to(ROOT)}  {im.width}x{im.height}  {p.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
