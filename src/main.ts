import { Plugin, Notice, MarkdownView } from 'obsidian';
import { TikzEditorView, VIEW_TYPE_TIKZ_EDITOR } from './view';
import { CodeBlockEditorPane } from './codeBlockEditor/pane';
import { FenceEditContext } from './codeBlockEditor/fenceEditContext';
import { EditorPreferences } from './editor/preferences';

interface DraftData {
	source?: string;
	legacyDiagram?: unknown;
}

export default class TikzEditorPlugin extends Plugin {
	private fencePanes = new Map<MarkdownView, CodeBlockEditorPane>();
	private draft: DraftData = {};
	private preferences!: EditorPreferences;
	private writes: Promise<void> = Promise.resolve();
	private timer: number | null = null;

	async onload(): Promise<void> {
		const data: unknown = await this.loadData();
		let savedPreferences: unknown;

		if (data && typeof data === 'object') {
			const { source, editorPreferences, ...rest } = data as Record<string, unknown>;
			savedPreferences = editorPreferences;
			if (typeof source === 'string') {
				this.draft = { ...rest, source };
			} else if ('editorPreferences' in data || 'legacyDiagram' in data) {
				this.draft = rest;
			} else {
				this.draft = { legacyDiagram: data };
			}
		}

		this.preferences = new EditorPreferences(savedPreferences, () => this.scheduleSave());
		const saveDraft = (source: string): void => {
			this.draft.source = source;
			this.scheduleSave();
		};

		this.register(() => {
			if (this.timer) window.clearTimeout(this.timer);
			this.flushDraft();
		});

		this.registerView(
			VIEW_TYPE_TIKZ_EDITOR,
			leaf => new TikzEditorView(leaf, this.draft.source, saveDraft, this.preferences),
		);

		this.addCommand({
			id: 'open-editor',
			name: 'Open diagram editor',
			callback: async () => {
				const workspace = this.app.workspace;
				const leaf = workspace.getLeavesOfType(VIEW_TYPE_TIKZ_EDITOR)[0] ?? workspace.getLeaf('tab');
				await leaf.setViewState({ type: VIEW_TYPE_TIKZ_EDITOR, active: true });
				await workspace.revealLeaf(leaf);
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				menu.addItem(item => {
					item.setTitle('CREATE_CODE')
						.setIcon('file-json')
						.onClick(async () => {
							//new CreateCodeFileModal(this, file).open();
						});
				});
			}),
		);

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, info) => {
				if (!(info instanceof MarkdownView)) return;
				const context = FenceEditContext.create(this, editor, info.file);
				if (!context.isInFence()) {
					return;
				}
				menu.addItem(item => {
					item.setTitle('Edit TikZ code block')
						.setIcon('code')
						.onClick(() => {
							this.fencePanes.get(info)?.close();
							const pane = new CodeBlockEditorPane(this, context, info, this.preferences);
							this.fencePanes.set(info, pane);
							pane.register(() => { if (this.fencePanes.get(info) === pane) this.fencePanes.delete(info); });
							pane.load();
						});
				});
			}),
		);
	}

	private scheduleSave(): void {
		if (this.timer) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.flushDraft();
		}, 350);
	}

	private flushDraft(): void {
		const data = { ...this.draft, editorPreferences: this.preferences.get() };
		this.writes = this.writes.catch(() => {}).then(() => this.saveData(data));
		void this.writes.catch(() => {
			new Notice('Could not save the TikZ editor draft and preferences.');
		});
	}

	onunload(): void {
		for (const pane of this.fencePanes.values()) pane.close();
		this.fencePanes.clear();
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TIKZ_EDITOR)) {
			if (leaf.view instanceof TikzEditorView) leaf.view.disposeEditor();
		}
	}
}
