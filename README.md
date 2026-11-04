# Compact TikZ Editor for Obsidian

A small native Obsidian pane built from the actual `tikz-editor` code in
`vendor/tikz-editor`. It mounts upstream `CanvasPanel` and `SourcePanel`, uses
the upstream Zustand store and reducers, runs `computeSnapshot`, and renders
with the upstream parser, semantic evaluator, SVG engine and embedded TeX fonts.
There is no separate node/edge model, simulated preview, iframe or hosted editor.

## Use

Enable or reload **TikZ Editor** under **Settings → Community plugins**, then
run **TikZ Editor: Open diagram editor**.

- Choose Select, Node, Arrow, Rectangle or Circle in the small toolbar.
- Drag a node border/body to move it. Upstream handles resize, rotation and text editing.
- Use **Edit source** for the real upstream CodeMirror editor. Source edits render
  on the canvas; visual edits modify the original TikZ through upstream edit actions.
- Undo/redo uses drawing history for the canvas and CodeMirror history for source.
- **Save as note** creates a new Markdown note at vault root containing the current
  TikZ in a fenced block. Ctrl+S in the pane invokes the same save.
- The last source is saved as plugin draft data and restored on reopening.

One editor pane is supported because upstream state and the active platform are
currently module singletons. No full docking layout, document tab bar, assistant,
presentation interface, account controls or application menu is mounted.

## Code map

| File | Purpose |
| --- | --- |
| `src/main.ts` | Plugin commands and draft persistence |
| `src/view.ts` | Native ItemView, direct editor import, note export and theme |
| `src/editor/compact.tsx` and `src/editor/compact.css` | Plugin-owned compact layout, toolbar, example source, clipboard adapter and save controls |
| `vendor/tikz-editor/packages/app/src/embedding/` | Generic session/render hooks and host boundaries, shared editor component exports |
| `vendor/tikz-editor/packages/app/src/ui/dock-layout-handle.ts` | Shared layout registry decoupled from the full docking UI |
| `esbuild.config.mjs` and `build-config.mjs` | Bundle upstream components and scope their stylesheet to the pane |

The plugin owns `mountCompactEditor` in `src/editor/compact.tsx`. It imports generic
building blocks from `@tikz-editor/app/embedding`. The fork contains no compact
layout or Obsidian platform adapter. See `ARCHITECTURE.md` for the ownership boundary.

## Build and install (PowerShell)

One-time setup: copy `install.local.example.json` to `install.local.json` at the
project root and set `vaultPath` to your vault folder. `install.local.json` is
ignored by Git; the committed installer contains no personal vault path. Relative
paths are resolved from the project root.

From the project folder, build and replace the plugin in your configured vault:

```powershell
npm.cmd run build:install
```

This builds all runtime code into `main.js` and all editor CSS into `styles.css`,
backs up the previous installed runtime, and copies those files with the manifest
and license notices into the vault. It removes obsolete `editor.js` and
`editor.css` from the installation. Plugin data and other vault files are retained.
Reload **TikZ Editor** in Obsidian after replacing the files.

Override the local configuration for one installation:

```powershell
npm.cmd run build:install -- -VaultPath "D:\MyVault"
```

For a fresh checkout, install dependencies first:

```powershell
git submodule update --init --recursive
npm.cmd ci
npm.cmd ci --ignore-scripts --prefix vendor/tikz-editor
npm.cmd run build:install
```

`npm.cmd run build` builds without installing. `npm.cmd run lint` and

For upstream production lint on Windows, use:

```powershell
cd vendor/tikz-editor
node node_modules/eslint/bin/eslint.js "packages/*/src/**/*.{ts,tsx}" "apps/*/src/**/*.{ts,tsx}" --max-warnings=0
```

`npm run dev` watches the plugin and imported upstream editor source. Both build
outputs are refreshed together; run `npm run build:install` to copy a production
build into the vault.

## Scope

Desktop/main-window integration. Existing note-block editing, inline Markdown
rendering, referenced external assets and multiple simultaneous editor panes are
future work. The internal renderer supports the upstream TikZ subset; it is not
full external TeX compilation. PDF assets and compiled previews are explicitly
unavailable. Documentation hover downloads are disabled in the compact host.
Upstream math text rendering and source editing remain intact.

The previous standalone diagram draft, if present, is retained under
`legacyDiagram` in plugin data. It is not used as the editor's document model.

## Provenance

The plugin retains the official `obsidianmd/obsidian-sample-plugin` tooling and
0-BSD LICENSE. The separate `vendor/tikz-editor` submodule is
`kalmanmoshe/tikz-editor`, forked from `DominikPeters/tikz-editor`, with upstream
history and MIT attribution retained. Integration changes are local and uncommitted.
Commit changes in the submodule before updating the parent submodule pointer.
Bundled third-party and font licenses are included in `THIRD-PARTY-NOTICES.txt`.

The normal plugin build bundles upstream source and uses the committed parsers;
it does not run lezer-generator. Generated Lezer parser files are build outputs. Do not hand-edit them. This
integration changes neither grammars nor generated parsers. If a future editing
feature requires a grammar change, edit its grammar and regenerate deliberately;
avoid committing line-ending-only regeneration churn.
