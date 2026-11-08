import { Component, Notice, type MarkdownView, type TFile } from 'obsidian';
import type TikzEditorPlugin from '../main';
import { mountCompactEditor, type CompactEditorHandle } from '../editor/compact';
import { TikzEditorView, VIEW_TYPE_TIKZ_EDITOR } from '../view';
import { FenceEditContext } from './fenceEditContext';

/** Owns an overlay in the existing Markdown view; never changes its leaf or view state. */
export class CodeBlockEditorPane extends Component {
	private editor: CompactEditorHandle | null = null;
	private overlay: HTMLElement | null = null;
	private suspended: TikzEditorView[] = [];
	private source = '';
	private savedSource = '';
	private closed = false;
	private status: HTMLElement | null = null;
	private file: TFile | null;

	constructor(
		private plugin: TikzEditorPlugin,
		private context: FenceEditContext,
		private view: MarkdownView,
	) {
		super();
		this.file = view.file;
	}

	onload(): void {
		const data = this.context.getFenceData();
		if (!data || this.view.editor !== this.context.getEditor()) return;
		this.source = this.savedSource = data.content;
		const content = this.view.contentEl;
		content.addClass('tikz-editor-pane-covered');
		this.overlay = content.createDiv({ cls: 'tikz-editor-pane-overlay' });
		const bar = this.overlay.createDiv({ cls: 'tikz-editor-pane-bar' });
		this.status = bar.createSpan({ text: 'Changes save to this code block', attr: { role: 'status' } });
		const done = bar.createEl('button', { text: 'Done', cls: 'mod-cta' });
		this.registerDomEvent(done, 'click', () => {
			if (!this.editor) return;
			try {
				this.save(this.editor.getSource());
				this.close();
				this.view.editor.focus();
			} catch (error) {
				this.report(error);
			}
		});
		const frame = this.overlay.createDiv({ cls: 'tikz-editor-pane-frame' });
		const host = frame.createDiv({ cls: 'tikz-editor-root' });
		try {
			// The upstream store allows one session; retain existing diagram pane drafts.
			for (const leaf of this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_TIKZ_EDITOR)) {
				if (leaf.view instanceof TikzEditorView) {
					this.suspended.push(leaf.view);
					leaf.view.disposeEditor();
				}
			}
			this.editor = mountCompactEditor(host, {
				source: data.content,
				dark: content.ownerDocument.body.hasClass('theme-dark'),
				onChange: source => {
					if (this.closed) return;
					this.source = source;
					try {
						this.save(source);
					} catch (error) {
						this.report(error);
					}
				},
				onSave: source => {
					this.save(source);
					return Promise.resolve();
				},
				onError: message => {
					new Notice(message);
				},
			});
			this.registerEvent(
				this.plugin.app.workspace.on('css-change', () => {
					this.editor?.setTheme(content.ownerDocument.body.hasClass('theme-dark'));
				}),
			);
			const checkView = () => {
				const open = this.plugin.app.workspace.getLeavesOfType('markdown');
				if (this.view.file !== this.file || !open.some(leaf => leaf.view === this.view)) this.close();
			};
			this.registerEvent(this.plugin.app.workspace.on('file-open', checkView));
			this.registerEvent(this.plugin.app.workspace.on('layout-change', checkView));
		} catch (error) {
			this.close();
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	private save(source: string): void {
		this.source = source;
		if (source === this.savedSource) return;
		this.context.replaceFenceContent(source);
		this.savedSource = source;
		if (this.status) this.status.textContent = 'Saved to code block';
	}

	private report(error: unknown): void {
		if (this.status) this.status.textContent = error instanceof Error ? error.message : String(error);
	}

	close(): void {
		this.unload();
	}

	onunload(): void {
		if (this.closed) return;
		// Capture the latest store value even if React has not run its change effect yet.
		const source = this.editor?.getSource() ?? this.source;
		try {
			this.save(source);
		} catch {
			/* Preserve conflicting edits below. */
		}
		this.closed = true;
		this.editor?.dispose();
		this.editor = null;
		this.overlay?.remove();
		this.overlay = null;
		this.view.contentEl.removeClass('tikz-editor-pane-covered');
		const open = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_TIKZ_EDITOR);
		for (const view of this.suspended) {
			if (open.some(leaf => leaf.view === view)) view.resumeEditor();
		}
		this.suspended = [];
		if (source !== this.savedSource) void this.recover(source);
	}

	private async recover(source: string): Promise<void> {
		// Navigation or a concurrent note edit must not silently discard the working copy.
		const fence = '`'.repeat(Math.max(3, ...(source.match(/`+/g) ?? []).map(run => run.length + 1)));
		const path = `TikZ recovery ${Date.now()}.md`;
		try {
			await this.plugin.app.vault.create(path, `${fence}tikz\n${source}\n${fence}\n`);
			new Notice(`Unsaved diagram preserved in ${path}`);
		} catch (error) {
			new Notice(`Could not preserve diagram: ${error instanceof Error ? error.message : String(error)}`, 0);
		}
	}
}
