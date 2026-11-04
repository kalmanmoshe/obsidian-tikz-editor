import { Plugin, Notice } from 'obsidian';
import { TikzEditorView, VIEW_TYPE_TIKZ_EDITOR } from './view';

interface DraftData { source?: string; legacyDiagram?: unknown }
export default class TikzEditorPlugin extends Plugin {
	private draft: DraftData = {};
	private writes: Promise<void> = Promise.resolve();
	private timer: number | null = null;

	async onload(): Promise<void> {
		const data: unknown = await this.loadData();
		if (data && typeof data === 'object') {
			const record = data as Record<string, unknown>;
			this.draft = typeof record.source === 'string' ? { ...record, source: record.source } : { legacyDiagram: data };
		}
		const saveDraft = (source: string): void => {
			this.draft.source = source;
			if (this.timer) window.clearTimeout(this.timer);
			this.timer = window.setTimeout(() => { this.timer = null; this.flushDraft(); }, 350);
		};
		this.register(() => { if (this.timer) window.clearTimeout(this.timer); this.flushDraft(); });
		this.registerView(VIEW_TYPE_TIKZ_EDITOR, leaf => new TikzEditorView(leaf,
			this.draft.source, saveDraft));
		this.addCommand({ id: 'open-editor', name: 'Open diagram editor', callback: async () => {
			const workspace = this.app.workspace;
			const leaf = workspace.getLeavesOfType(VIEW_TYPE_TIKZ_EDITOR)[0] ?? workspace.getLeaf('tab');
			await leaf.setViewState({ type: VIEW_TYPE_TIKZ_EDITOR, active: true });
			await workspace.revealLeaf(leaf);
		} });
	}

	private flushDraft(): void {
		const data = { ...this.draft };
		this.writes = this.writes.catch(() => {}).then(() => this.saveData(data));
		void this.writes.catch(() => { new Notice('Could not save the diagram draft. Save it as a note before closing.'); });
	}

	onunload(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TIKZ_EDITOR)) {
			if (leaf.view instanceof TikzEditorView) leaf.view.disposeEditor();
		}
	}
}