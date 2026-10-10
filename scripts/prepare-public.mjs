import {cp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {SANDBOX_HTML} from './verify-package.mjs';
import {BUILTIN_CATALOG} from '../src/libs/catalog.js';

const vendors=Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.origin==='vendor');
export const STATIC_RESOURCES=Object.freeze({
  'src/ui/tool.html':'ui/tool.html',
  'src/ui/tool-shell.css':'ui/tool-shell.css',
  'src/ui/target-bootstrap.html':'ui/target-bootstrap.html',
  'src/native-agent/settings.html':'native-agent/settings.html',
  'src/native-agent/workspace.html':'native-agent/workspace.html',
  'src/native-agent/workspace.css':'native-agent/workspace.css',
  'src/scripting/sandbox/sandbox.html':SANDBOX_HTML,
  'src/sidebar-tools/sandbox.html':'sidebar-tools/sandbox.html',
  'src/sidebar-tools/reading-toc.opendesk-tool.json':'sidebar-tools/reading-toc.opendesk-tool.json',
  'docs/contracts/licenses/todo-user-vue-MIT.txt':'licenses/todo-user-vue-MIT.txt',
  'src/libs/runtime/bootstrap.js':BUILTIN_CATALOG.bootstrap,
  ...Object.fromEntries(vendors.flatMap(row=>[[row.source,row.output],[row.licenseSource,row.licensePath]]))
});

function digest(bytes){return createHash('sha256').update(bytes).digest('hex');}
async function assertBytes(path,expectedBytes,sha256){
  const data=await readFile(path);
  if((expectedBytes!==undefined&&data.length!==expectedBytes)||digest(data)!==sha256)
    throw new Error('Unregistered fixed library source change: '+path);
}
export async function preparePublic() {
  // A hand-added classic JS is copied byte-for-byte. Its hash and metadata
  // must be registered BEFORE a WXT build, not inferred from arbitrary files.
  await assertBytes('src/libs/runtime/bootstrap.js',undefined,BUILTIN_CATALOG.bootstrapSha256);
  for(const row of vendors) {
    await assertBytes(row.source,row.bytes,row.sha256);
    await assertBytes(row.licenseSource,undefined,row.licenseSha256);
  }
  const publicRoot=resolve('.wxt/public');
  await rm(publicRoot,{recursive:true,force:true});
  await mkdir(publicRoot,{recursive:true});
  for(const [src,dest] of Object.entries(STATIC_RESOURCES)){
    const target=resolve(publicRoot,dest);
    if(!target.startsWith(publicRoot+'/'))throw Error('Unsafe public asset output: '+dest);
    await mkdir(dirname(target),{recursive:true});
    await cp(src,target);
  }
  await mkdir(resolve(publicRoot,'licenses'),{recursive:true});
  await mkdir(resolve(publicRoot,'icons'),{recursive:true});
  await cp('node_modules/lodash-es/LICENSE',resolve(publicRoot,'licenses/lodash-es-MIT.txt'));
  await cp('node_modules/dayjs/LICENSE',resolve(publicRoot,'licenses/dayjs-MIT.txt'));
const notificationIcon = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACGklEQVR42u3d223DMBAEQNaSutJm6lNqCJKIe7ezgP8l7kgGbD7OERERERERWZWPz6/nNx8jWFQ2FAoHQukwKB4EpcOgeBAUD4LyIVA8CMqHQPEgKB8C5UOgfAiUD4HiQVA+BAAAoHwIlA9Bfvk/DQTDy//rQDCg/LcCQRCA26kH0Fp8CgTlQ/DUAJiSCgDKL0ag+EwI6wBsySoAyi9HoPxsBMqH4BkLoCUAADAPwIbyJ15LDIKp5W++ttcATHz6G6/x3xCYuDHzeuMBTP2xZcp11zz90/+Wjn4LKH/2fawGsGkuIgAA5AFQfjmC1MHasvgEAAD6AGwtP/n+AABgx+t/ygreFV8DAADg9d/8NeDp33WvAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOCnYD8F+zPIn0EAAOBrwOsfAABMCjUpFAAALAyxMAQCawMBAMDycMvDbRDRvEGELWLKt4ixSZRNomwT175NnI0in3EAbBX7iwFPuhb7BS+M3cIBAMCBEU4NcWSMM4McGuXkMMfGOTdwM4I3x8rRsaXFv14+BMq/AiAdwq3xODcDQXH5txEkQLh57yclm+bmTZqLeJKycZp28jT0k5hNS7aS7+UkZ9pGDtM+Z0IUVVw+BMoHAAAI6ssHQfEQKB8C5UOgfAiUD4LiIVA+CIqHQPm1EDRbCkGThRg0VgpBQ4UYNFEGwkgXoTCCIiIiIiKyK98xnCdLBZ58zAAAAABJRU5ErkJggg==';
await writeFile(resolve(publicRoot, 'icons/notification.png'), Buffer.from(notificationIcon, 'base64'));
}
