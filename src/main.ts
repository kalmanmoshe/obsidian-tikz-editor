import { Plugin } from 'obsidian';
import { TikzEditorView, VIEW_TYPE_TIKZ_EDITOR } from './view';

export default class TikzEditorPlugin extends Plugin {
	onload(): void {
		this.registerView(VIEW_TYPE_TIKZ_EDITOR, leaf => new TikzEditorView(leaf));
		this.addCommand({
			id: 'open-editor',
			// Keep the requested command label and TikZ brand capitalization.
			name: 'Open TikZ editor',
			callback: async () => {
				const workspace = this.app.workspace;
				const leaf = workspace.getLeavesOfType(VIEW_TYPE_TIKZ_EDITOR)[0]
					?? workspace.getLeaf('tab');
				await leaf.setViewState({ type: VIEW_TYPE_TIKZ_EDITOR, active: true });
				await workspace.revealLeaf(leaf);
			},
		});
	}
}

