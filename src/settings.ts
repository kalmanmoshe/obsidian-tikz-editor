import { PluginSettingTab, Setting } from 'obsidian';
import type TikzEditorPlugin from './main';

export interface TikzEditorSettings {
	liveEditing: boolean;
}

export function readSettings(value: unknown): TikzEditorSettings {
	const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
	return { liveEditing: typeof saved.liveEditing === 'boolean' ? saved.liveEditing : false };
}

// Keep compatibility with Obsidian 1.7.2, before the declarative settings API.
export class TikzEditorSettingTab extends PluginSettingTab {
	constructor(private plugin: TikzEditorPlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName('Live editing')
			.setDesc('Apply code block changes to the note as you edit. Turn off to review changes before confirming. Cancel discards the session’s changes in either mode.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.liveEditing)
				.onChange(enabled => this.plugin.setLiveEditing(enabled)));
	}
}
