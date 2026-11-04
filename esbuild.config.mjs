import * as esbuild from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import postcss from 'postcss';
import { createBuildOptions } from './build-config.mjs';
import { generateNotices } from './licenses.mjs';

const production = process.argv[2] === 'production';
const options = createBuildOptions({ production });
const context = await esbuild.context({
  ...options,
  plugins: [...options.plugins, { name: 'write-plugin-files', setup(build) {
    build.onEnd(async result => {
      if (result.errors.length) return;
      const javascript = result.outputFiles.find(file => file.path.endsWith('.js'));
      const stylesheet = result.outputFiles.find(file => file.path.endsWith('.css'));
      if (!javascript || !stylesheet) throw new Error('Expected one JavaScript bundle and its stylesheet.');
      const css = postcss.parse(stylesheet.text);
      css.walkRules(rule => {
        if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
        rule.selectors = rule.selectors.map(selector => {
          const scoped = selector.replace(/:root|:host|\bhtml\b|\bbody\b|#root/g, '.tikz-editor-root');
          if (/^\[data-(color-scheme|canvas-invert|desktop-os)/.test(scoped)) return `.tikz-editor-root${scoped}`;
          return scoped.startsWith('.tikz-editor-root') ? scoped : `.tikz-editor-root ${scoped}`;
        });
      });
      await writeFile('styles.css', '.tikz-editor-pane{padding:0!important;overflow:hidden}.tikz-editor-root{height:100%;min-height:0}\n' + css.toString());
      await mkdir('build', { recursive: true });
      await writeFile('build/metafile.json', JSON.stringify(result.metafile));
      await generateNotices(result.metafile);
      await writeFile('main.js', javascript.contents);
      console.log('Built main.js and styles.css (all editor code included).');
    });
  } }],
});
if (production) {
  try { await context.rebuild(); }
  finally { await context.dispose(); }
} else {
  await context.watch();
}
