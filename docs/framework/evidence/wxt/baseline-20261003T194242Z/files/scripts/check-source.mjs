import {execFileSync} from 'node:child_process';
import {readFile, stat} from 'node:fs/promises';
import config from '../webpack.config.cjs';
import {filesAt, PACKAGE_ENTRIES, SANDBOX_HTML, SANDBOX_META_CSP, FIXED_ASSETS, verifyManifest, inspectScript} from './verify-package.mjs';
import {SDK_FILES} from '../src/framework/sdk/registry.js';
import {createHash} from 'node:crypto';
const files = [];
for (const root of ['src', 'scripts', 'tests/environment']) {
  for (const file of await filesAt(root)) if (/\.(?:js|cjs|mjs)$/.test(file)) files.push(`${root}/${file}`);
}
for (const file of await filesAt('tests/framework')) if (/^k5-package.*\.mjs$/.test(file)) files.push(`tests/framework/${file}`);
files.push('webpack.config.cjs');
for (const file of files) execFileSync(process.execPath, ['--check', file], {stdio: 'inherit'});
const expected = Object.entries(PACKAGE_ENTRIES).sort();
for (const mode of ['production', 'development']) {
  const build = config(mode);
  if (JSON.stringify(Object.entries(build.entry).sort()) !== JSON.stringify(expected)) throw new Error(`Fixed package entry/source contract changed in ${mode}`);
  if (build.performance.hints !== 'error' || build.performance.maxEntrypointSize !== (mode === 'development' ? 512 : 256) * 1024 || build.performance.maxAssetSize !== build.performance.maxEntrypointSize) throw new Error('Unexpected package size budget');
  if (build.optimization.splitChunks !== false || build.optimization.runtimeChunk !== false || ![false, 'source-map'].includes(build.devtool)) throw new Error('Unexpected lazy/runtime/eval build policy');
}
if (JSON.stringify(SDK_FILES) !== JSON.stringify({relay: 'agents/page-relay.js', main: 'framework/sdk-main.js'})) throw new Error('SDK fixed MAIN/ISOLATED output paths changed');
for (const source of Object.values(PACKAGE_ENTRIES)) if (!(await stat(source)).isFile()) throw new Error(`Missing fixed entry: ${source}`);
verifyManifest(JSON.parse(await readFile('manifest.json', 'utf8')));
const sandboxHTML = await readFile(`src/${SANDBOX_HTML}`, 'utf8');
if (!sandboxHTML.includes(`content="${SANDBOX_META_CSP}"`) || !sandboxHTML.includes('<script src="sandbox.js"></script>')) throw new Error('Source opaque sandbox resource/CSP contract changed');
inspectScript(await readFile('src/scripting/sandbox/sandbox.js', 'utf8'), 'scripting/sandbox/sandbox.js');
const license = await readFile('docs/contracts/licenses/todo-user-vue-MIT.txt');
const notice = FIXED_ASSETS['licenses/todo-user-vue-MIT.txt'];
if (license.length !== notice.bytes || createHash('sha256').update(license).digest('hex') !== notice.sha256) throw new Error('Source MIT notice changed');
for (const file of files.filter(path => path.startsWith('src/'))) if (/\/(?:compat|legacy)\/src-bex\//.test(file)) throw new Error(`Forbidden legacy runtime tree: ${file}`);
console.log(`Syntax checked ${files.length} source/test/build files; fixed SDK/control entries, strict CSP and original MIT checked`);
