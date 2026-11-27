import { Component, Notice, type MarkdownView, type TFile } from 'obsidian';
import type TikzEditorPlugin from '../main';
import { mountCompactEditor, type CompactEditorHandle } from '../editor/isolated';
import type { EditorPreferences } from '../editor/preferences';
import { FenceEditContext } from './fenceEditContext';

/** Owns an overlay in the existing Markdown view; never changes its leaf or view state. */
export class CodeBlockEditorPane extends Component {
	private editor: CompactEditorHandle | null = null;
	private overlay: HTMLElement | null = null;
	private source = '';
	private savedSource = '';
	private originalSource = '';
	private liveEditing: boolean;
	private cancelled = false;
	private closed = false;
	private status: HTMLElement | null = null;
	private file: TFile | null;

	constructor(
		private plugin: TikzEditorPlugin,
		private context: FenceEditContext,
		private view: MarkdownView,
		private preferences: EditorPreferences,
	) {
		super();
		this.file = view.file;
		this.liveEditing = plugin.settings.liveEditing;
	}

	onload(): void {
		const data = this.context.getFenceData();
		if (!data || this.view.editor !== this.context.getEditor()) return;
		this.source = this.savedSource = this.originalSource = data.content;
		const content = this.view.contentEl;
		content.addClass('tikz-editor-pane-covered');
		this.overlay = content.createDiv({ cls: 'tikz-editor-pane-overlay' });
		const bar = this.overlay.createDiv({ cls: 'tikz-editor-pane-bar' });
		// Share the note's navigation row instead of reserving another row above the canvas.
		const header = this.view.containerEl.querySelector<HTMLElement>(':scope > .view-header');
		if (header) {
			header.addClass('tikz-editor-pane-header');
			header.insertBefore(bar, header.querySelector(':scope > .view-actions'));
			this.register(() => {
				bar.remove();
				header.removeClass('tikz-editor-pane-header');
			});
		}
		this.status = bar.createSpan({ attr: { role: 'status' } });
		this.updateStatus();
		const cancel = bar.createEl('button', { text: 'Cancel' });
		this.registerDomEvent(cancel, 'click', () => this.cancel());
		const confirm = bar.createEl('button', { text: 'Confirm', cls: 'mod-cta' });
		this.registerDomEvent(confirm, 'click', () => {
			if (!this.editor) return;
			try {
				this.confirm(this.editor.getSource());
			} catch (error) {
				this.report(error);
			}
		});
		const frame = this.overlay.createDiv({ cls: 'tikz-editor-pane-frame' });
		const host = frame.createDiv({ cls: 'tikz-editor-root' });
		try {
			this.editor = mountCompactEditor(host, {
				source: data.content,
				dark: content.ownerDocument.body.hasClass('theme-dark'),
				preferences: this.preferences,
				viewportKey: this.context.getViewportKey(),
				onChange: source => {
					if (this.closed) return;
					this.source = source;
					try {
						if (this.liveEditing) this.save(source);
						else this.updateStatus();
					} catch (error) {
						this.report(error);
					}
				},
				onSave: source => {
					this.confirm(source);
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

	setLiveEditing(enabled: boolean): void {
		if (this.closed) return;
		this.liveEditing = enabled;
		this.source = this.editor?.getSource() ?? this.source;
		try {
			if (enabled) this.save(this.source);
			this.updateStatus();
		} catch (error) {
			this.report(error);
		}
	}

	private confirm(source: string): void {
		if (this.closed) return;
		this.save(source);
		this.close();
		this.view.editor.focus();
	}

	private cancel(): void {
		if (this.closed) return;
		try {
			// In live mode, roll back only our changes using the same conflict checks as saving.
			this.save(this.originalSource);
			this.cancelled = true;
			this.close();
			this.view.editor.focus();
		} catch (error) {
			this.report(error);
		}
	}

	private save(source: string): void {
		this.source = source;
		if (source === this.savedSource) return;
		this.context.replaceFenceContent(source);
		this.savedSource = source;
		this.updateStatus();
	}

	private updateStatus(): void {
		this.setStatus(this.liveEditing
			? 'Live editing on · Cancel to undo changes'
			: 'Confirm to apply changes · Cancel to discard');
	}

	private report(error: unknown): void {
		this.setStatus(error instanceof Error ? error.message : String(error));
	}

	private setStatus(message: string): void {
		if (!this.status) return;
		this.status.textContent = message;
		this.status.title = message;
	}

	close(): void {
		this.unload();
	}

	onunload(): void {
		if (this.closed) return;
		// Capture the latest store value even if React has not run its change effect yet.
		const source = this.editor?.getSource() ?? this.source;
		if (this.liveEditing && !this.cancelled) {
			try {
				this.save(source);
			} catch {
				/* Preserve conflicting edits below. */
			}
		}
		this.closed = true;
		this.editor?.dispose();
		this.editor = null;
		this.overlay?.remove();
		this.overlay = null;
		this.view.contentEl.removeClass('tikz-editor-pane-covered');
		if (!this.cancelled && source !== this.savedSource) void this.recover(source);
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
