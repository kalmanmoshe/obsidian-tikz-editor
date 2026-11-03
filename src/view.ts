import { ItemView } from 'obsidian';

export const VIEW_TYPE_TIKZ_EDITOR = 'tikz-editor-view';

export class TikzEditorView extends ItemView {
	getViewType(): string {
		return VIEW_TYPE_TIKZ_EDITOR;
	}

	getDisplayText(): string {
		return 'TikZ Editor';
	}

	onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.createEl('p', { text: 'TikZ Editor integration starts here.' });
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.contentEl.empty();
		return Promise.resolve();
	}
}

