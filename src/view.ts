import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import { mountCompactEditor, type CompactEditorHandle } from './editor/compact';

export const VIEW_TYPE_TIKZ_EDITOR = 'tikz-editor-view';
export class TikzEditorView extends ItemView {
	private editor: CompactEditorHandle | null = null;
	private resizeObserver: ResizeObserver | null = null;

	constructor(
		leaf: WorkspaceLeaf, 
		private source: string | undefined,
		private persist: (source: string) => void
	) { 
		super(leaf); 
	}

	getViewType(): string { return VIEW_TYPE_TIKZ_EDITOR; }
	getDisplayText(): string { return 'Diagram editor'; }
	getIcon(): string { return 'shapes'; }

	onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('tikz-editor-pane');
		try {
			const host = this.contentEl.createDiv({ cls: 'tikz-editor-root' });
			const resize = (): void => {
				const pane = this.containerEl.getBoundingClientRect();
				const content = this.contentEl.getBoundingClientRect();
				host.style.height = `${Math.max(0, pane.bottom - content.top)}px`;
			};
			this.resizeObserver = new ResizeObserver(resize);
			this.resizeObserver.observe(this.containerEl);
			resize();
			this.editor = mountCompactEditor(host, {
				...(this.source === undefined ? {} : { source: this.source }), dark: this.contentEl.ownerDocument.body.hasClass('theme-dark'),
				onChange: source => { this.source = source; this.persist(source); },
				onSave: source => this.saveNote(source), onError: message => { new Notice(message); },
			});
			this.registerEvent(this.app.workspace.on('css-change', () => {
				this.editor?.setTheme(this.contentEl.ownerDocument.body.hasClass('theme-dark'));
			}));
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			this.contentEl.createEl('p', { text: `Could not open the editor: ${message}` });
			new Notice(message);
		}
		return Promise.resolve();
	}

	private async saveNote(source: string): Promise<void> {
		const stem = `TikZ diagram ${Date.now()}`;
		let path = `${stem}.md`, index = 1;
		while (this.app.vault.getAbstractFileByPath(path)) path = `${stem} ${index++}.md`;
		const longest = Math.max(0, ...(source.match(/`+/g) ?? []).map(run => run.length));
		const fence = '`'.repeat(Math.max(3, longest + 1));
		const file = await this.app.vault.create(path, `${fence}tikz\n${source}\n${fence}\n`);
		new Notice(`Diagram saved to ${file.path}`);
	}

	disposeEditor(): void {
		this.resizeObserver?.disconnect(); this.resizeObserver = null;
		this.editor?.dispose(); this.editor = null;
		this.contentEl.empty();
	}

	onClose(): Promise<void> {
		this.disposeEditor();
		return Promise.resolve();
	}
}
