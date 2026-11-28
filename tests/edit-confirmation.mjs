import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';

const project = new URL('../', import.meta.url);
const ts = createRequire(new URL('package.json', project))('typescript');
const plain = value => JSON.parse(JSON.stringify(value));

function evaluate(relative, dependencies = {}, globals = {}) {
	const exports = {};
	const { outputText } = ts.transpileModule(fs.readFileSync(new URL(relative, project), 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	});
	vm.runInNewContext(outputText, {
		exports, ...globals,
		require: name => {
			assert.ok(name in dependencies, `Unexpected import: ${name}`);
			return dependencies[name];
		},
	});
	return exports;
}

class Element {
	constructor() {
		this.classes = new Set();
		this.children = [];
		this.events = {};
		this.ownerDocument = { body: { hasClass: () => false } };
	}
	addClass(name) { this.classes.add(name); }
	removeClass(name) { this.classes.delete(name); }
	empty() { this.children = []; }
	createDiv() { return this.append(new Element()); }
	createSpan() { return this.append(new Element()); }
	createEl(tag, { text }) {
		const el = this.append(new Element());
		el.tag = tag;
		el.textContent = text;
		return el;
	}
	append(el) { el.parent = this; this.children.push(el); return el; }
	insertBefore(el, before) {
		el.remove();
		el.parent = this;
		const index = this.children.indexOf(before);
		this.children.splice(index < 0 ? this.children.length : index, 0, el);
	}
	querySelector(selector) { return selector.includes('view-header') ? this.header : null; }
	remove() {
		if (this.parent) this.parent.children = this.parent.children.filter(el => el !== this);
	}
}

class Component {
	constructor() { this.cleanups = []; this.loaded = false; }
	load() { this.loaded = true; this.onload(); }
	unload() {
		if (!this.loaded) return;
		this.loaded = false;
		this.onunload();
		for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
	}
	register(cleanup) { this.cleanups.push(cleanup); }
	registerDomEvent(el, event, callback) {
		el.events[event] = callback;
		this.register(() => delete el.events[event]);
	}
	registerEvent(cleanup) { this.register(cleanup); }
}

class SettingTab {
	constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = new Element(); }
}
const controls = [];
class Setting {
	setName(name) { this.name = name; return this; }
	setDesc(desc) { this.desc = desc; return this; }
	addToggle(build) {
		const toggle = {
			setValue(value) { this.value = value; return this; },
			onChange(callback) { this.change = callback; return this; },
		};
		build(toggle);
		controls.push({ setting: this, toggle });
		return this;
	}
}
const settingsModule = evaluate('src/settings.ts', {
	obsidian: { PluginSettingTab: SettingTab, Setting },
});
const { FenceEditContext } = evaluate('src/codeBlockEditor/fenceEditContext.ts');
const originalNote = 'before\n```tikz\noriginal\n```\nafter\n```tikz\nsecond block\n```';

function fixture(liveEditing = false, withHeader = true) {
	let note = originalNote;
	let draft = 'original';
	let options;
	let disposed = 0;
	let focused = 0;
	let writes = 0;
	let open = true;
	const recovered = [];
	const notices = [];
	const callbacks = new Map();
	const contentEl = new Element();
	const noteEl = contentEl.createDiv();
	const containerEl = new Element();
	const header = withHeader ? containerEl.append(new Element()) : null;
	containerEl.header = header;
	const file = { path: 'diagram.md' };
	const editor = {
		getValue: () => note,
		getLine: line => note.split('\n')[line],
		getCursor: () => ({ line: 2, ch: 0 }),
		focus: () => focused++,
		replaceRange(value, start, end) {
			const lines = note.split('\n');
			const offset = pos => lines.slice(0, pos.line).reduce((sum, line) => sum + line.length + 1, 0) + pos.ch;
			note = note.slice(0, offset(start)) + value + note.slice(offset(end));
			writes++;
		},
	};
	const view = { file, editor, contentEl, containerEl };
	const plugin = {
		settings: { liveEditing },
		app: {
			workspace: {
				getLeavesOfType: () => open ? [{ view }] : [],
				on(event, callback) {
					callbacks.set(event, callback);
					return () => callbacks.delete(event);
				},
			},
			vault: { create: async (path, source) => { recovered.push({ path, source }); } },
		},
	};
	const { CodeBlockEditorPane } = evaluate('src/codeBlockEditor/pane.ts', {
		obsidian: { Component, Notice: class { constructor(message) { notices.push(message); } } },
		'../editor/isolated': {
			mountCompactEditor(host, opts) {
				options = opts;
				return {
					getSource: () => draft,
					setTheme() {},
					dispose() { disposed++; opts.onChange(draft); },
				};
			},
		},
	});
	const context = FenceEditContext.create(plugin, editor, file);
	const pane = new CodeBlockEditorPane(plugin, context, view, {});
	pane.load();
	const overlay = contentEl.children[1];
	const bar = header ? header.children[0] : overlay.children[0];
	const click = text => bar.children.find(el => el.tag === 'button' && el.textContent === text).events.click();
	return {
		pane, view, callbacks, recovered, notices, contentEl, noteEl, header, options,
		status: () => bar.children[0].textContent,
		note: () => note,
		writes: () => writes,
		disposed: () => disposed,
		focused: () => focused,
		edit(value, notify = true) { draft = value; if (notify) options.onChange(value); },
		externalEdit(value) { note = value; },
		navigate() { view.file = { path: 'elsewhere.md' }; callbacks.get('file-open')(); },
		closeTab() { open = false; callbacks.get('layout-change')(); },
		confirm: () => click('Confirm'),
		cancel: () => click('Cancel'),
	};
}

