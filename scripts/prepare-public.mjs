import {cp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {SANDBOX_HTML} from './verify-package.mjs';
import {BUILTIN_CATALOG} from '../src/libs/catalog.js';
import {PAGE_FRAMEWORK_RUNTIMES,PAGE_FRAMEWORK_RESOURCE_LIMIT,PAGE_BROWSER_PRIVATE_FILES,PAGE_BROWSER_COMPILER_RESOURCE_LIMIT,PAGE_BROWSER_COMPILER} from '../src/libs/page-frameworks/contract.js';
import {RESOURCE_LIMITS} from './build-contract.mjs';
import {resolveBrowserEdition,compilerResourcesForEdition,BROWSER_EDITION_RECORD,editionRecordText} from './browser-editions-r245.mjs';
import {compileWorkspaceStyle} from './build-workspace-style.mjs';
import {buildOfficialTools} from './build-official-tools.mjs';
import {resolveMarketChannel,MARKET_CHANNEL_PATH} from './market-channel.mjs';

const vendors=Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.origin==='vendor');
const pageFrameworks=Object.values(PAGE_FRAMEWORK_RUNTIMES);
const edition=resolveBrowserEdition();
const browserCompilerFiles=compilerResourcesForEdition(edition);
export const STATIC_RESOURCES=Object.freeze({
  'src/ui/tool.html':'ui/tool.html',
  'src/ui/cloud-control.html':'ui/cloud-control.html',
  'src/ui/cloud-control-console.css':'ui/cloud-control-console.css',
  'src/marketplace/marketplace.html':'ui/marketplace.html',
  'src/marketplace/marketplace.css':'ui/marketplace.css',
  'src/ui/design-tokens.css':'ui/design-tokens.css',
  'src/ui/design-system.css':'ui/design-system.css',
  'src/ui/tool-shell.css':'ui/tool-shell.css',
  'src/ui/extension-center.css':'ui/extension-center.css',
  'examples/sidebar-tools/time-review/src/style.css':'ui/time-review.css',
  'src/ui/cloud-hosting.css':'ui/cloud-hosting.css',
  'src/ui/target-bootstrap.html':'ui/target-bootstrap.html',
  ...Object.fromEntries(['quota','schedule','session','always'].map(reason=>[
    'src/stay-focus/blocked-'+reason+'.html','stay-focus/blocked-'+reason+'.html'])),
  'src/stay-focus/blocked.css':'stay-focus/blocked.css',
  'src/native-agent/settings.html':'native-agent/settings.html',
  'src/native-agent/settings.css':'native-agent/settings.css',
  'src/native-agent/workspace.html':'native-agent/workspace.html',
  'src/scripting/sandbox/sandbox.html':SANDBOX_HTML,
  'src/sidebar-tools/sandbox.html':'sidebar-tools/sandbox.html',
  'docs/contracts/licenses/todo-user-vue-MIT.txt':'licenses/todo-user-vue-MIT.txt',
  'src/libs/runtime/bootstrap.js':BUILTIN_CATALOG.bootstrap,
  ...Object.fromEntries(vendors.flatMap(row=>[[row.source,row.output],[row.licenseSource,row.licensePath]])),
  ...Object.fromEntries(pageFrameworks.flatMap(row=>[[row.source,row.output],[row.licenseSource,row.licensePath]])),
  ...Object.fromEntries(browserCompilerFiles.map(row=>[row.source,row.output])),
  ...(edition==='developer'?{[PAGE_BROWSER_COMPILER.licenseSource]:PAGE_BROWSER_COMPILER.licensePath}:{})
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
    if(!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>RESOURCE_LIMITS.vendorBytes)
      throw new Error('Fixed vendor exceeds byte budget: '+row.source);
    await assertBytes(row.source,row.bytes,row.sha256);
    await assertBytes(row.licenseSource,undefined,row.licenseSha256);
  }
  for(const row of pageFrameworks){
    if(row.bytes>PAGE_FRAMEWORK_RESOURCE_LIMIT)throw new Error('Oversized opt-in Page framework: '+row.id);
    await assertBytes(row.source,row.bytes,row.sha256);
    const license=await readFile(row.licenseSource);
    if(license.length<100||license.length>8192)throw Error('Missing Page framework license: '+row.id);
  }
  for(const row of browserCompilerFiles){
    if(row.bytes>PAGE_BROWSER_COMPILER_RESOURCE_LIMIT)
      throw Error('Oversized optional browser compiler resource: '+row.id);
    await assertBytes(row.source,row.bytes,row.sha256);
  }
  if(edition==='developer')await assertBytes(PAGE_BROWSER_COMPILER.licenseSource,undefined,PAGE_BROWSER_COMPILER.licenseSha256);
  const publicRoot=resolve('.wxt/public');
  await rm(publicRoot,{recursive:true,force:true});
  await mkdir(publicRoot,{recursive:true});
  await mkdir(dirname(resolve(publicRoot,BROWSER_EDITION_RECORD)),{recursive:true});
  await writeFile(resolve(publicRoot,BROWSER_EDITION_RECORD),editionRecordText(edition));
  const marketChannel=resolveMarketChannel({mode:process.env.OPENDESK_BUILD_MODE||'development'});
  await mkdir(dirname(resolve(publicRoot,MARKET_CHANNEL_PATH)),{recursive:true});
  await writeFile(resolve(publicRoot,MARKET_CHANNEL_PATH),JSON.stringify(marketChannel,null,2)+'\n');
  for(const [src,dest] of Object.entries(STATIC_RESOURCES)){
    const target=resolve(publicRoot,dest);
    if(!target.startsWith(publicRoot+'/'))throw Error('Unsafe public asset output: '+dest);
    await mkdir(dirname(target),{recursive:true});
    await cp(src,target);
  }
  // Generate optional release assets once from trusted source projects.
  await buildOfficialTools(publicRoot);
  // Compile static Workspace CSS after the public directory is cleared.
  await compileWorkspaceStyle(publicRoot);
  await mkdir(resolve(publicRoot,'licenses'),{recursive:true});
  await mkdir(resolve(publicRoot,'icons'),{recursive:true});
  await cp('node_modules/lodash-es/LICENSE',resolve(publicRoot,'licenses/lodash-es-MIT.txt'));
  await cp('node_modules/dayjs/LICENSE',resolve(publicRoot,'licenses/dayjs-MIT.txt'));
  await cp('node_modules/js-cookie/LICENSE',resolve(publicRoot,'licenses/js-cookie-MIT.txt'));
  await cp('node_modules/crypto-js/LICENSE',resolve(publicRoot,'licenses/crypto-js-MIT.txt'));
  await cp('node_modules/file-saver/LICENSE.md',resolve(publicRoot,'licenses/file-saver-MIT.txt'));
  await cp('node_modules/query-string/license',resolve(publicRoot,'licenses/query-string-MIT.txt'));
  await cp('node_modules/axios/LICENSE',resolve(publicRoot,'licenses/axios-MIT.txt'));
  await cp('node_modules/store/LICENSE',resolve(publicRoot,'licenses/store-MIT.txt'));
  await cp('node_modules/cheerio/LICENSE',resolve(publicRoot,'licenses/cheerio-MIT.txt'));
  await cp('node_modules/@fingerprintjs/fingerprintjs/LICENSE',resolve(publicRoot,'licenses/fingerprintjs-MIT.txt'));
const notificationIcon = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACGklEQVR42u3d223DMBAEQNaSutJm6lNqCJKIe7ezgP8l7kgGbD7OERERERERWZWPz6/nNx8jWFQ2FAoHQukwKB4EpcOgeBAUD4LyIVA8CMqHQPEgKB8C5UOgfAiUD4HiQVA+BAAAoHwIlA9Bfvk/DQTDy//rQDCg/LcCQRCA26kH0Fp8CgTlQ/DUAJiSCgDKL0ag+EwI6wBsySoAyi9HoPxsBMqH4BkLoCUAADAPwIbyJ15LDIKp5W++ttcATHz6G6/x3xCYuDHzeuMBTP2xZcp11zz90/+Wjn4LKH/2fawGsGkuIgAA5AFQfjmC1MHasvgEAAD6AGwtP/n+AABgx+t/ygreFV8DAADg9d/8NeDp33WvAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOCnYD8F+zPIn0EAAOBrwOsfAABMCjUpFAAALAyxMAQCawMBAMDycMvDbRDRvEGELWLKt4ixSZRNomwT175NnI0in3EAbBX7iwFPuhb7BS+M3cIBAMCBEU4NcWSMM4McGuXkMMfGOTdwM4I3x8rRsaXFv14+BMq/AiAdwq3xODcDQXH5txEkQLh57yclm+bmTZqLeJKycZp28jT0k5hNS7aS7+UkZ9pGDtM+Z0IUVVw+BMoHAAAI6ssHQfEQKB8C5UOgfAiUD4LiIVA+CIqHQPm1EDRbCkGThRg0VgpBQ4UYNFEGwkgXoTCCIiIiIiKyK98xnCdLBZ58zAAAAABJRU5ErkJggg==';
await writeFile(resolve(publicRoot, 'icons/notification.png'), Buffer.from(notificationIcon, 'base64'));
}
