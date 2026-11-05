#!/usr/bin/env python3
"""Composite the skin's surface stack over the photo and report text contrast.

The preview is not a screenshot of the app: it reproduces the same layering
(photo -> veil -> canvas x3 -> sidebar) with the alpha values parsed straight
out of ``lib/client.js``, so tuning the CSS and re-running this script is the
quickest way to sanity-check readability without opening the window.

Usage: python3 scripts/preview.py
Writes docs/preview-light.png and docs/preview-dark.png, prints worst contrast.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CLIENT = ROOT / "lib" / "client.js"
SRC = ROOT / "assets" / "bridge.webp"
DOCS = ROOT / "docs"

W, H = 1600, 1000
SIDEBAR_W = 300
BLUR = 6.0
SATURATION = 1.08
TEXT_LIGHT_BG = (15, 17, 21)
TEXT_DARK_BG = (249, 250, 251)

# Veil gradients, mirrored from lib/client.js (two stacked gradients each).
VEILS = {
    False: (
        [(0, .18), (.58, .30), (1, .44)],
        [(0, .40), (.28, .14), (.62, 0), (1, .10)],
    ),
    True: (
        [(0, .32), (.55, .40), (1, .56)],
        [(0, .50), (.28, .24), (.62, .14), (1, .20)],
    ),
}
VEIL_RGB = {False: (255, 255, 255), True: (1, 4, 10)}


def token_alphas() -> dict[bool, tuple[float, float]]:
    """Read (bg-base, sidebar-fill) alphas for both themes out of the CSS."""
    css = CLIENT.read_text()
    blocks = {
        False: css.split("body:not([data-ds-dark-theme])")[1].split("}")[0],
        True: css.split("body[data-ds-dark-theme]")[1].split("}")[0],
    }
    out = {}
    for dark, block in blocks.items():
        # Values are written as `rgb(r g b / calc(14% * var(--...)))`.
        base = re.search(r"--dsw-alias-bg-base:\s*rgb\([^)]*/(?:\s*calc\()?\s*([\d.]+)%", block)
        side = re.search(r"--dsw-specific-sidebar-fill:\s*rgb\([^)]*/(?:\s*calc\()?\s*([\d.]+)%", block)
        out[dark] = (float(base.group(1)) / 100, float(side.group(1)) / 100)
    return out


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    scale = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left, top = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((left, top, left + w, top + h))


def gradient(w: int, h: int, stops: list[tuple[float, float]], axis: str) -> Image.Image:
    n = w if axis == "x" else h
    strip = Image.new("L", (n, 1) if axis == "x" else (1, n))
    for i in range(n):
        t = i / max(1, n - 1)
        for j in range(len(stops) - 1):
            p0, a0 = stops[j]
            p1, a1 = stops[j + 1]
            if p0 <= t <= p1:
                v = round(255 * (a0 + (a1 - a0) * (t - p0) / (p1 - p0)))
                strip.putpixel((i, 0) if axis == "x" else (0, i), v)
                break
    return strip.resize((w, h))


def compose(dark: bool, alpha_base: float, alpha_side: float) -> np.ndarray:
    photo = cover(Image.open(SRC).convert("RGB"), W, H)
    photo = photo.filter(ImageFilter.GaussianBlur(BLUR))
    arr = np.asarray(ImageEnhance.Color(photo).enhance(SATURATION)).astype(np.float32)

    vertical, horizontal = VEILS[dark]
    veil_rgb = np.array(VEIL_RGB[dark], dtype=np.float32)
    for g in (gradient(W, H, vertical, "y"), gradient(W, H, horizontal, "x")):
        a = (np.asarray(g).astype(np.float32) / 255)[..., None]
        arr = arr * (1 - a) + veil_rgb * a

    canvas = np.array([255, 255, 255] if not dark else [10, 17, 30], dtype=np.float32)
    for _ in range(3):  # body, layout frame, centre column
        arr = arr * (1 - alpha_base) + canvas * alpha_base

    side = np.array([249, 252, 255] if not dark else [8, 14, 26], dtype=np.float32)
    arr[:, :SIDEBAR_W] = arr[:, :SIDEBAR_W] * (1 - alpha_side) + side * alpha_side
    return arr


def contrast(fg: tuple[int, int, int], bg: np.ndarray) -> float:
    def luminance(rgb):
        channels = [v / 255 for v in rgb]
        channels = [c / 12.92 if c <= .03928 else ((c + .055) / 1.055) ** 2.4 for c in channels]
        return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]

    l1, l2 = sorted([luminance(fg), luminance(bg)], reverse=True)
    return (l1 + .05) / (l2 + .05)


def main() -> None:
    DOCS.mkdir(exist_ok=True)
    for dark, (alpha_base, alpha_side) in token_alphas().items():
        arr = compose(dark, alpha_base, alpha_side)
        luma = arr[..., 0] * .2126 + arr[..., 1] * .7152 + arr[..., 2] * .0722
        fg = TEXT_DARK_BG if dark else TEXT_LIGHT_BG
        brightest = arr[np.unravel_index(luma.argmax(), luma.shape)]
        darkest = arr[np.unravel_index(luma.argmin(), luma.shape)]
        name = "dark" if dark else "light"
        print(f"{name:5} canvas {alpha_base:.0%} sidebar {alpha_side:.0%} | "
              f"luma {luma.min():.0f}-{luma.max():.0f} | "
              f"contrast {contrast(fg, darkest):.2f} (darkest) .. {contrast(fg, brightest):.2f} (brightest)")

        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        draw = ImageDraw.Draw(img)
        draw.text((24, 24), "DeepSeek Harness", fill=fg)
        draw.text((24, 60), "sidebar · sessions", fill=fg)
        draw.text((340, 120), "The pier at dusk — background image skin", fill=fg)
        draw.text((340, 150), "Body text at 14px should stay readable over the blurred photo.", fill=fg)
        draw.rounded_rectangle((330, 200, W - 40, 300), radius=16,
                               fill=(255, 255, 255) if not dark else (20, 30, 49))
        img.save(DOCS / f"preview-{name}.png")


if __name__ == "__main__":
    main()
