import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import { mountCompactEditor, type CompactEditorHandle } from './editor/isolated';
import type { EditorPreferences } from './editor/preferences';
import './view.css';

export const VIEW_TYPE_TIKZ_EDITOR = 'tikz-editor-view';

export class TikzEditorView extends ItemView {
	private editor: CompactEditorHandle | null = null;
	private savingNote = false;

	constructor(
		leaf: WorkspaceLeaf,
		private source: string | undefined,
		private persist: (source: string) => void,
		private preferences: EditorPreferences,
	) {
		super(leaf);
		this.addAction('save', 'Save diagram as note', () => {
			if (!this.editor) return;
			void this.saveNote(this.editor.getSource()).catch((error: unknown) => {
				new Notice(error instanceof Error ? error.message : String(error));
			});
		});
	}

	getViewType(): string {
		return VIEW_TYPE_TIKZ_EDITOR;
	}
	getDisplayText(): string {
		return 'Diagram editor';
	}
	getIcon(): string {
		return 'shapes';
	}

	onOpen(): Promise<void> {
		this.registerEvent(
			this.app.workspace.on('css-change', () => {
				this.editor?.setTheme(this.contentEl.ownerDocument.body.hasClass('theme-dark'));
			}),
		);
		this.resumeEditor();
		return Promise.resolve();
	}

	resumeEditor(): void {
		if (this.editor) return;
		this.contentEl.empty();
		this.contentEl.addClass('tikz-editor-pane');
		try {
			const host = this.contentEl.createDiv({ cls: 'tikz-editor-root' });
			this.editor = mountCompactEditor(host, {
				...(this.source === undefined ? {} : { source: this.source }),
				dark: this.contentEl.ownerDocument.body.hasClass('theme-dark'),
				preferences: this.preferences,
				onChange: source => {
					this.source = source;
					this.persist(source);
				},
				onSave: source => this.saveNote(source),
				onError: message => {
					new Notice(message);
				},
			});
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			this.contentEl.createEl('p', { text: `Could not open the editor: ${message}` });
			new Notice(message);
		}
	}

	private async saveNote(source: string): Promise<void> {
		if (this.savingNote) return;
		this.savingNote = true;

		try {
			const stem = `TikZ diagram ${Date.now()}`;
			let path = `${stem}.md`,
				index = 1;
			while (this.app.vault.getAbstractFileByPath(path)) path = `${stem} ${index++}.md`;

			const longest = Math.max(0, ...(source.match(/`+/g) ?? []).map(run => run.length));
			const fence = '`'.repeat(Math.max(3, longest + 1));
			const file = await this.app.vault.create(path, `${fence}tikz\n${source}\n${fence}\n`);

			new Notice(`Diagram saved to ${file.path}`);
		} finally {
			this.savingNote = false;
		}
	}

	disposeEditor(): void {
		this.editor?.dispose();
		this.editor = null;
		this.contentEl.empty();
	}

	onClose(): Promise<void> {
		this.disposeEditor();
		return Promise.resolve();
	}
}
