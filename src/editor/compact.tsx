import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
	CanvasPanel,
	SourcePanel,
	InspectorPanel,
	useEditorStore,
	createEditorSession,
	useEditorComputation,
	deleteSelection,
	editorActiveElement,
	editorOwnsEvent,
	sourceEditorHistoryFor,
	type ToolMode,
	type SourceEditorHistory,
} from '@tikz-editor/app/embedding';
import './host-reset.css';
import '@tikz-editor/app/embedding/styles.css';
import './compact.css';
import { EditorIcon, type EditorIconName } from './icons';

export const DEFAULT_COMPACT_SOURCE = String.raw`\begin{tikzpicture}
  \node[draw, rounded corners, minimum width=1.2cm, minimum height=0.8cm] (A) at (0,0) {$A$};
  \node[draw, circle, minimum size=0.8cm] (B) at (3,0) {$B$};
  \draw[->, thick] (A) -- node[above] {$p$} (B);
\end{tikzpicture}`;

export interface CompactEditorOptions {
	source?: string;
	dark: boolean;
	onChange: (source: string) => void;
	onSave: (source: string) => Promise<void>;
	onError: (message: string) => void;
}

export interface CompactEditorHandle {
	getSource(): string;
	setTheme(dark: boolean): void;
	dispose(): void;
}

function CompactEditor({ host, options }: { host: HTMLElement; options: CompactEditorOptions }) {
	const source = useEditorStore(s => s.source);
	const mode = useEditorStore(s => s.toolMode);
	const snapshot = useEditorStore(s => s.snapshot);
	const selected = useEditorStore(s => s.selectedElementIds.size);
	const dispatch = useEditorStore(s => s.dispatch);
	const [showSource, setShowSource] = useState(false);
	const [showInspector, setShowInspector] = useState(true);
	const [saving, setSaving] = useState(false);
	const error = useEditorComputation(options.onError);
	const lastSourceEditor = useRef<SourceEditorHistory | null>(null);
	useEffect(() => {
		options.onChange(source);
	}, [options, source]);

	function history(forward: boolean): void {
		const focused = editorActiveElement();
		const cm = focused?.closest('.cm-editor');
		const view = sourceEditorHistoryFor(focused) ?? lastSourceEditor.current;
		if (view && showSource && (!focused || cm || focused.closest('.compact-toolbar'))) {
			if (forward) view.redo();
			else view.undo();
			view.focus();
		} else dispatch({ type: forward ? 'REDO' : 'UNDO' });
	}

	function remove(): void {
		const s = useEditorStore.getState();
		if (s.snapshot.source !== s.source) return;
		deleteSelection({
			source: s.source,
			documentId: s.activeDocumentId,
			sourceRevision: s.sourceRevision,
			activeRootId: s.activeRootId,
			snapshotSource: s.snapshot.source,
			scene: s.snapshot.semanticResult?.scene ?? null,
			editHandles: s.snapshot.editHandles,
			selectedElementIds: s.selectedElementIds,
			dispatch: s.dispatch,
		});
	}

	async function save(): Promise<void> {
		if (saving) return;
		setSaving(true);
		try {
			await options.onSave(useEditorStore.getState().source);
		} catch (error_) {
			options.onError(error_ instanceof Error ? error_.message : String(error_));
		} finally {
			setSaving(false);
		}
	}

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (!editorOwnsEvent(event)) return;
			const target = editorActiveElement();
			const typing = target?.closest('input, textarea, [contenteditable="true"], .cm-editor');
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
				event.preventDefault();
				event.stopPropagation();
				void save();
				return;
			}
			if (typing) return;
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
				event.preventDefault();
				event.stopPropagation();
				dispatch({ type: event.shiftKey ? 'REDO' : 'UNDO' });
			} else if (event.key === 'Delete' || event.key === 'Backspace') {
				event.preventDefault();
				event.stopPropagation();
				remove();
			} else if (event.key === 'Escape') dispatch({ type: 'SET_TOOL_MODE', mode: 'select' });
		};
		host.addEventListener('keydown', onKey);
		return () => {
			host.removeEventListener('keydown', onKey);
		};
	});

	const tools: { label: string; tooltip?: string; mode: ToolMode; icon: EditorIconName }[] = [
		{ label: 'Select', mode: 'select', icon: 'select' },
		{ label: 'Node', mode: 'addNode', icon: 'node' },
		{ label: 'Line / path', 
			tooltip: 'Line / path: drag for a line; click to add path points. Enter, Esc or double-click to finish.', mode: 'addLine', icon: 'line' 
		},
		{ label: 'Arrow', mode: 'addArrow', icon: 'arrow' },
		{ label: 'Rectangle', mode: 'addRect', icon: 'rectangle' },
		{ label: 'Circle', mode: 'addCircle', icon: 'circle' },
		{ label: 'Free hand',
			tooltip: 'Free hand: draw and hold still to recognize shapes.', 
			mode: 'addFreehand', icon: 'freehand' 
		},
	];

	return (
		<div
			className="compact-shell"
			onFocusCapture={event => {
				const cm = event.target.closest('.cm-editor');
				if (cm) lastSourceEditor.current = sourceEditorHistoryFor(cm);
				else if (!event.target.closest('.compact-toolbar')) lastSourceEditor.current = null;
			}}
		>
			<div className="compact-workspace" data-canvas-fit-surface>
			<div className="compact-toolbar" data-canvas-fit-obstacle role="toolbar" aria-label="Drawing tools">
				<div className="compact-toolstrip">
					{tools.map(tool => (
						<button
							type="button"
							key={tool.mode}
							aria-label={tool.label}
							title={tool.tooltip ?? tool.label}
							aria-pressed={mode === tool.mode || (tool.mode === 'addLine' && mode === 'addPath')}
							onClick={() => {
								lastSourceEditor.current = null;
								dispatch({ type: 'SET_TOOL_MODE', mode: tool.mode });
							}}
						>
							<EditorIcon name={tool.icon} />
						</button>
					))}
					<span className="compact-separator" />
					<button
						type="button"
						aria-label="Undo"
						title="Undo"
						onClick={() => {
							history(false);
						}}
					>
						<EditorIcon name="undo" />
					</button>
					<button
						type="button"
						aria-label="Redo"
						title="Redo"
						onClick={() => {
							history(true);
						}}
					>
						<EditorIcon name="redo" />
					</button>
					<button
						type="button"
						aria-label="Delete"
						title="Delete selection"
						disabled={!selected || snapshot.source !== source}
						onClick={remove}
					>
						<EditorIcon name="delete" />
					</button>
					<button
						type="button"
						aria-label="Fit"
						title="Fit to content"
						onClick={() => {
							dispatch({ type: 'REQUEST_FIT_TO_CONTENT' });
						}}
					>
						<EditorIcon name="fit" />
					</button>
				</div>
				<span className="compact-separator" />
				<button
					type="button"
					aria-label="Inspector"
					title="Toggle inspector"
					aria-expanded={showInspector}
					onClick={() => {
						setShowInspector(value => !value);
					}}
				>
					<EditorIcon name="inspector" />
				</button>
			</div>
				<div className="compact-canvas">
					<CanvasPanel />
				</div>
				{showInspector ? (
					<aside className="compact-inspector" data-canvas-fit-obstacle aria-label="Inspector">
						<div className="compact-panel-heading">
							<span>Inspector</span>
							<button
								type="button"
								aria-label="Close inspector"
								onClick={() => {
									setShowInspector(false);
								}}
							>
								&times;
							</button>
						</div>
						<div className="compact-inspector-content">
							<InspectorPanel />
						</div>
					</aside>
				) : null}
			</div>
			<div className="compact-footer">
				<button
					type="button"
					aria-label={showSource ? 'Hide source' : 'Edit source'}
					title="Toggle TikZ source"
					aria-expanded={showSource}
					onClick={() => {
						setShowSource(value => !value);
					}}
				>
					<EditorIcon name="code" />
				</button>
				<span role="status">
					{error
						? 'Preview error — source retained'
						: snapshot.source !== source
							? 'Rendering…'
							: 'Drag to move · double-click a label to edit'}
				</span>
			</div>
			{showSource ? (
				<div className="compact-source">
					<SourcePanel />
				</div>
			) : null}
			{error ? (
				<div className="compact-error" role="alert">
					{error}
				</div>
			) : null}
		</div>
	);
}

