// Creates release/tuglet-<version>.zip (manifest.json at the archive root), SHA256SUMS and a report.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createZip } from './zip.mjs';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8').catch(() => { throw new Error('Run npm run build first.'); }));
if (manifest.version !== pkg.version) throw new Error(`dist/manifest.json is ${manifest.version}; package.json is ${pkg.version}. Rebuild.`);
const changelog = await readFile('CHANGELOG.md', 'utf8');
const section = changelog.split(/^## /m).find((s) => s.startsWith(`[${pkg.version}]`));
if (!section) throw new Error(`CHANGELOG.md has no "## [${pkg.version}]" section.`);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
const files = (await walk('dist'))
  .map((f) => path.relative('dist', f).split(path.sep).join('/'))
  .filter((f) => !f.endsWith('.map') && !f.startsWith('.') && !f.includes('/.'))
  .sort();
const entries = await Promise.all(files.map(async (name) => ({ name, data: await readFile(path.join('dist', name)) })));

const base = `tuglet-${pkg.version}`;
await rm('release', { recursive: true, force: true });
await mkdir('release');
const zip = createZip(entries);
await writeFile(`release/${base}.zip`, zip);
await writeFile('release/SHA256SUMS', `${sha(zip)}  ${base}.zip\n`);

const report = {
  name: manifest.name,
  version: manifest.version,
  minimumChromeVersion: manifest.minimum_chrome_version,
  permissions: manifest.permissions,
  optionalPermissions: manifest.optional_permissions ?? [],
  hostPermissions: manifest.host_permissions ?? [],
  optionalHostPermissions: manifest.optional_host_permissions ?? [],
  zip: { file: `${base}.zip`, sha256: sha(zip), bytes: zip.length },
  files: entries.map((e) => ({ path: e.name, bytes: e.data.length, sha256: sha(e.data) })),
};
await writeFile(`release/${base}-report.json`, JSON.stringify(report, null, 2) + '\n');
await writeFile(`release/${base}-report.md`, `# ${manifest.name} ${manifest.version} package report

- Archive: \`${base}.zip\` (${zip.length} bytes)
- SHA-256: \`${sha(zip)}\`
- Minimum Chrome: ${manifest.minimum_chrome_version}
- Required permissions: ${manifest.permissions.join(', ')}
- Optional permissions (asked only when you turn them on): ${(manifest.optional_permissions ?? []).join(', ') || 'none'}
- Required site access: ${(manifest.host_permissions ?? []).join(', ') || 'none'}
- Optional site access (one site at a time, only when you enable it): ${(manifest.optional_host_permissions ?? []).join(', ')}

| File | Bytes | SHA-256 |
| --- | ---: | --- |
${entries.map((e) => `| ${e.name} | ${e.data.length} | \`${sha(e.data).slice(0, 16)}…\` |`).join('\n')}
`);
await writeFile(`release/RELEASE-NOTES-${pkg.version}.md`, `# Tuglet ${pkg.version}\n\n## ${section.trim()}\n\n## Install\n\nDownload \`${base}.zip\` (not the "Source code" archive), check it against \`SHA256SUMS\`, extract it to a folder you will keep, then load that folder at chrome://extensions with Developer mode on (Load unpacked). See docs/LOCAL-INSTALL.md.\n`);
console.log(`Wrote release/${base}.zip\nSHA-256 ${sha(zip)}`);
