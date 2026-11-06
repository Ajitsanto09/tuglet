// Verifies the release ZIP itself: checksum, archive layout, version, permission policy,
// referenced assets and forbidden content; then loads the extraction in Chromium (@smoke E2E).
// Usage: npm run verify:package [-- --no-e2e]
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readZip } from './zip.mjs';

const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const base = `tuglet-${pkg.version}`;
const zipPath = `release/${base}.zip`;
const zip = await readFile(zipPath);
const sums = await readFile('release/SHA256SUMS', 'utf8');
const digest = createHash('sha256').update(zip).digest('hex');
check(sums.includes(`${digest}  ${base}.zip`), 'SHA256SUMS does not match the archive');

const entries = readZip(zip);
const names = new Set(entries.map((e) => e.name));
const dir = await mkdtemp(path.join(os.tmpdir(), 'tuglet-verify-'));
for (const { name, data } of entries) {
  await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
  await writeFile(path.join(dir, name), data);
}

check(names.has('manifest.json'), 'manifest.json is not at the archive root');
const mf = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
check(mf.manifest_version === 3, 'not Manifest V3');
check(mf.version === pkg.version, `manifest version ${mf.version} != package.json ${pkg.version}`);
check((await readFile('CHANGELOG.md', 'utf8')).includes(`## [${pkg.version}]`), 'CHANGELOG.md lacks this version');

// Permission policy for the MVP.
const eq = (a, b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...b].sort());
check(eq(mf.permissions, ['storage', 'alarms', 'scripting', 'activeTab']), `unexpected required permissions: ${mf.permissions}`);
check(eq(mf.optional_permissions, ['notifications']), `unexpected optional permissions: ${mf.optional_permissions}`);
check(eq(mf.optional_host_permissions, ['https://*/*', 'http://*/*']), 'unexpected optional host permissions');
for (const k of ['host_permissions', 'content_scripts', 'externally_connectable', 'web_accessible_resources', 'update_url', 'key', 'oauth2', 'chrome_url_overrides'])
  check(mf[k] === undefined, `manifest must not declare ${k}`);
check(mf.incognito === 'not_allowed', 'incognito must be not_allowed');
const csp = mf.content_security_policy?.extension_pages ?? '';
check(/script-src 'self'/.test(csp) && /connect-src 'none'/.test(csp) && !/unsafe|https?:/.test(csp), 'extension page CSP is weaker than required');

// Every referenced file exists.
const refs = [mf.background?.service_worker, mf.action?.default_popup, mf.options_page, 'content.js',
  ...Object.values(mf.icons ?? {}), ...Object.values(mf.action?.default_icon ?? {})];
for (const html of [...names].filter((n) => n.endsWith('.html'))) {
  const text = entries.find((e) => e.name === html).data.toString('utf8');
  check(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(text), `${html} has an inline script`);
  check(!/\son[a-z]+=/i.test(text), `${html} has an inline event handler`);
  for (const m of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
    check(!/^(https?:)?\/\//.test(m[1]), `${html} references remote ${m[1]}`);
    refs.push(m[1]);
  }
}
for (const r of refs) check(r && names.has(r), `referenced file missing: ${r}`);

// Forbidden content.
for (const { name, data } of entries) {
  check(!/(^|\/)(node_modules|\.git|\.env|test-results|playwright-report)(\/|$)/.test(name) && !name.endsWith('.map') && !name.endsWith('.ts') && !/\.(pem|key|crx)$/.test(name), `forbidden file in package: ${name}`);
  if (!/\.(js|html|css|json)$/.test(name)) continue;
  const t = data.toString('utf8');
  check(!t.includes('sourceMappingURL'), `${name} references a source map`);
  check(!/localhost:\d|ws:\/\/|127\.0\.0\.1/.test(t), `${name} contains a development server URL`);
  check(!/\beval\(|new Function\(|importScripts\(|import\(\s*["'`]https?:/.test(t), `${name} contains dynamic code loading`);
  check(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket\(/.test(t) || name !== 'content.js', 'content.js must not make network requests');
  check(!new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t), `${name} leaks a local path`);
}
for (const f of ['LICENSE.txt', 'THIRD_PARTY_NOTICES.txt']) check(names.has(f), `${f} missing`);

console.log(`Archive: ${zipPath}\nSHA-256: ${digest}\nFiles: ${entries.length}\nExtracted to: ${dir}`);
if (problems.length) {
  console.error(`\nPackage verification FAILED:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Static package checks passed.');

if (!process.argv.includes('--no-e2e')) {
  console.log('\nLoading the extracted package in Chromium (@smoke and access tests)...');
  const r = spawnSync('npx', ['playwright', 'test', 'smoke.spec.ts', 'access.spec.ts'], { stdio: 'inherit', env: { ...process.env, TUGLET_EXT: dir }, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`\nExtracted package loaded and passed smoke tests: ${dir}`);
}
check(existsSync(dir), 'extraction missing');
