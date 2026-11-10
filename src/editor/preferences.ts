import type { CanvasPreferences } from '@tikz-editor/app/store/types';

const preferenceKeys = [
	'canvasViewPreferences',
	'showDocumentBounds',
	'showGuides',
	'showTransparencyGrid',
	'snapModes',
] as const satisfies readonly (keyof CanvasPreferences)[];

type Listener = (preferences: CanvasPreferences) => void;

export class EditorPreferences {
	private current: CanvasPreferences;
	private readonly listeners = new Set<Listener>();

	constructor(saved: unknown, private readonly onChange: () => void) {
		this.current = readPreferences(saved);
	}

	get(): CanvasPreferences {
		return this.current;
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

function readPreferences(value: unknown): CanvasPreferences {
	const saved = asRecord(value);
	const canvas = asRecord(saved.canvasViewPreferences);
	const snap = asRecord(saved.snapModes);

	return {
		canvasViewPreferences: {
			tikz: readViewPreferences(canvas.tikz, true),
			beamer: readViewPreferences(canvas.beamer, false),
		},
		showDocumentBounds: readBoolean(saved.showDocumentBounds, true),
		showGuides: readBoolean(saved.showGuides, true),
		showTransparencyGrid: readBoolean(saved.showTransparencyGrid, false),
		snapModes: {
			grid: readBoolean(snap.grid, true),
			guides: readBoolean(snap.guides, true),
			points: readBoolean(snap.points, true),
			gaps: readBoolean(snap.gaps, true),
		},
	};
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
