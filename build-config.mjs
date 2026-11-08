import path from 'node:path';

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
		external: ['obsidian', 'electron', 'node:fs/promises'],
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
			{
				name: 'compact-optional-features',
				setup(build) {
					build.onResolve({ filter: /pdf-asset-rasterizer$/ }, () => ({
						path: 'pdf-disabled',
						namespace: 'compact-optional',
					}));
					build.onLoad({ filter: /.*/, namespace: 'compact-optional' }, () => ({
						contents:
							'export async function rasterizePdfAsset(){throw new Error("PDF assets are not enabled in the compact editor.")} export async function openPdfDocument(){throw new Error("PDF preview is not enabled in the compact editor.")}',
					}));
				},
			},
		],
	};
}
