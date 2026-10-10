import {cp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {SANDBOX_HTML} from './verify-package.mjs';

export const STATIC_RESOURCES = Object.freeze({
  'src/ui/tool.html':'ui/tool.html',
  'src/ui/tool-shell.css':'ui/tool-shell.css',
  'src/ui/target-bootstrap.html':'ui/target-bootstrap.html',
  'src/native-agent/settings.html':'native-agent/settings.html',
  'src/native-agent/workspace.html':'native-agent/workspace.html',
  'src/native-agent/workspace.css':'native-agent/workspace.css',
  'src/scripting/sandbox/sandbox.html':SANDBOX_HTML,
  'src/sidebar-tools/sandbox.html':'sidebar-tools/sandbox.html',
  'docs/contracts/licenses/todo-user-vue-MIT.txt':'licenses/todo-user-vue-MIT.txt',
  'src/vendor/jquery-3.7.1.min.js':'vendor/jquery-3.7.1.min.js',
  'src/vendor/jquery-3.7.1.LICENSE.txt':'licenses/jquery-MIT.txt'
});

export async function preparePublic() {
// WXT copies only source-owned static resources; every JavaScript output is built by WXT/Vite.
const publicRoot = resolve('.wxt/public');
await rm(publicRoot, {recursive: true, force: true});
for (const dir of ['ui', 'native-agent', 'scripting/sandbox', 'sidebar-tools', 'licenses', 'icons', 'vendor']) await mkdir(resolve(publicRoot, dir), {recursive: true});
for (const name of ['tool.html', 'tool-shell.css', 'target-bootstrap.html']) await cp(`src/ui/${name}`, resolve(publicRoot, 'ui', name));
await cp('src/native-agent/settings.html', resolve(publicRoot, 'native-agent/settings.html'));
await cp('src/native-agent/workspace.html', resolve(publicRoot, 'native-agent/workspace.html'));
await cp('src/native-agent/workspace.css', resolve(publicRoot, 'native-agent/workspace.css'));
await cp('src/scripting/sandbox/sandbox.html', resolve(publicRoot, SANDBOX_HTML));
await cp('src/sidebar-tools/sandbox.html', resolve(publicRoot, 'sidebar-tools/sandbox.html'));
await cp('docs/contracts/licenses/todo-user-vue-MIT.txt', resolve(publicRoot, 'licenses/todo-user-vue-MIT.txt'));
await cp('src/vendor/jquery-3.7.1.min.js', resolve(publicRoot, 'vendor/jquery-3.7.1.min.js'));
await cp('src/vendor/jquery-3.7.1.LICENSE.txt', resolve(publicRoot, 'licenses/jquery-MIT.txt'));
await cp('node_modules/lodash-es/LICENSE', resolve(publicRoot, 'licenses/lodash-es-MIT.txt'));
await cp('node_modules/dayjs/LICENSE', resolve(publicRoot, 'licenses/dayjs-MIT.txt'));
const notificationIcon = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACGklEQVR42u3d223DMBAEQNaSutJm6lNqCJKIe7ezgP8l7kgGbD7OERERERERWZWPz6/nNx8jWFQ2FAoHQukwKB4EpcOgeBAUD4LyIVA8CMqHQPEgKB8C5UOgfAiUD4HiQVA+BAAAoHwIlA9Bfvk/DQTDy//rQDCg/LcCQRCA26kH0Fp8CgTlQ/DUAJiSCgDKL0ag+EwI6wBsySoAyi9HoPxsBMqH4BkLoCUAADAPwIbyJ15LDIKp5W++ttcATHz6G6/x3xCYuDHzeuMBTP2xZcp11zz90/+Wjn4LKH/2fawGsGkuIgAA5AFQfjmC1MHasvgEAAD6AGwtP/n+AABgx+t/ygreFV8DAADg9d/8NeDp33WvAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOCnYD8F+zPIn0EAAOBrwOsfAABMCjUpFAAALAyxMAQCawMBAMDycMvDbRDRvEGELWLKt4ixSZRNomwT175NnI0in3EAbBX7iwFPuhb7BS+M3cIBAMCBEU4NcWSMM4McGuXkMMfGOTdwM4I3x8rRsaXFv14+BMq/AiAdwq3xODcDQXH5txEkQLh57yclm+bmTZqLeJKycZp28jT0k5hNS7aS7+UkZ9pGDtM+Z0IUVVw+BMoHAAAI6ssHQfEQKB8C5UOgfAiUD4LiIVA+CIqHQPm1EDRbCkGThRg0VgpBQ4UYNFEGwkgXoTCCIiIiIiKyK98xnCdLBZ58zAAAAABJRU5ErkJggg==';
await writeFile(resolve(publicRoot, 'icons/notification.png'), Buffer.from(notificationIcon, 'base64'));
}