export function mountCompactEditor(host: HTMLElement, options: CompactEditorOptions): CompactEditorHandle {
	const overlays = host.ownerDocument.createElement('div');
	overlays.className = 'tikz-editor-root tikz-editor-overlays';
	const memory = new Map<string, string>();

	const session = createEditorSession({
		source: options.source ?? DEFAULT_COMPACT_SOURCE,
		host: { root: host, overlayRoot: overlays, documentationEnabled: false },
		platform: {
			id: 'obsidian-compact',
			persistence: {
				load: key => memory.get(key) ?? null,
				save: (key, value) => {
					memory.set(key, value);
				},
			},
			clipboard: {
				readText: () => navigator.clipboard.readText(),
				writeText: text => navigator.clipboard.writeText(text),
			},
		},
	});

	host.ownerDocument.body.appendChild(overlays);
	if (useEditorStore.getState().showRulers) {
		useEditorStore.getState().dispatch({ type: 'TOGGLE_CANVAS_AID', aid: 'rulers' });
	}

	const setTheme = (dark: boolean) => {
		host.dataset.colorScheme = dark ? 'dark' : 'light';
		overlays.dataset.colorScheme = host.dataset.colorScheme;
	};
	setTheme(options.dark);

	const root = createRoot(host);
	flushSync(() => {
		root.render(<CompactEditor host={host} options={options} />);
	});
	let disposed = false;

	return {
		getSource: () => session.getSource(),
		setTheme,
		dispose: () => {
			if (disposed) return;
			disposed = true;

			options.onChange(useEditorStore.getState().source);

			try {
				root.unmount();
				session.dispose();
			} finally {
				overlays.remove();
			}
		},
	};
}
