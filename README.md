# invader_gen

A dependency-free static web app for drawing 1-bit invader and pixel art.

Open `index.html` in a browser to use it.

## Saving and loading

Use the name field in the toolbar to name the current creation. `Save` stores it
in browser local storage, and saved creations appear in the gallery beside the
editor. Saving repeatedly while working on a new creation overwrites that same
gallery item. Loading from the gallery creates a fresh working copy, so saving it
again creates a new gallery item for variations. Use `Delete` to remove saved
items from local storage.

## Export format

Creations are exported as plain text:

```text
INVADER1
size:13x13
name:Untitled
data:
0000000000000
0000000000000
```

The first line identifies the format, the second line declares the grid
dimensions as `columns x rows`, the optional `name:` line names the piece, and
each data row is a `0`/`1` bitmap row. This stays compact, diffable, easy to
paste into source code, and simple to parse in any language.

To import, paste compatible `INVADER1` text into Text Export and press
`Import Text`. Imported creations are loaded into the editor but are not stored
in the gallery until you press `Save`.
