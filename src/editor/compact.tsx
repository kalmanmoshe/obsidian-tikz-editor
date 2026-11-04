import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  CanvasPanel, SourcePanel, useEditorStore, createEditorSession, useEditorComputation,
  deleteSelection, editorActiveElement, editorOwnsEvent, sourceEditorHistoryFor,
  type ToolMode, type SourceEditorHistory,
} from '@tikz-editor/app/embedding';
import '@tikz-editor/app/embedding/styles.css';
import './compact.css';

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
  const [saving, setSaving] = useState(false);
  const error = useEditorComputation(options.onError);
  const lastSourceEditor = useRef<SourceEditorHistory | null>(null);
  useEffect(() => { options.onChange(source); }, [options, source]);

  function history(forward: boolean): void {
    const focused = editorActiveElement();
    const cm = focused?.closest('.cm-editor');
    const view = sourceEditorHistoryFor(focused) ?? lastSourceEditor.current;
    if (view && showSource && (!focused || cm || focused.closest('.compact-toolbar'))) {
      if (forward) view.redo(); else view.undo();
      view.focus();
    } else dispatch({ type: forward ? 'REDO' : 'UNDO' });
  }
  function remove(): void {
    const s = useEditorStore.getState();
    if (s.snapshot.source !== s.source) return;
    deleteSelection({ source: s.source, documentId: s.activeDocumentId, sourceRevision: s.sourceRevision,
      activeRootId: s.activeRootId, snapshotSource: s.snapshot.source,
      scene: s.snapshot.semanticResult?.scene ?? null, editHandles: s.snapshot.editHandles,
      selectedElementIds: s.selectedElementIds, dispatch: s.dispatch });
  }
  async function save(): Promise<void> {
    if (saving) return;
    setSaving(true);
    try { await options.onSave(useEditorStore.getState().source); }
    catch (error_) { options.onError(error_ instanceof Error ? error_.message : String(error_)); }
    finally { setSaving(false); }
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!editorOwnsEvent(event)) return;
      const target = editorActiveElement();
      const typing = target?.closest('input, textarea, [contenteditable="true"], .cm-editor');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); event.stopPropagation(); void save(); return;
      }
      if (typing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); event.stopPropagation(); dispatch({ type: event.shiftKey ? 'REDO' : 'UNDO' });
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); event.stopPropagation(); remove();
      } else if (event.key === 'Escape') dispatch({ type: 'SET_TOOL_MODE', mode: 'select' });
    };
    host.addEventListener('keydown', onKey);
    return () => { host.removeEventListener('keydown', onKey); };
  });
  const tools: { label: string; mode: ToolMode }[] = [
    { label: 'Select', mode: 'select' }, 
    { label: 'Node', mode: 'addNode' },
    { label: 'Arrow', mode: 'addArrow' }, 
    { label: 'Rectangle', mode: 'addRect' },
    { label: 'Circle', mode: 'addCircle' },
    { label: 'Free hand', mode: 'addFreehand' },
  ];
  return <div className="compact-shell" onFocusCapture={event => {
    const cm = event.target.closest('.cm-editor');
    if (cm) lastSourceEditor.current = sourceEditorHistoryFor(cm);
    else if (!event.target.closest('.compact-toolbar')) lastSourceEditor.current = null;
  }}>
    <div className="compact-toolbar" role="toolbar" aria-label="Drawing tools">
      {tools.map(tool => <button type="button" key={tool.mode} aria-pressed={mode === tool.mode}
        onClick={() => { lastSourceEditor.current = null; dispatch({ type: 'SET_TOOL_MODE', mode: tool.mode }); }}>{tool.label}</button>)}
      <span className="compact-separator" />
      <button type="button" onClick={() => { history(false); }}>Undo</button><button type="button" onClick={() => { history(true); }}>Redo</button>
      <button type="button" disabled={!selected || snapshot.source !== source} onClick={remove}>Delete</button>
      <button type="button" onClick={() => { dispatch({ type: 'REQUEST_FIT_TO_CONTENT' }); }}>Fit</button>
    </div>
    <div className="compact-canvas"><CanvasPanel /></div>
    <div className="compact-footer">
      <button type="button" aria-expanded={showSource} onClick={() => { setShowSource(value => !value); }}>{showSource ? 'Hide source' : 'Edit source'}</button>
      <span role="status">{error ? 'Preview error — source retained' : snapshot.source !== source ? 'Rendering…' : 'Drag to move · double-click a label to edit'}</span>
      <button type="button" className="compact-save" disabled={saving} onClick={() => { void save(); }}>{saving ? 'Saving…' : 'Save as note'}</button>
    </div>
    {showSource ? <div className="compact-source"><SourcePanel /></div> : null}
    {error ? <div className="compact-error" role="alert">{error}</div> : null}
  </div>;
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
        save: (key, value) => { memory.set(key, value); },
      },
      clipboard: {
        readText: () => navigator.clipboard.readText(),
        writeText: text => navigator.clipboard.writeText(text),
      },
    },
  });
  host.ownerDocument.body.appendChild(overlays);
  if (useEditorStore.getState().showRulers) useEditorStore.getState().dispatch({ type: 'TOGGLE_CANVAS_AID', aid: 'rulers' });
  const setTheme = (dark: boolean) => {
    host.dataset.colorScheme = dark ? 'dark' : 'light';
    overlays.dataset.colorScheme = host.dataset.colorScheme;
  };
  setTheme(options.dark);
  const root = createRoot(host);
  flushSync(() => { root.render(<CompactEditor host={host} options={options} />); });
  let disposed = false;
  return { getSource: () => session.getSource(), setTheme, dispose: () => {
    if (disposed) return;
    disposed = true;
    options.onChange(useEditorStore.getState().source);
    try { root.unmount(); session.dispose(); } finally { overlays.remove(); }
  } };
}
