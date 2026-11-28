import { Menu, Notice, TFolder, WorkspaceLeaf, normalizePath, type App, type Events, type Plugin } from 'obsidian';
import { TexFileView, VIEW_TYPE_TEX_FILE } from './texFileView';
import type { EditorPreferences } from './editor/preferences';

const texExtensions = ['tex', 'tikz', 'ltx', 'sty', 'cls', 'pgf', 'def', 'dtx', 'ins', 'bib'];
const blankTikzSource = String.raw`\begin{tikzpicture}

\end{tikzpicture}
`;

async function createTikzFile(app: App, folder: TFolder): Promise<void> {
	let file;
	try {
		let number = 1;
		let path = normalizePath(`${folder.path}/Untitled.tikz`);
		while (await app.vault.adapter.exists(path)) {
			path = normalizePath(`${folder.path}/Untitled ${number++}.tikz`);
		}
		file = await app.vault.create(path, blankTikzSource);
	} catch {
		new Notice('Could not create a TikZ file.');
		return;
	}

	try {
		const leaf = app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: VIEW_TYPE_TEX_FILE,
			state: { file: file.path },
			active: true,
		});
		await app.workspace.revealLeaf(leaf);
	} catch {
		new Notice(`Created ${file.name}, but could not open it in TikZ Editor.`);
	}
}

export function registerTexFiles(plugin: Plugin, preferences: EditorPreferences): void {
	const { app } = plugin;
	// Obsidian doesn't expose a public lookup for an extension's registered view.
	const { viewRegistry } = app as typeof app & {
		viewRegistry: { getTypeByExtension(extension: string): string | undefined };
	};
	plugin.registerView(VIEW_TYPE_TEX_FILE, leaf => new TexFileView(leaf, preferences));

	// Serialize requests so two clicks cannot choose the same untitled path.
	let pendingCreation = Promise.resolve();
	const queueCreation = (folder: TFolder): Promise<void> => {
		pendingCreation = pendingCreation.then(() => createTikzFile(app, folder));
		return pendingCreation;
	};
	plugin.addCommand({
		id: 'new-tikz',
		name: 'New TikZ',
		callback: () => queueCreation(app.fileManager.getNewFileParent(app.workspace.getActiveFile()?.path ?? '')),
	});
	plugin.registerEvent(app.workspace.on('file-menu', (menu, file, source) => {
		if (source !== 'file-explorer-context-menu') return;
		const folder = file instanceof TFolder ? file : file.parent;
		if (!folder) return;
		menu.addItem(item => item
			.setTitle('New TikZ')
			.setIcon('shapes')
			.setSection('action-primary')
			.onClick(() => queueCreation(folder)));
	}));

	app.workspace.onLayoutReady(() => {
		const unclaimed = texExtensions.filter(extension => !viewRegistry.getTypeByExtension(extension));
		if (unclaimed.length) plugin.registerExtensions(unclaimed, VIEW_TYPE_TEX_FILE);
	});

	// The pane's More options menu emits leaf-menu even for views that
	// don't emit file-menu (such as a plain FileView).
	plugin.registerEvent((app.workspace as Events).on('leaf-menu', (menu, leaf) => {
		if (!(menu instanceof Menu) || !(leaf instanceof WorkspaceLeaf)) return;
		const { type, state } = leaf.getViewState();
		if (typeof state?.file !== 'string') return;
		const file = app.vault.getFileByPath(state.file);
		if (!file || !texExtensions.includes(file.extension)) return;

		if (type === VIEW_TYPE_TEX_FILE) {
			const defaultView = viewRegistry.getTypeByExtension(file.extension);
			if (!defaultView || defaultView === VIEW_TYPE_TEX_FILE) return;

			menu.addItem(item => item
				.setTitle('Back to default view')
				.setIcon('arrow-left')
				.setSection('view')
				.onClick(() => leaf.openFile(file, { active: true })));
			return;
		}

		menu.addItem(item => item
			.setTitle('Open in TikZ Editor')
			.setIcon('shapes')
			.setSection('view')
			.onClick(() => leaf.setViewState({
				type: VIEW_TYPE_TEX_FILE,
				state: { file: file.path },
				active: true,
			})));
	}));
}
