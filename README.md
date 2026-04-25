# invader_gen

A dependency-free static web app for drawing 1-bit invader and pixel art.

Open `index.html` in a browser to use it.

## Export format

Creations are exported as plain text:

```text
INVADER1
size:20x20
data:
00000000000000000000
00000000000000000000
```

The first line identifies the format, the second line declares the square grid
size, and each data row is a `0`/`1` bitmap row. This stays compact, diffable,
easy to paste into source code, and simple to parse in any language.
