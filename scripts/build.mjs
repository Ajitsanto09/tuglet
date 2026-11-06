// Production build: bundles TypeScript with esbuild and copies static files into dist/.
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const out = 'dist';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
if (manifest.version !== pkg.version) throw new Error(`manifest.json version ${manifest.version} != package.json ${pkg.version}`);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const common = {
  bundle: true,
  target: 'chrome120',
  sourcemap: watch ? 'inline' : false, // never ship source maps in release builds
  minify: !watch,
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  loader: { '.css': 'text' },
};
const builds = [
  { entryPoints: { background: 'src/background/index.ts' }, format: 'esm' },
  { entryPoints: { content: 'src/content/index.ts' }, format: 'iife' },
  { entryPoints: { popup: 'src/popup/main.tsx' }, format: 'iife' },
  { entryPoints: { options: 'src/options/main.tsx' }, format: 'iife' },
].map((b) => ({ ...common, ...b, outdir: out }));

await cp('public', out, { recursive: true });
await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
// Bundled third-party code (React) ships with its license notices.
const notices = ['react', 'react-dom', 'scheduler'].map(async (name) => {
  const { version } = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  return `${name}@${version}\n\n${await readFile(`node_modules/${name}/LICENSE`, 'utf8')}`;
});
await writeFile(`${out}/THIRD_PARTY_NOTICES.txt`, `Tuglet bundles the following open-source software.\n\n${(await Promise.all(notices)).join('\n---\n\n')}`);
await cp('LICENSE', `${out}/LICENSE.txt`);

if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
  console.log('Watching. After changes, click Reload for Tuglet at chrome://extensions and refresh open pages.');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
