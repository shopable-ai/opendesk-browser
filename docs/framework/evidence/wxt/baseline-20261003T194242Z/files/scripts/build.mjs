import webpack from 'webpack';
import config from '../webpack.config.cjs';
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {verifyPackage, SANDBOX_HTML, filesAt} from './verify-package.mjs';
const mode = process.argv[2] || 'production';
if (!['production', 'development'].includes(mode)) throw new Error('Invalid build mode');
async function sourceInputs() {
  const paths = [...(await filesAt('src')).map(path => `src/${path}`), 'manifest.json', 'webpack.config.cjs', 'scripts/build.mjs', 'scripts/verify-package.mjs', 'package.json', 'package-lock.json', 'docs/contracts/licenses/todo-user-vue-MIT.txt'].sort();
  return Promise.all(paths.map(async path => { const bytes = await readFile(path); return {path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}; }));
}
const inputsBefore = await sourceInputs();
const compiler = webpack(config(mode));
const stats = await new Promise((done, reject) => compiler.run((error, value) => error ? reject(error) : done(value)));
await new Promise((done, reject) => compiler.close(error => error ? reject(error) : done()));
if (stats.hasErrors()) { console.error(stats.toString({all: false, errors: true})); process.exit(1); }
const out = resolve('dist', mode);
await mkdir(resolve(out, 'ui'), {recursive: true});
await cp('manifest.json', resolve(out, 'manifest.json'));
for (const name of ['tool.html', 'tool-shell.css', 'target-bootstrap.html']) await cp(`src/ui/${name}`, resolve(out, 'ui', name));
await mkdir(resolve(out, 'scripting/sandbox'), {recursive: true});
await cp('src/scripting/sandbox/sandbox.html', resolve(out, SANDBOX_HTML));
await mkdir(resolve(out, 'licenses'), {recursive: true});
await cp('docs/contracts/licenses/todo-user-vue-MIT.txt', resolve(out, 'licenses/todo-user-vue-MIT.txt'));
// Original OpenDesk notification mark: deterministic local PNG, no vendor asset.
// Consumer: sdk-broker -> createNotificationService iconUrl. Integrity is pinned by verifyPackage.
await mkdir(resolve(out, 'icons'), {recursive: true});
const notificationIcon = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACGklEQVR42u3d223DMBAEQNaSutJm6lNqCJKIe7ezgP8l7kgGbD7OERERERERWZWPz6/nNx8jWFQ2FAoHQukwKB4EpcOgeBAUD4LyIVA8CMqHQPEgKB8C5UOgfAiUD4HiQVA+BAAAoHwIlA9Bfvk/DQTDy//rQDCg/LcCQRCA26kH0Fp8CgTlQ/DUAJiSCgDKL0ag+EwI6wBsySoAyi9HoPxsBMqH4BkLoCUAADAPwIbyJ15LDIKp5W++ttcATHz6G6/x3xCYuDHzeuMBTP2xZcp11zz90/+Wjn4LKH/2fawGsGkuIgAA5AFQfjmC1MHasvgEAAD6AGwtP/n+AABgx+t/ygreFV8DAADg9d/8NeDp33WvAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOCnYD8F+zPIn0EAAOBrwOsfAABMCjUpFAAALAyxMAQCawMBAMDycMvDbRDRvEGELWLKt4ixSZRNomwT175NnI0in3EAbBX7iwFPuhb7BS+M3cIBAMCBEU4NcWSMM4McGuXkMMfGOTdwM4I3x8rRsaXFv14+BMq/AiAdwq3xODcDQXH5txEkQLh57yclm+bmTZqLeJKycZp28jT0k5hNS7aS7+UkZ9pGDtM+Z0IUVVw+BMoHAAAI6ssHQfEQKB8C5UOgfAiUD4LiIVA+CIqHQPm1EDRbCkGThRg0VgpBQ4UYNFEGwkgXoTCCIiIiIiKyK98xnCdLBZ58zAAAAABJRU5ErkJggg==';
await writeFile(resolve(out, 'icons/notification.png'), Buffer.from(notificationIcon, 'base64'));
const inputsAfter = await sourceInputs();
const sourceDriftDuringBuild = inputsBefore.filter((input, index) => JSON.stringify(input) !== JSON.stringify(inputsAfter[index]));
if (inputsBefore.length !== inputsAfter.length || sourceDriftDuringBuild.length) throw new Error('Build inputs changed during compilation/copy; rebuild the current candidate');
const report = await verifyPackage(out);
const evidence = 'docs/framework/evidence/f2-package-continuation';
await mkdir(evidence, {recursive: true});
await writeFile(`${evidence}/build-${mode}.json`, JSON.stringify({mode, status: 'passed', cwd: process.cwd(), sourceInputs: inputsBefore, sourceDriftDuringBuild, report}, null, 2) + '\n');
console.log(JSON.stringify({mode, status: 'passed', packageHash: report.packageHash, assets: report.files.length}));
