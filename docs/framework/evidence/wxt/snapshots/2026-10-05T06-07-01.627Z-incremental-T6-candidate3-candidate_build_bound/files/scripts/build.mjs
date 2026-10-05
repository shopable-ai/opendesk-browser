import {execFileSync} from 'node:child_process';
import {cp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {verifyPackage, SANDBOX_HTML, filesAt, createSdkResourceManifest, SDK_RESOURCE_MANIFEST} from './verify-package.mjs';
const mode = process.argv[2] || 'production';
if (!['production', 'development'].includes(mode)) throw new Error('Invalid build mode');
async function sourceInputs() {
  const paths = [...(await filesAt('src')).map(path => `src/${path}`), ...(await filesAt('scripts')).map(path => `scripts/${path}`), 'manifest.json', 'wxt.config.mjs', 'package.json', 'package-lock.json', 'docs/contracts/licenses/todo-user-vue-MIT.txt'].sort();
  return Promise.all(paths.map(async path => { const bytes = await readFile(path); return {path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}; }));
}
const inputsBefore = await sourceInputs();
// WXT copies only source-owned static resources; every JavaScript output is built by WXT/Vite.
const publicRoot = resolve('.wxt/public');
await rm(publicRoot, {recursive: true, force: true});
for (const dir of ['ui', 'scripting/sandbox', 'licenses', 'icons']) await mkdir(resolve(publicRoot, dir), {recursive: true});
for (const name of ['tool.html', 'tool-shell.css', 'target-bootstrap.html']) await cp(`src/ui/${name}`, resolve(publicRoot, 'ui', name));
await cp('src/scripting/sandbox/sandbox.html', resolve(publicRoot, SANDBOX_HTML));
await cp('docs/contracts/licenses/todo-user-vue-MIT.txt', resolve(publicRoot, 'licenses/todo-user-vue-MIT.txt'));
const notificationIcon = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACGklEQVR42u3d223DMBAEQNaSutJm6lNqCJKIe7ezgP8l7kgGbD7OERERERERWZWPz6/nNx8jWFQ2FAoHQukwKB4EpcOgeBAUD4LyIVA8CMqHQPEgKB8C5UOgfAiUD4HiQVA+BAAAoHwIlA9Bfvk/DQTDy//rQDCg/LcCQRCA26kH0Fp8CgTlQ/DUAJiSCgDKL0ag+EwI6wBsySoAyi9HoPxsBMqH4BkLoCUAADAPwIbyJ15LDIKp5W++ttcATHz6G6/x3xCYuDHzeuMBTP2xZcp11zz90/+Wjn4LKH/2fawGsGkuIgAA5AFQfjmC1MHasvgEAAD6AGwtP/n+AABgx+t/ygreFV8DAADg9d/8NeDp33WvAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOCnYD8F+zPIn0EAAOBrwOsfAABMCjUpFAAALAyxMAQCawMBAMDycMvDbRDRvEGELWLKt4ixSZRNomwT175NnI0in3EAbBX7iwFPuhb7BS+M3cIBAMCBEU4NcWSMM4McGuXkMMfGOTdwM4I3x8rRsaXFv14+BMq/AiAdwq3xODcDQXH5txEkQLh57yclm+bmTZqLeJKycZp28jT0k5hNS7aS7+UkZ9pGDtM+Z0IUVVw+BMoHAAAI6ssHQfEQKB8C5UOgfAiUD4LiIVA+CIqHQPm1EDRbCkGThRg0VgpBQ4UYNFEGwkgXoTCCIiIiIiKyK98xnCdLBZ58zAAAAABJRU5ErkJggg==';
await writeFile(resolve(publicRoot, 'icons/notification.png'), Buffer.from(notificationIcon, 'base64'));
const wxt = resolve('node_modules/.bin/wxt');
const env = {...process.env, OPENDESK_BUILD_MODE: mode};
execFileSync(wxt, ['prepare'], {env, stdio: 'inherit'});
execFileSync(wxt, ['build', '--browser', 'chrome', '--mv3', '--mode', mode], {env, stdio: 'inherit'});
const inputsAfter = await sourceInputs();
const sourceDriftDuringBuild = inputsBefore.filter((input, index) => JSON.stringify(input) !== JSON.stringify(inputsAfter[index]));
if (inputsBefore.length !== inputsAfter.length || sourceDriftDuringBuild.length) throw new Error('Build inputs changed during WXT build; rebuild current candidate');
const outputRoot = resolve('dist', mode);
// Hash the actual WXT output, never source files or a previous package receipt.
await writeFile(resolve(outputRoot, SDK_RESOURCE_MANIFEST), JSON.stringify(await createSdkResourceManifest(outputRoot), null, 2) + '\n');
const report = await verifyPackage(outputRoot);
const evidence = 'docs/framework/evidence/wxt/builds';
await mkdir(evidence, {recursive: true});
await writeFile(`${evidence}/build-${mode}.json`, JSON.stringify({mode, builder: 'WXT0.21.4/Vite7.3.6/Rollup', status: 'passed', cwd: process.cwd(), sourceInputs: inputsBefore, sourceDriftDuringBuild, report}, null, 2) + '\n');
console.log(JSON.stringify({mode, builder: 'wxt', status: 'passed', packageHash: report.packageHash, assets: report.files.length}));
