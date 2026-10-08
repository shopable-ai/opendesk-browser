import {execFileSync} from 'node:child_process';
import {readFile, stat} from 'node:fs/promises';
import {filesAt, PACKAGE_ENTRIES, FIXED_OUTPUTS, BUILD_POLICY, SANDBOX_HTML, SANDBOX_META_CSP, FIXED_ASSETS, verifyManifest, inspectScript, BUILD_CONTRACT_SOURCE} from './verify-package.mjs';
import {PINNED_USER_SCRIPT_LIBRARIES} from './build-contract.mjs';
import {JQUERY_371} from '../src/scripting/user-scripts/page-program-package.js';
import {SDK_FILES} from '../src/framework/sdk/registry.js';
import {SDK_RESOURCE_PATHS, SDK_RESOURCE_ALIASES, SDK_RESOURCE_MANIFEST} from '../src/framework/sdk/resource-contract.js';
import {createHash} from 'node:crypto';
const files = [];
for (const root of ['src', 'scripts', 'tests/environment']) {
  for (const file of await filesAt(root)) if (/\.(?:js|cjs|mjs)$/.test(file)) files.push(`${root}/${file}`);
}
for (const file of await filesAt('tests/framework')) if (/^k5-package.*\.mjs$/.test(file)) files.push(`tests/framework/${file}`);
files.push('wxt.config.mjs');
for (const file of files) execFileSync(process.execPath, ['--check', file], {stdio: 'inherit'});
if (BUILD_CONTRACT_SOURCE !== 'scripts/build-contract.mjs') throw new Error(`Unexpected build contract source: ${BUILD_CONTRACT_SOURCE}`);
const packageManifest = JSON.parse(await readFile('package.json', 'utf8'));
const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'));
if (packageManifest.devDependencies?.acorn !== '8.15.0' || packageLock.packages?.['node_modules/acorn']?.version !== '8.15.0') throw new Error('Acorn must stay explicitly locked to 8.15.0');
if (JSON.stringify(BUILD_POLICY) !== JSON.stringify({productionBytes: 320 * 1024, developmentBytes: 512 * 1024, splitChunks: false, runtimeChunk: false, formats: ['iife'], sourcemap: {production: false, development: true}})) throw new Error('Unexpected build policy contract');
if (Object.entries(PACKAGE_ENTRIES).some(([name]) => name !== 'sw' && FIXED_OUTPUTS[name.split('/').at(-1)] !== `${name}.js`)) throw new Error('Unexpected fixed output contract');
if (JSON.stringify(SDK_FILES) !== JSON.stringify({relay: 'agents/page-relay.js', main: 'framework/sdk-main.js'})) throw new Error('SDK fixed MAIN/ISOLATED output paths changed');
if (!Object.isFrozen(SDK_RESOURCE_PATHS) || JSON.stringify(SDK_RESOURCE_PATHS) !== JSON.stringify([SDK_FILES.main, SDK_FILES.relay]) || SDK_RESOURCE_MANIFEST !== 'framework/sdk-resources.json') throw new Error('SDK resource manifest paths changed');
const aliases = ['assets/js/core/brige.js', 'assets/js/core/common.js', 'assets/js/core/axiosx.js', 'assets/js/core/appStorage.js', 'assets/js/core/appLocal.js', 'assets/js/core/utils.js', 'assets/js/Env.js'];
if (!Object.isFrozen(SDK_RESOURCE_ALIASES) || JSON.stringify(Object.keys(SDK_RESOURCE_ALIASES).sort()) !== JSON.stringify([...aliases].sort()) || Object.values(SDK_RESOURCE_ALIASES).some(path => path !== SDK_FILES.main)) throw new Error('SDK resource legacy aliases changed');
for (const source of Object.values(PACKAGE_ENTRIES)) if (!(await stat(source)).isFile()) throw new Error(`Missing fixed entry: ${source}`);
verifyManifest(JSON.parse(await readFile('manifest.json', 'utf8')));
const sandboxHTML = await readFile(`src/${SANDBOX_HTML}`, 'utf8');
if (!sandboxHTML.includes(`content="${SANDBOX_META_CSP}"`) || !sandboxHTML.includes('<script src="sandbox.js"></script>')) throw new Error('Source opaque sandbox resource/CSP contract changed');
inspectScript(await readFile('src/scripting/sandbox/sandbox.js', 'utf8'), 'scripting/sandbox/sandbox.js', {sourceType: 'module'});
const license = await readFile('docs/contracts/licenses/todo-user-vue-MIT.txt');
const notice = FIXED_ASSETS['licenses/todo-user-vue-MIT.txt'];
if (license.length !== notice.bytes || createHash('sha256').update(license).digest('hex') !== notice.sha256) throw new Error('Source MIT notice changed');
// Detect drift between the trust-side runtime lock, upstream bytes, and package
// allowlist *before* WXT builds. Do not execute vendor code in Node/SW here.
const jquery = PINNED_USER_SCRIPT_LIBRARIES.jquery;
if (!Object.isFrozen(jquery) || jquery.id !== JQUERY_371.id || jquery.version !== JQUERY_371.version ||
  jquery.sha256 !== JQUERY_371.sha256 || jquery.output !== JQUERY_371.path ||
  jquery.bytes !== 87533 || jquery.licenseOutput !== 'licenses/jquery-MIT.txt')
  throw new Error('Pinned page dependency source/package contract drift');
for (const [src, expected] of [
  ['src/vendor/jquery-3.7.1.min.js', {bytes:jquery.bytes,sha256:jquery.sha256}],
  ['src/vendor/jquery-3.7.1.LICENSE.txt', {bytes:1097,sha256:jquery.licenseSha256}]
]) {
  const bytes = await readFile(src);
  if (bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256)
    throw new Error(`Pinned page dependency source mismatch: ${src}`);
}
for (const file of files.filter(path => path.startsWith('src/'))) if (/\/(?:compat|legacy)\/src-bex\//.test(file)) throw new Error(`Forbidden legacy runtime tree: ${file}`);
console.log(`Syntax checked ${files.length} source/test/build files; ${BUILD_CONTRACT_SOURCE} entries, fixed SDK/control entries, strict CSP and original MIT checked`);
