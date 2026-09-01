#!/usr/bin/env python3
"""Generate ZIKUK production icon assets from branding/zikuk-icon-master.png."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "branding" / "zikuk-icon-master.png"
PUBLIC = ROOT / "public"

# Android maskable safe zone: central 80% diameter circle → ~80% square inset
MASKABLE_SAFE_RATIO = 0.80


def sample_background_color(img: Image.Image) -> tuple[int, int, int]:
    w, h = img.size
    points = [
        (4, 4),
        (w - 5, 4),
        (4, h - 5),
        (w - 5, h - 5),
        (w // 2, 4),
        (w // 2, h - 5),
        (4, h // 2),
        (w - 5, h // 2),
    ]
    rs = gs = bs = 0
    for x, y in points:
        r, g, b = img.getpixel((x, y))[:3]
        rs += r
        gs += g
        bs += b
    n = len(points)
    return rs // n, gs // n, bs // n


def rgb_hex(rgb: tuple[int, int, int]) -> str:
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"


def resize_square(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def make_maskable(img: Image.Image, canvas: int, bg: tuple[int, int, int]) -> Image.Image:
    safe = max(1, int(round(canvas * MASKABLE_SAFE_RATIO)))
    scaled = resize_square(img, safe)
    out = Image.new("RGB", (canvas, canvas), bg)
    offset = (canvas - safe) // 2
    out.paste(scaled, (offset, offset))
    return out


def write_png(path: Path, img: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if img.mode != "RGB":
        img = img.convert("RGB")
    img.save(path, format="PNG", optimize=True)


def write_ico(path: Path, sizes: list[int], source: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    largest = max(sizes)
    base = resize_square(source, largest)
    base.save(
        path,
        format="ICO",
        sizes=[(s, s) for s in sorted(sizes)],
    )


def main() -> None:
    if not MASTER.exists():
        raise SystemExit(f"Master icon not found: {MASTER}")

    master = Image.open(MASTER).convert("RGB")
    bg = sample_background_color(master)
    bg_hex = rgb_hex(bg)
    print(f"Sampled background: {bg_hex}")

    outputs: dict[str, Image.Image] = {
        "apple-touch-icon.png": resize_square(master, 180),
        "icon-192.png": resize_square(master, 192),
        "icon-512.png": resize_square(master, 512),
        "icon-maskable-512.png": make_maskable(master, 512, bg),
        "icon-48.png": resize_square(master, 48),
        "icon-32.png": resize_square(master, 32),
        "icon-16.png": resize_square(master, 16),
    }

    for name, image in outputs.items():
        out = PUBLIC / name
        write_png(out, image)
        print(f"Wrote {out} ({image.size[0]}x{image.size[1]})")

    write_ico(PUBLIC / "favicon.ico", [16, 32, 48], master)
    print(f"Wrote {PUBLIC / 'favicon.ico'}")

    theme_file = ROOT / "branding" / "theme-color.txt"
    theme_file.parent.mkdir(parents=True, exist_ok=True)
    theme_file.write_text(bg_hex + "\n", encoding="utf-8")
    print(f"Wrote {theme_file}")


if __name__ == "__main__":
    main()
