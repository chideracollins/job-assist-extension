#!/usr/bin/env python3
"""Generate placeholder PNG icons for the Job Assist extension (no dependencies).

Design: purple rounded square with a white "document" and accent lines.
Writes icons/icon16.png, icon48.png, icon128.png. Replace these with real
branded artwork when you polish the extension.
"""

from __future__ import annotations

import os
import struct
import zlib

BG = (108, 92, 231, 255)      # #6c5ce7
PAGE = (255, 255, 255, 255)   # white document
LINE = (79, 70, 229, 255)     # #4f46e5 accent lines


def rounded_rect_sdf(px, py, x0, y0, x1, y1, r):
    """Signed distance of point (px, py) from rounded rect; <= 0 inside."""
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    hw = (x1 - x0) / 2 - r
    hh = (y1 - y0) / 2 - r
    dx = max(abs(px - cx) - hw, 0.0)
    dy = max(abs(py - cy) - hh, 0.0)
    return (dx * dx + dy * dy) ** 0.5 - r


def draw(size: int) -> bytes:
    """Return raw RGBA scanlines for one icon size."""
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            fx, fy = x + 0.5, y + 0.5
            # Background: full-bleed purple (rounded corners handled by Chrome).
            color = BG
            # Page: white rounded rect, ~50% width, 16%..84% height.
            if rounded_rect_sdf(fx, fy, 0.25 * size, 0.16 * size, 0.75 * size, 0.84 * size, 0.06 * size) <= 0:
                color = PAGE
            # Accent lines on the page (skip detail on tiny sizes).
            if size >= 32:
                lines = [
                    (0.34, 0.34, 0.66),
                    (0.34, 0.50, 0.58),
                    (0.34, 0.66, 0.50),
                ]
            else:
                lines = [(0.34, 0.50, 0.64)]
            for x0f, yf, x1f in lines:
                if rounded_rect_sdf(
                    fx, fy, x0f * size, yf * size, x1f * size, (yf + 0.055) * size, 0.015 * size
                ) <= 0:
                    color = LINE
            row.extend(color)
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path: str, size: int) -> None:
    raw = draw(size)
    # Filter type 0 (None) per scanline.
    filtered = b"".join(b"\x00" + raw[y * size * 4 : (y + 1) * size * 4] for y in range(size))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(filtered, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({size}x{size}, {len(png)} bytes)")


def main() -> None:
    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 48, 128):
        write_png(os.path.join(out_dir, f"icon{size}.png"), size)


if __name__ == "__main__":
    main()
