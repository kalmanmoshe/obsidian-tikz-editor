import { useEditorStore } from '@tikz-editor/app/embedding';
import type { CanvasPreferences } from '@tikz-editor/app/store/types';
import type { EditorPreferences } from './preferences';

/** Restore before mounting React, then retain each diagram's last viewport. */
export function bindEditorPreferences(preferences: EditorPreferences, viewportKey: string): () => void {
	const applyPreferences = (next: CanvasPreferences) => {
		useEditorStore.getState().dispatch({ type: 'SET_CANVAS_VIEW_PREFERENCES', preferences: next });
	};
	applyPreferences(preferences.get());
	const transform = preferences.getViewport(viewportKey);
	if (transform) useEditorStore.getState().dispatch({ type: 'SET_CANVAS_TRANSFORM', transform });

	const stopApplying = preferences.subscribe(applyPreferences);
	const stopPublishing = useEditorStore.subscribe((next, previous) => {
		preferences.updateFromEditor(next, previous, applyPreferences);
		if (next.canvasTransform !== previous.canvasTransform) {
			preferences.setViewport(viewportKey, next.canvasTransform);
		}
	});
	return () => {
		preferences.setViewport(viewportKey, useEditorStore.getState().canvasTransform);
		stopPublishing();
		stopApplying();
	};
}
