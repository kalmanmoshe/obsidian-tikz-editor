# Ownership boundary

Keep the vendored TikZ Editor fork as close to upstream as reasonably possible.
Fork changes should improve generic reusability or the editor's actual editing
functionality, and preserve existing web/desktop defaults.

## TikZ Editor fork

- Parser, semantic evaluator, renderer and source-editing operations.
- Existing canvas, source editor, state and history.
- Shell-independent embedding exports and session/render lifecycle.
- Generic host boundaries for portals, cursor classes, theme observation and
  event ownership. Hosts may configure available capabilities explicitly.
- A separate layout-handle registry so shared editor commands do not import the
  full docking UI. Existing full-app imports remain compatible.

## Obsidian plugin

- ItemView lifecycle, resizing, commands and mapping Obsidian's theme.
- Compact layout, toolbar/tool selection, default/example document and save UI.
- Platform identity, clipboard adapter and persistence decisions.
- Vault/note reads and writes, recovery, settings and conflict handling.
- Bundling, optional-feature packaging and stylesheet containment.

The plugin's `src/editor/compact.tsx` consumes `@tikz-editor/app/embedding`; the fork
does not import the plugin or contain Obsidian APIs, platform IDs or workflows.
No separate diagram model or replacement TikZ editing engine is introduced.

## Generated files

Do not edit generated Lezer parsers by hand. Only regenerate them for deliberate
grammar changes, and keep unrelated regeneration or line-ending churn out of
integration patches. This integration makes no parser or grammar changes.

All plugin runtime code is bundled into `main.js`; styles are emitted as
`styles.css`. The ItemView directly imports the compact editor and does not load
another JavaScript file. `npm run build:install` builds and replaces the installed
runtime, with a backup of the previous files.
