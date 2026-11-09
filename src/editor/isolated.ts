import { createEditorRuntime } from 'virtual:isolated-editor';
import type { CompactEditorHandle, CompactEditorOptions } from './compact';
export type { CompactEditorHandle } from './compact';

/** Each mount owns its store, history, platform, React runtime and popup host. */
export function mountCompactEditor(host: HTMLElement, options: CompactEditorOptions): CompactEditorHandle {
	return createEditorRuntime().mountCompactEditor(host, options);
}
