import { build as bundleEditor } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';

const compress = promisify(brotliCompress);

function packedTexFonts(upstream) {
	const fontDataDir = path.join(upstream, 'packages/core/src/text/tex/fonts/data');
	return {
		name: 'packed-tex-fonts',
		setup(build) {
			build.onLoad({ filter: /\.generated\.ts$/ }, async ({ path: file }) => {
				const relative = path.relative(fontDataDir, file).split(path.sep).join('/');
				if (relative !== 'computer-modern-ot1.generated.ts' &&
					!/^outlines\/(?!index\.)[^/]+\.generated\.ts$/.test(relative)) return;

				const source = await readFile(file, 'utf8');
				// The upstream generator emits JSON in a single-quoted string and escapes backslashes and apostrophes.
				const literal = /^(export (?:const COMPUTER_MODERN_OT1_FONTS = parseGeneratedTexFontTable|default parseGeneratedTexGlyphOutlines)\()'(.*)'\);$/m;
				const match = literal.exec(source);
				if (!match) throw new Error(`Unexpected generated TeX font format in ${file}`);
				const json = match[2].replace(/\\([\\'])/g, '$1');
				const packed = await compress(json, {
					params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
				});
				const payload = JSON.stringify(packed.toString('base64'));
				return {
					contents: `import { brotliDecompressSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
${source.replace(literal, () => `${match[1]}brotliDecompressSync(Buffer.from(${payload}, 'base64')).toString('utf8'));`)}`,
					loader: 'ts',
				};
			});
		},
	};
}

/** Shared production/test bundling: all editor code stays inside its entry bundle. */
export function createBuildOptions({ entry = 'src/main.ts', outfile = 'main.js', production = true } = {}) {
	const upstream = path.resolve('vendor/tikz-editor');
	const alias = Object.fromEntries(
		['core', 'lang-tikz', 'lezer-tex', 'lezer-tikz'].map(name => [
			`@tikz-editor/${name}`,
			path.join(upstream, 'packages', name, 'src', ...(name === 'core' ? [] : ['index.ts'])),
		]),
	);
	alias['@tikz-editor/app/embedding'] = path.join(upstream, 'packages/app/src/embedding/index.ts');
	alias['@tikz-editor/app/embedding/styles.css'] = path.join(upstream, 'packages/app/src/embedding/styles.css');
	for (const name of ['react', 'react-dom']) alias[name] = path.join(upstream, 'node_modules', name);
	return {
		entryPoints: [path.resolve(entry)],
		outfile,
		write: false,
		bundle: true,
		splitting: false,
		format: 'cjs',
		platform: 'browser',
		target: 'es2021',
		jsx: 'automatic',
		minify: production,
		sourcemap: production ? false : 'inline',
		metafile: true,
		alias,
		nodePaths: [path.join(upstream, 'node_modules')],
		external: ['obsidian', 'electron', 'node:fs/promises', 'node:buffer', 'node:zlib'],
		define: {
			'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
			'import.meta.env.DEV': 'false',
			'import.meta.env.MODE': '"production"',
			'import.meta.env.BASE_URL': '"./"',
			'import.meta.env.TIKZ_EDITOR_VERSION': '"obsidian-compact"',
		},
		loader: {
			'.module.css': 'local-css',
			'.css': 'css',
			'.woff2': 'dataurl',
			'.woff': 'dataurl',
			'.ttf': 'dataurl',
			'.svg': 'dataurl',
			'.png': 'dataurl',
		},
		plugins: [
			...(production ? [packedTexFonts(upstream)] : []),
			{
				name: 'isolated-editor-runtime',
				setup(build) {
					let editorCss = '';
					build.onResolve({ filter: /^virtual:isolated-editor$/ }, () => ({ path: 'runtime', namespace: 'isolated-editor' }));
					build.onResolve({ filter: /^virtual:isolated-editor-css$/ }, () => ({ path: 'styles', namespace: 'isolated-editor-css' }));
					build.onLoad({ filter: /.*/, namespace: 'isolated-editor' }, async () => {
						const result = await bundleEditor(createBuildOptions({ entry: 'src/editor/compact.tsx', outfile: 'editor-runtime.js', production }));
						const js = result.outputFiles.find(file => file.path.endsWith('.js')).text;
						editorCss = result.outputFiles.find(file => file.path.endsWith('.css')).text;
						return { contents: `import 'virtual:isolated-editor-css';
export function createEditorRuntime() {
const module = { exports: {} }; const exports = module.exports;
${js}
return module.exports;
}`, loader: 'js' };
					});
					build.onLoad({ filter: /.*/, namespace: 'isolated-editor-css' }, () => ({ contents: editorCss, loader: 'css' }));
				},
			},
			{
				name: 'compact-optional-features',
				setup(build) {
					build.onResolve({ filter: /pdf-asset-rasterizer$/ }, () => ({
						path: 'pdf-disabled',
						namespace: 'compact-optional',
					}));
					// The canvas shares the standalone app's command table. These export commands
					// belong to its File menu, which the Obsidian host never mounts.
					build.onResolve({ filter: /^\.\/export-commands$/ }, ({ importer }) => {
						if (path.basename(importer) === 'editor-command-runtime.ts')
							return { path: 'standalone-exports', namespace: 'compact-optional' };
					});
					// Standalone file import and native PowerPoint clipboard reads need host APIs the plugin doesn't provide.
					build.onResolve({ filter: /^(pptx2tikz|ipe2tikz)$/ }, ({ path }) => ({
						path,
						namespace: 'compact-optional',
					}));
					// The overlay menu only uses FlexLayout when a standalone dock is mounted.
					build.onResolve({ filter: /^flexlayout-react$/ }, ({ importer }) => {
						if (path.basename(importer) === 'useDeckOverlayContextMenu.tsx')
							return { path: 'flexlayout-react', namespace: 'compact-optional' };
					});
					// The host already disables documentation hover lookup.
					build.onResolve({ filter: /^\.\/tikz-docs$/ }, ({ importer }) => {
						if (path.basename(importer) === 'SourcePanel.tsx')
							return { path: 'tikz-docs', namespace: 'compact-optional' };
					});
					build.onLoad({ filter: /^tikz-docs$/, namespace: 'compact-optional' }, () => ({
						contents: 'export async function lookupTikzDocEntry() { return null; }',
					}));
					build.onLoad({ filter: /^flexlayout-react$/, namespace: 'compact-optional' }, () => ({
						contents: 'export const Actions = { selectTab() { throw new Error("The standalone dock is unavailable in Obsidian."); } };',
					}));
					build.onLoad({ filter: /.*/, namespace: 'compact-optional' }, ({ path: feature }) => {
						const exports = {
							'pdf-disabled': ['rasterizePdfAsset', 'openPdfDocument'],
							'standalone-exports': ['copySvgMarkup', 'exportPdfDownload', 'exportStandaloneLatexDownload'],
							pptx2tikz: ['parse', 'convertSlidesToTikZ', 'parseClipboardGVML', 'convertSlideToTikZ'],
							ipe2tikz: ['convertIpeToTikz'],
						}[feature];
						const async = feature === 'pdf-disabled' || feature === 'standalone-exports' ? 'async ' : '';
						return {
							contents: exports.map(name =>
								`export ${async}function ${name}() { throw new Error(${JSON.stringify(`${name} is unavailable in the Obsidian editor.`)}); }`,
							).join('\n'),
						};
					});
				},
			},
		],
	};
}
