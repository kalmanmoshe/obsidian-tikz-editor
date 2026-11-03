# TikZ Editor for Obsidian — development foundation

Native editor integration has **not been implemented**. The plugin registers one
command, **Open TikZ editor**, which opens a placeholder ItemView.

## Repositories and attribution

- This fresh, uncommitted plugin repository contains Obsidian-specific code in
  `src/`. It retains the official [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
  tooling and LICENSE (template commit `07ceb81d1fb3384af611ebf665a1ec42a7e5926d`).
- `vendor/tikz-editor` is a separate Git submodule of
  [kalmanmoshe/tikz-editor](https://github.com/kalmanmoshe/tikz-editor), forked from
  [DominikPeters/tikz-editor](https://github.com/DominikPeters/tikz-editor).
  Its history, licenses and attribution remain intact. Future editor embedding
  changes belong there on `obsidian-integration`; its source is currently unchanged.
  The plugin does not import or bundle the editor. No editor dependencies are needed.

## Development (PowerShell)

After you commit and publish this plugin repository, clone it using your actual URL:

```powershell
git clone --recurse-submodules <your-plugin-repository-url>
cd obsidian-tikz-editor
git -C vendor/tikz-editor switch obsidian-integration
git -C vendor/tikz-editor remote add upstream https://github.com/DominikPeters/tikz-editor.git
npm install
npm run typecheck
npm run lint
npm run build
npm run dev # watch; stop with Ctrl+C
```

For an existing clone, run `git submodule update --init --recursive` first.
Git clones pin the exact submodule commit; branch tracking is configured for
future deliberate updates. If the branch already exists, switch to it normally.
The `upstream` remote is configured in this checkout, but Git does not copy it to new clones.

Build, then copy only the runtime files to the school vault:

```powershell
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
# Or choose another existing vault:
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -VaultPath 'D:\MyVault'
```

The script copies only `main.js`, `manifest.json`, and `styles.css` to
`<vault>/.obsidian/plugins/tikz-editor`. Existing settings and other files are
preserved; those three runtime files are replaced on subsequent installs.
Source, the submodule, and node_modules stay outside the vault.
The `tikz-editor-prototype` installation and vault plugin configuration are untouched.
Enable **TikZ Editor** in Obsidian's **Settings → Community plugins**, then run
**TikZ Editor: Open TikZ editor** from the command palette. Installation does not
enable the plugin or restart Obsidian. If already loaded, toggle this plugin to reload it.

## Future editor work and upstream updates

Commit editor changes in the submodule first, then record its pointer in the parent:

```powershell
cd vendor/tikz-editor
git switch obsidian-integration
# Edit and review editor files here.
git add <changed-editor-files>
git commit -m "Describe editor change"
git push origin obsidian-integration
cd ../..
git add vendor/tikz-editor
git commit -m "Update editor submodule"
```

To bring upstream updates into the integration branch, start with a clean editor
worktree, run `git fetch upstream`, then `git merge upstream/master` inside the
submodule. Resolve conflicts, verify your changes, push the integration branch,
and review/commit the updated submodule pointer in the parent repository.
Do not use a hard reset to discard integration work.

Initial editor commit: `581928f1c939d8f09ae7b8bb36f1e4456aebdd2d`.
Only `.gitmodules` and the submodule pointer were staged during setup. No parent
commits or hosted plugin repository were created. Commit and publication are yours
to perform after review; the commands above describe future work.
