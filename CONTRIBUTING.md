# Contributing

Report bugs with the Obsidian and Tablite versions, desktop/mobile platform,
reproduction steps, and a small CSV/TSV example with private data removed.
For encoding bugs, attach the original file: pasting its text loses the encoding.

Use Node.js 20 or later. Install the locked dependencies and validate changes:

```sh
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run build
git diff --exit-code -- styles.css
git diff --check
```

Lint uses the official `eslint-plugin-obsidianmd` recommended rules and fails on
warnings. Both pull request CI and release CI run it. See [AGENTS.md](AGENTS.md)
for repository rules. When changing styles, commit the generated `styles.css`
and rebuild to confirm it stays unchanged.

Settings tabs must expose `getSettingDefinitions()` for settings search on
Obsidian 1.13+. Retain `display()` while supporting older hosts, sharing labels
and options between both paths. Follow the official
[dual-support migration](https://docs.obsidian.md/plugins/guides/migrate-declarative-settings).
Check both declarative key binding and legacy persistence. Updating development
API types does not change the supported runtime version in `manifest.json`.

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

Before tagging, synchronize versions in `package.json`, `package-lock.json`,
`manifest.json`, and `versions.json`, and merge the validated changes. Do not
overwrite published tags. After the release workflow succeeds:

1. Download all three assets, compare them with the build from the tagged source,
   and verify each with `gh attestation verify <asset> --repo laofahai/obsidian-tablite`.
2. In the authenticated Obsidian Community plugin dashboard, select **Check for
   new releases**. Wait for `Completed` for the correct version and commit.
3. Check the [public scorecard](https://community.obsidian.md/plugins/tablite#scorecard).
   Distinguish actionable source warnings from expected capability disclosures
   such as clipboard writes; do not claim unavailable scans passed.
4. Update the related issue with the release link, verified results, and any
   remaining limitations. State whether manual Obsidian testing was performed.

Documentation and CI-only changes do not require a new plugin release.
