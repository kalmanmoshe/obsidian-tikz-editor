import * as esbuild from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import postcss from 'postcss';
import { createBuildOptions } from './build-config.mjs';

const production = process.argv[2] === 'production';
const options = createBuildOptions({ production });
const context = await esbuild.context({
	...options,
	plugins: [
		...options.plugins,
		{
			name: 'write-plugin-files',
			setup(build) {
				build.onEnd(async result => {
					if (result.errors.length) return;
					const javascript = result.outputFiles.find(file => file.path.endsWith('.js'));
					const stylesheet = result.outputFiles.find(file => file.path.endsWith('.css'));
					if (!javascript || !stylesheet)
						throw new Error('Expected one JavaScript bundle and its stylesheet.');
					const css = postcss.parse(stylesheet.text);
					css.walkRules(rule => {
						if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
						rule.selectors = rule.selectors.map(selector => {
							// Obsidian pane chrome is outside the embedded root and already namespaced.
							if (selector.startsWith('.tikz-editor-pane')) return selector;
							const scoped = selector.replace(
								/:root|:host|\bhtml\b|\bbody\b|#root/g,
								'.tikz-editor-root',
							);
							if (/^\[data-(color-scheme|canvas-invert|desktop-os)/.test(scoped))
								return `.tikz-editor-root${scoped}`;
							return scoped.startsWith('.tikz-editor-root')
								? scoped
								: `.tikz-editor-root.tikz-editor-root ${scoped}`;
						});
					});
					await writeFile('styles.css', css.toString());
					await mkdir('build', { recursive: true });
					await writeFile('build/metafile.json', JSON.stringify(result.metafile));
					await writeFile('main.js', javascript.contents);
					console.log(
						`main.js ${(javascript.contents.length / 1024).toFixed(1)} KB, styles.css ${(stylesheet.text.length / 1024).toFixed(1)} KB`,
					);
				});
			},
		},
	],
});
if (production) {
	try {
		await context.rebuild();
	} finally {
		await context.dispose();
	}
} else {
	await context.watch();
}
