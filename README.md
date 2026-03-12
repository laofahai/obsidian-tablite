# Tablite

A fast, feature-rich CSV/TSV editor for [Obsidian](https://obsidian.md). Edit tabular data directly in your vault with an Excel-like experience.

[中文文档](README_zh.md)

![Tablite Screenshot](assets/screenshot.png)

## Features

- **Virtual scrolling** — handles 10k+ rows smoothly
- **Inline editing** — double-click any cell to edit
- **Cell selection & cross highlight** — single-click to select, with row/column cross highlight (toggleable)
- **Column sorting** — click header to sort ascending/descending
- **Column filtering** — per-column text filter below each header
- **Global search** — search across all cells with highlight
- **Auto delimiter detection** — comma, semicolon, tab, pipe
- **Auto encoding detection** — UTF-8, GBK, Windows-1252, Shift-JIS
- **Header detection** — auto-detects whether first row is a header, with manual toggle
- **Column resizing** — drag column borders to resize
- **Context menu** — right-click to insert/delete rows and columns
- **Undo/Redo** — full edit history (up to 50 steps)
- **Obsidian-native styling** — respects your theme colors and dark/light mode

## Installation

### From Obsidian Community Plugins (coming soon)

1. Open **Settings → Community Plugins → Browse**
2. Search for **Tablite**
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/laofahai/obsidian-tablite/releases)
2. Create folder `<vault>/.obsidian/plugins/tablite/`
3. Copy the three files into that folder
4. Restart Obsidian and enable **Tablite** in Community Plugins

## Usage

Open any `.csv` or `.tsv` file in your vault — Tablite automatically opens it as an editable table.

| Action | How |
|---|---|
| Edit a cell | Double-click |
| Select a cell | Single-click |
| Sort column | Click header name |
| Rename header | Double-click header name |
| Filter column | Type in the filter input below header |
| Resize column | Drag the right edge of header |
| Insert/delete row or column | Right-click → context menu |
| Undo / Redo | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` |
| Search | Search box (top-right) |

## Tech Stack

- [Preact](https://preactjs.com/) — lightweight UI
- [TanStack Table](https://tanstack.com/table) — headless table logic (sorting, filtering)
- [TanStack Virtual](https://tanstack.com/virtual) — row virtualization
- [PapaParse](https://www.papaparse.com/) — CSV parsing/serialization
- [jschardet](https://github.com/nicstredicern/jschardet) — encoding detection

## Development

```bash
git clone https://github.com/laofahai/obsidian-tablite.git
cd obsidian-tablite
npm install
npm run dev    # watch mode
npm run build  # production build
```

## License

MIT
