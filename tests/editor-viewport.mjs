import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';

const project = new URL('../', import.meta.url);
const require = createRequire(new URL('package.json', project));
const ts = require('typescript');
const plain = value => JSON.parse(JSON.stringify(value));
const first = { scale: 1.8, translateX: -130.25, translateY: 70.125 };
const second = { scale: 0.82, translateX: 25.5, translateY: -48.75 };

function evaluate(relative, dependencies = {}) {
	const exports = {};
	const source = fs.readFileSync(new URL(relative, project), 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	});
	vm.runInNewContext(outputText, {
		exports,
		require: name => {
			assert.ok(name in dependencies, `Unexpected import: ${name}`);
			return dependencies[name];
		},
	});
	return exports;
}

const { EditorPreferences } = evaluate('src/editor/preferences.ts');
const { FenceEditContext } = evaluate('src/codeBlockEditor/fenceEditContext.ts');

function makeStore() {
	const listeners = new Set();
	let state = {
		...new EditorPreferences(undefined, () => {}).get(),
		canvasTransform: { scale: 1, translateX: 0, translateY: 0 },
		dispatch(action) {
			if (action.type === 'SET_CANVAS_VIEW_PREFERENCES') setState(action.preferences);
			else if (action.type === 'SET_CANVAS_TRANSFORM') setState({ canvasTransform: action.transform });
			else assert.fail(`Unexpected action: ${action.type}`);
		},
	};
	function setState(patch) {
		const previous = state;
		state = { ...state, ...patch };
		for (const listener of listeners) listener(state, previous);
	}
	const store = {
		getState: () => state,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	const { bindEditorPreferences } = evaluate('src/editor/persistence.ts', {
		'@tikz-editor/app/embedding': { useEditorStore: store },
	});
	return { store, setState, listeners, bind: (preferences, key) => bindEditorPreferences(preferences, key) };
}

test('retains exact zoom and offsets through serialized plugin preferences', () => {
	let changes = 0;
	const preferences = new EditorPreferences({ fitToContentModeActive: false }, () => changes++);
	preferences.setViewport('draft', first);
	preferences.setViewport('note:block', second);
	preferences.setViewport('draft', { ...first });
	assert.equal(changes, 2);
	const restored = new EditorPreferences(plain(preferences.get()), () => {});
	assert.equal(restored.get().fitToContentModeActive, false);
	assert.deepEqual(plain(restored.getViewport('draft')), first);
	assert.deepEqual(plain(restored.getViewport('note:block')), second);
	assert.equal(restored.getViewport('new:block'), null);
});

test('older preference files without saved viewports remain valid', () => {
	const preferences = new EditorPreferences({ showGuides: false }, () => {});
	assert.equal(preferences.get().showGuides, false);
	assert.deepEqual(plain(preferences.get().canvasViewports), {});
	assert.equal(preferences.getViewport('draft'), null);
});

test('rejects malformed saved scale and offsets', () => {
	const invalid = [
		null, {}, { ...first, scale: 0 }, { ...first, scale: -1 },
		{ ...first, scale: Infinity }, { ...first, scale: NaN },
		{ ...first, scale: '1.8' }, { ...first, translateX: Infinity },
		{ ...first, translateY: NaN }, { ...first, translateY: '70' },
	];
	for (const transform of invalid) {
		const preferences = new EditorPreferences({ canvasViewports: { draft: transform } }, () => {});
		assert.equal(preferences.getViewport('draft'), null);
	}
});

test('viewport storage does not mutate caller values or broadcast to other canvases', () => {
	const preferences = new EditorPreferences(undefined, () => {});
	let notifications = 0;
	preferences.subscribe(() => notifications++);
	const transform = { ...first };
	preferences.setViewport('draft', transform);
	transform.translateX = 999;
	preferences.getViewport('draft').translateY = 999;
	assert.deepEqual(plain(preferences.getViewport('draft')), first);
	assert.equal(notifications, 0);
});

test('restores before subscribing and remembers later store changes on reopen', () => {
	const preferences = new EditorPreferences({ fitToContentModeActive: false }, () => {});
	preferences.setViewport('draft', first);
	const initial = makeStore();
	const stop = initial.bind(preferences, 'draft');
	assert.deepEqual(plain(initial.store.getState().canvasTransform), first);
	assert.equal(initial.store.getState().fitToContentModeActive, false);
	initial.setState({ canvasTransform: second });
	stop();
	assert.equal(initial.listeners.size, 0);
	initial.setState({ canvasTransform: { scale: 99, translateX: 0, translateY: 0 } });
	const reloadedPreferences = new EditorPreferences(plain(preferences.get()), () => {});
	const reopened = makeStore();
	const stopReopened = reopened.bind(reloadedPreferences, 'draft');
	assert.deepEqual(plain(reopened.store.getState().canvasTransform), second);
	stopReopened();
});

test('keeps different diagrams independent while sharing ordinary settings', () => {
	const preferences = new EditorPreferences(undefined, () => {});
	preferences.setViewport('draft', first);
	preferences.setViewport('note:block', second);
	const a = makeStore(), b = makeStore();
	const stopA = a.bind(preferences, 'draft'), stopB = b.bind(preferences, 'note:block');
	const moved = { ...first, translateX: -987.654 };
	a.setState({ canvasTransform: moved, showGuides: false });
	assert.deepEqual(plain(b.store.getState().canvasTransform), second);
	assert.equal(b.store.getState().showGuides, false);
	assert.deepEqual(plain(preferences.getViewport('draft')), moved);
	assert.deepEqual(plain(preferences.getViewport('note:block')), second);
	stopA(); stopB();
});

function blockKey(path, text, cursorLine) {
	const lines = text.split('\n');
	const editor = { getValue: () => text, getCursor: () => ({ line: cursorLine, ch: 0 }), getLine: index => lines[index] };
	return FenceEditContext.create({}, editor, { path }).getViewportKey();
}

test('identifies a code block across content edits and changes in preceding line counts', () => {
	const original = 'Heading\n```tikz\nfirst\n```\n\n```tikz\nsecond\n```';
	const expanded = 'Heading\nExtra paragraph\n```tikz\nchanged\ncontent\n```\n\n```tikz\nsecond\n```';
	assert.equal(blockKey('note.md', original, 6), blockKey('note.md', expanded, 8));
	assert.notEqual(blockKey('note.md', original, 2), blockKey('note.md', original, 6));
	assert.notEqual(blockKey('note.md', original, 2), blockKey('other.md', original, 2));
});