test('live editing defaults off and validates persisted values', () => {
	for (const value of [undefined, null, [], 'yes', { liveEditing: 'false' }, { liveEditing: 1 }]) {
		assert.equal(settingsModule.readSettings(value).liveEditing, false);
	}
	assert.equal(settingsModule.readSettings({ liveEditing: true }).liveEditing, true);
	assert.equal(settingsModule.readSettings({ liveEditing: false }).liveEditing, false);
});

test('manual editing holds changes until Confirm, including the latest unrendered frame', () => {
	const f = fixture();
	f.edit('draft');
	assert.equal(f.note(), originalNote);
	assert.equal(f.writes(), 0);
	f.edit('latest\nframe', false);
	f.confirm();
	assert.equal(f.note(), originalNote.replace('original', 'latest\nframe'));
	assert.equal(f.writes(), 1);
	assert.equal(f.disposed(), 1);
	assert.equal(f.focused(), 1);
	assert.equal(f.contentEl.children.length, 1);
	assert.equal(f.contentEl.children[0], f.noteEl);
	assert.equal(f.callbacks.size, 0);
	assert.equal(f.header.children.length, 0);
	assert.equal(f.header.classes.has('tikz-editor-pane-header'), false);
	assert.equal(f.recovered.length, 0);
});

test('Cancel discards manual edits without a save or recovery note, even without a note header', () => {
	const f = fixture(false, false);
	f.edit('discard me');
	f.cancel();
	assert.equal(f.note(), originalNote);
	assert.equal(f.writes(), 0);
	assert.equal(f.recovered.length, 0);
	assert.equal(f.disposed(), 1);
	f.options.onChange('late callback');
	f.pane.close();
	assert.equal(f.writes(), 0);
	assert.equal(f.disposed(), 1);
});

test('live edits apply immediately and Cancel restores exactly the opening block', () => {
	const f = fixture(true);
	f.edit('first\nedit');
	f.edit('second edit');
	assert.equal(f.note(), originalNote.replace('original', 'second edit'));
	f.edit('unrendered edit', false);
	f.cancel();
	assert.equal(f.note(), originalNote);
	assert.equal(f.writes(), 3);
	assert.equal(f.recovered.length, 0);
	assert.equal(f.disposed(), 1);
});

test('Confirm and Ctrl/Cmd+S keep edits in either mode', async () => {
	for (const live of [false, true]) {
		for (const shortcut of [false, true]) {
			const f = fixture(live);
			f.edit('');
			if (shortcut) await f.options.onSave('');
			else f.confirm();
			assert.equal(f.note(), originalNote.replace('original\n', ''));
			assert.equal(f.disposed(), 1);
			assert.equal(f.recovered.length, 0);
		}
	}
});

