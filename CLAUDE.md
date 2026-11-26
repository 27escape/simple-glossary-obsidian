# Simple Glossary — notes for Claude

Obsidian plugin, desktop and mobile: reads a glossary note, marks its terms in other notes (Reading view and the editor) and explains them in a hover tooltip. Plain JavaScript, no runtime dependencies, no bundler: `tools/build.mjs` joins `src/` files in the order listed in `tools/files.json`. Same conventions as Kevin's Neon Work plugin.

## Read first
- `docs/architecture.md`: how the parts fit together.
- `MAP.md`: every source file with its functions, classes and methods (regenerate: `node tools/map.mjs`). Find code there first, then open only that file.
- `README.md`: what the user sees; keep it in step with behaviour.

## Where things are
- `src/imports.js`: everything taken from `obsidian` and `@codemirror/*` (provided by Obsidian at run time).
- `src/parse.js`: glossary note → entries `{ term, def, url, tags, line }`.
- `src/match.js`: the matcher (whole words, plurals, case), `findTerms`, `skipRanges` (parts of Markdown that aren't prose), `firstLines`.
- `src/plugin.js`: the Plugin class (settings, loading the glossary, refreshing views, window events). `reading.js`, `open.js` add methods with `Object.assign(SimpleGlossaryPlugin.prototype, { ... })`.
- `src/glossary-edit.js`: adding an entry to the glossary text and sorting its lists (pure, tested); `src/add-term.js`: the *Add to glossary* window and the write.
- `src/reading.js` (Reading view post-processor), `src/editor.js` (CodeMirror extension), `src/tooltip.js`, `src/open.js` (click → glossary), `src/settings.js` (settings page, note suggestions), `src/styles.css`.

## Build and test
- `node tools/build.mjs` → `dist/simple-glossary/{main.js,styles.css,manifest.json}`, the manifest copied to the repo root, and a copy in `sample vault/.obsidian/plugins/simple-glossary/`.
- `node --test test/*.test.mjs` runs the unit tests (real source files, a small Obsidian/CodeMirror stand-in in `test/load.mjs`).
- `node tools/check.mjs`: no network, eval, shell, notifications, HTML strings or note writes in the build; every src file listed; file sizes; `isDesktopOnly` false.
- `tools/setup-repo.sh [--dry-run]` sets up git and GitHub once: `git init` (or adopts the GitHub repo's history, keeping local files), makes the GitHub repo with `gh` (owner from `git config --global github.user`, name from the folder), pushes, sets the description and topics. Safe to run again.
- `tools/release.sh [X.Y.Z] [--dry-run]` releases a version: checks, version bump, build, main fast-forwarded, tag, push; GitHub Actions (`.github/workflows/release.yml`) then drafts the release, which the script publishes. Needs `docs/release-notes/X.Y.Z.md` and a GitHub remote `origin` (`--help` for the steps). Adapted from Neon Work's script.
- To try it: open `sample vault` in Obsidian (the glossary path is already set), or copy the three built files into a vault's `.obsidian/plugins/simple-glossary/` and switch the plugin off and on.

## Rules
- **Never change the user's notes** except the glossary, and only when the user saves a term in the *Add to glossary* window: all writing stays in `src/add-term.js` (`tools/check.mjs` enforces it), through `vault.process`. Otherwise the plugin only reads; its other file is its own `data.json`.
- 100% local: no network, no system notifications, no `child_process`, no `eval`, no `innerHTML` with data.
- Runs on mobile too: only Obsidian's own APIs and the DOM (no Node or Electron modules, checked by `tools/check.mjs`). On mobile (`Platform.isMobile`) a tap shows the tooltip (`onTap` in `open.js`) instead of hover and click.
- Keep settings keys and command ids; migrate saved settings on load when a default changes.
- Use British English in UI text and docs.
- Files: one job each, target under 400 lines (soft cap 500). New feature = new file + entry in `tools/files.json` + `node tools/map.mjs`.
- Every bug fixed gets a unit test or a check. Commits have no Claude attribution lines (no "Co-Authored-By: Claude", no "Claude-Session"); the author is Kevin Mulholland <kevin@27escape.com>.
