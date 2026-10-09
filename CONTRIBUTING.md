# Contributing

Report bugs with the Obsidian and Tablite versions, desktop/mobile platform,
reproduction steps, and a small CSV/TSV example with private data removed.
For encoding bugs, attach the original file: pasting its text loses the encoding.

Use Node.js 20 or later. Install the locked dependencies and validate changes:

```sh
npm ci
npx tsc --noEmit
npm test
npm run build
```

Keep pull requests focused and add regression coverage for behavior changes.
For UI changes, also check an Obsidian test vault in light/dark themes and a
popout window. Check selection, editing, column filters, and the context menu.
Do not commit vault contents or plugin settings from your personal vault.

Edit `src/styles.css`; the build regenerates the tracked root `styles.css`.
Use scoped selectors instead of `!important`, typed arrays, and validate loaded
settings as `unknown`. Use Obsidian element helpers and window-scoped timers.

Releases are triggered by a version tag. The release workflow tests and builds
with `npm ci`, attests the assets, and publishes only `main.js`, `styles.css`,
and `manifest.json`. Attestations require a GitHub Actions release run; local
builds cannot verify that part of the workflow. The community scorecard scans
published releases, so a source fix alone does not update its results.