test('switching live editing affects the open session and preserves Cancel rollback', () => {
	const f = fixture();
	f.edit('pending');
	f.pane.setLiveEditing(true);
	assert.equal(f.note(), originalNote.replace('original', 'pending'));
	f.pane.setLiveEditing(false);
	f.edit('held again');
	assert.equal(f.note(), originalNote.replace('original', 'pending'));
	f.cancel();
	assert.equal(f.note(), originalNote);
	assert.equal(f.recovered.length, 0);
});

test('Confirm refuses concurrent note edits and keeps the editor open', () => {
	const f = fixture();
	f.edit('pending');
	f.externalEdit(originalNote.replace('after', 'external change'));
	f.confirm();
	assert.match(f.status(), /note changed/);
	assert.equal(f.writes(), 0);
	assert.equal(f.disposed(), 0);
	// Since this session wrote nothing, Cancel can safely leave the external edit alone.
	f.cancel();
	assert.equal(f.note(), originalNote.replace('after', 'external change'));
	assert.equal(f.disposed(), 1);
});

test('Cancel refuses to overwrite concurrent changes after a live save', () => {
	const f = fixture(true);
	f.edit('live edit');
	const concurrent = f.note().replace('after', 'external change');
	f.externalEdit(concurrent);
	f.cancel();
	assert.match(f.status(), /note changed/);
	assert.equal(f.note(), concurrent);
	assert.equal(f.disposed(), 0);
	assert.equal(f.recovered.length, 0);
});

test('manual navigation never applies unconfirmed source and preserves a recovery copy', async () => {
	for (const closeTab of [false, true]) {
		const f = fixture();
		f.edit('unconfirmed\n```\nsource', false);
		if (closeTab) f.closeTab(); else f.navigate();
		await Promise.resolve();
		assert.equal(f.note(), originalNote);
		assert.equal(f.writes(), 0);
		assert.equal(f.recovered.length, 1);
		assert.equal(f.recovered[0].source, '````tikz\nunconfirmed\n```\nsource\n````\n');
		assert.equal(f.disposed(), 1);
	}
});

test('plugin setting tab saves the toggle, updates open panes, and retains draft/preferences', async () => {
	const timers = new Map();
	let timerId = 0;
	class Plugin extends Component {
		registerView() {}
		addCommand() {}
		addSettingTab(tab) { this.tab = tab; }
	}
	const { EditorPreferences } = evaluate('src/editor/preferences.ts');
	const { default: TikzEditorPlugin } = evaluate('src/main.ts', {
		obsidian: { Plugin, Notice: class {}, MarkdownView: class {} },
		'./view': { TikzEditorView: class {}, VIEW_TYPE_TIKZ_EDITOR: 'tikz-editor-view' },
		'./texFiles': { registerTexFiles() {} },
		'./codeBlockEditor/pane': { CodeBlockEditorPane: class {} },
		'./codeBlockEditor/fenceEditContext': { FenceEditContext },
		'./editor/preferences': { EditorPreferences },
		'./settings': settingsModule,
	}, {
		window: {
			setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
			clearTimeout(id) { timers.delete(id); },
		},
	});
	let saved = {
		source: 'retained draft', legacyDiagram: { preserved: true },
		editorPreferences: { fitToContentModeActive: true, canvasViewports: { draft: { scale: 2, translateX: 4, translateY: 6 } } },
		settings: { liveEditing: true },
	};
	const plugin = new TikzEditorPlugin();
	plugin.app = { workspace: { on: () => () => {} } };
	plugin.loadData = async () => saved;
	plugin.saveData = async data => { saved = plain(data); };
	await plugin.onload();
	plugin.tab.display();
	const { setting, toggle } = controls.at(-1);
	assert.equal(setting.name, 'Live editing');
	assert.equal(toggle.value, true);
	const applied = [];
	plugin.fencePanes.set({}, { setLiveEditing: enabled => applied.push(enabled) });
	toggle.change(false);
	assert.deepEqual(applied, [false]);
	for (const callback of [...timers.values()]) callback();
	await plugin.writes;
	assert.equal(saved.settings.liveEditing, false);
	assert.equal(saved.source, 'retained draft');
	assert.deepEqual(saved.legacyDiagram, { preserved: true });
	assert.equal(saved.editorPreferences.fitToContentModeActive, true);
	assert.deepEqual(saved.editorPreferences.canvasViewports.draft, { scale: 2, translateX: 4, translateY: 6 });
	assert.deepEqual(plain(settingsModule.readSettings(saved.settings)), { liveEditing: false });
});
