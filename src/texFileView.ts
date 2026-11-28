import { Notice, TextFileView, type TFile, type WorkspaceLeaf } from 'obsidian';
import { mountCompactEditor, type CompactEditorHandle } from './editor/isolated';
import type { EditorPreferences } from './editor/preferences';

export const VIEW_TYPE_TEX_FILE = 'tikz-editor-file';

export class TexFileView extends TextFileView {
	private editor: CompactEditorHandle | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly preferences: EditorPreferences) {
		super(leaf);
		this.contentEl.addClass('tikz-editor-pane');
	}

	getViewType(): string {
		return VIEW_TYPE_TEX_FILE;
	}

	getIcon(): string {
		return 'shapes';
	}

	onload(): void {
		super.onload();
		this.registerEvent(this.app.workspace.on('css-change', () => {
			this.editor?.setTheme(this.isDark());
		}));
	}

	getViewData(): string {
		return this.editor?.getSource() ?? this.data ?? '';
	}

	setViewData(data: string): void {
		this.clear();
		if (!this.file) return;

		const host = this.contentEl.createDiv({ cls: 'tikz-editor-root' });
		try {
			this.editor = mountCompactEditor(host, {
				source: data,
				dark: this.isDark(),
				preferences: this.preferences,
				viewportKey: `file:${this.file.path}`,
				initialSourceVisible: true,
				onChange: source => {
					if (this.editor && source !== this.data) this.requestSave();
				},
				onSave: () => this.save(),
				onError: message => { new Notice(message); },
			});
		} catch (error) {
			host.remove();
			const message = error instanceof Error ? error.message : String(error);
			this.contentEl.createEl('p', { text: `Could not open the editor: ${message}` });
		}
	}

	async onUnloadFile(file: TFile): Promise<void> {
		await super.onUnloadFile(file);
		this.clear();
	}

	clear(): void {
		const editor = this.editor;
		this.editor = null;
		editor?.dispose();
		this.contentEl.empty();
	}

	private isDark(): boolean {
		return this.contentEl.ownerDocument.body.hasClass('theme-dark');
	}
}
