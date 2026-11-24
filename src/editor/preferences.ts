import type { CanvasPreferences, CanvasTransform } from '@tikz-editor/app/store/types';

const preferenceKeys = [
	'canvasViewPreferences',
	'showDocumentBounds',
	'showGuides',
	'showTransparencyGrid',
	'snapModes',
	'fitToContentModeActive',
] as const satisfies readonly (keyof CanvasPreferences)[];

type SavedEditorPreferences = CanvasPreferences & {
	canvasViewports: Record<string, CanvasTransform>;
};

type Listener = (preferences: CanvasPreferences) => void;

export class EditorPreferences {
	private current: SavedEditorPreferences;
	private readonly listeners = new Set<Listener>();

	constructor(saved: unknown, private readonly onChange: () => void) {
		this.current = readPreferences(saved);
	}

	get(): SavedEditorPreferences {
		return this.current;
	}

	getViewport(key: string): CanvasTransform | null {
		const transform = this.current.canvasViewports[key];
		return transform ? { ...transform } : null;
	}

	setViewport(key: string, transform: CanvasTransform): void {
		const previous = this.current.canvasViewports[key];
		if (previous?.scale === transform.scale &&
			previous.translateX === transform.translateX && previous.translateY === transform.translateY) return;
		this.current = {
			...this.current,
			canvasViewports: { ...this.current.canvasViewports, [key]: { ...transform } },
		};
		// Viewports belong to individual diagrams; do not pan other open editors.
		this.onChange();
	}

	updateFromEditor(next: CanvasPreferences, previous: CanvasPreferences, origin: Listener): void {
		let patch: Partial<CanvasPreferences> | undefined;
		for (const key of preferenceKeys) {
			if (next[key] === previous[key] || next[key] === this.current[key]) continue;
			patch = { ...patch, [key]: next[key] };
		}
		if (!patch) return;

		this.current = { ...this.current, ...patch };
		this.onChange();
		for (const listener of this.listeners) {
			if (listener !== origin) listener(this.current);
		}
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
}

function readPreferences(value: unknown): SavedEditorPreferences {
	const saved = asRecord(value);
	const canvas = asRecord(saved.canvasViewPreferences);
	const snap = asRecord(saved.snapModes);

	return {
		canvasViewports: readViewports(saved.canvasViewports),
		canvasViewPreferences: {
			tikz: readViewPreferences(canvas.tikz, true),
			beamer: readViewPreferences(canvas.beamer, false),
		},
		showDocumentBounds: readBoolean(saved.showDocumentBounds, true),
		showGuides: readBoolean(saved.showGuides, true),
		showTransparencyGrid: readBoolean(saved.showTransparencyGrid, false),
		fitToContentModeActive: readBoolean(saved.fitToContentModeActive, false),
		snapModes: {
			grid: readBoolean(snap.grid, true),
			guides: readBoolean(snap.guides, true),
			points: readBoolean(snap.points, true),
			gaps: readBoolean(snap.gaps, true),
		},
	};
}

function readViewports(value: unknown): Record<string, CanvasTransform> {
	return Object.fromEntries(Object.entries(asRecord(value)).flatMap(([key, value]) => {
		const { scale, translateX, translateY } = asRecord(value);
		if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0 ||
			typeof translateX !== 'number' || !Number.isFinite(translateX) ||
			typeof translateY !== 'number' || !Number.isFinite(translateY)) return [];
		return [[key, { scale, translateX, translateY }]];
	}));
}

function readViewPreferences(value: unknown, defaultGrid: boolean) {
	const saved = asRecord(value);
	return {
		showGrid: readBoolean(saved.showGrid, defaultGrid),
		showRulers: readBoolean(saved.showRulers, false),
	};
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}
