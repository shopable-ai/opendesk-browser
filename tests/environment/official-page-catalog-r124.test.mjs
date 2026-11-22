import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {digest,digestUtf8} from '../../src/platform/protocol.js';
import {
  createOfficialPageResources,officialPageInputs,readOfficialPageSources,writeOfficialPageResources
} from '../../scripts/build-official-pages.mjs';
import {OFFICIAL_PAGE_SOURCE_PATH,OFFICIAL_PAGE_CATALOG_PATH}
  from '../../src/scripting/user-scripts/official-page-catalog.js';
import {
  validateOfficialPageSources,validateOfficialPageReleases,loadOfficialPageCatalog,
  loadOfficialPagePackage
} from '../../src/scripting/user-scripts/official-page-catalog.js';

const clone=value=>structuredClone(value);
const expectedIds=['opendesk.ai-scroll-navigation','opendesk.ai-reply-mindmap'];
const approvalDir='official-pages/preinstalled/'+expectedIds[0];
const approvedPath=approvalDir+'/0.4.10-r14.opendesk-page.json';
const releasePath=approvalDir+'/release.json';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

test('R1.2.4 official Page source keeps exact independent IDs, sites and default installation policy',async()=>{
  const source=await readOfficialPageSources();
  assert.deepEqual(source.programs.map(row=>row.programId),expectedIds);
  assert.deepEqual(source.programs[0].sites,[
    'https://chatgpt.com/*','https://chat.deepseek.com/*','https://gemini.google.com/*'
  ]);
  assert.deepEqual(source.programs.slice(1).map(row=>row.sites),[
    ['https://chatgpt.com/*']
  ]);
  assert.deepEqual(source.programs.map(row=>row.publication),['blocked','blocked']);
  assert.equal(source.programs[0].project,'projects/ai-scroll-navigation');
  assert.deepEqual(await officialPageInputs(),[approvedPath,releasePath,OFFICIAL_PAGE_SOURCE_PATH]);
  assert.equal(source.programs[0].installationPolicy,'preinstalled');
  for(const row of source.programs.slice(1))assert.match(row.blockedReason,/./);
});

test('approval requires the archived preinstall bytes and the project release to match',async t=>{
  const root=await mkdtemp(join(tmpdir(),'official-scroll-project-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const source=clone(await readOfficialPageSources());
  const scroll=source.programs.find(row=>row.programId==='opendesk.ai-scroll-navigation');
  scroll.publication='approved';
  delete scroll.blockedReason;
  const projectPath=join(scroll.project,scroll.packageFile);
  const bytes=await readFile(projectPath);
  const pin={version:scroll.version,revision:scroll.revision,sha256:sha256(bytes)};
  const archivePath=approvalDir+'/'+scroll.version+'-r'+scroll.revision+'.opendesk-page.json';
  await mkdir(join(root,dirname(archivePath)),{recursive:true});
  await mkdir(join(root,scroll.project),{recursive:true});
  await writeFile(join(root,OFFICIAL_PAGE_SOURCE_PATH),JSON.stringify(source,null,2)+'\n');
  await writeFile(join(root,releasePath),JSON.stringify(pin));
  await writeFile(join(root,archivePath),bytes);
  await writeFile(join(root,projectPath),Buffer.concat([bytes,Buffer.from('\n')]));
  await assert.rejects(createOfficialPageResources({root}),/已批准预装包与项目正式包不一致/);
  await writeFile(join(root,projectPath),bytes);
  assert.deepEqual(await officialPageInputs(root),[archivePath,releasePath,OFFICIAL_PAGE_SOURCE_PATH,projectPath]);
  const {catalog,resources}=await createOfficialPageResources({root});
  assert.equal(catalog.apps[0].revision,scroll.revision);
  assert.deepEqual(resources.get(catalog.apps[0].packagePath),bytes);
});

test('a blocked navigation candidate ships the exact approved preinstall; Mind Map remains blocked',async()=>{
  const {catalog,resources}=await createOfficialPageResources();
  const [scroll,mindMap]=catalog.apps;
  assert.deepEqual(catalog.apps.map(row=>row.programId),expectedIds);
  assert.equal(scroll.status,'available');
  assert.equal(scroll.version,'0.4.10');
  assert.equal(scroll.revision,14);
  assert.deepEqual([...resources.keys()],[scroll.packagePath,OFFICIAL_PAGE_CATALOG_PATH]);
  assert.deepEqual(resources.get(scroll.packagePath),await readFile(approvedPath));
  assert.equal(scroll.sha256,sha256(resources.get(scroll.packagePath)));
  assert.equal(mindMap.status,'blocked');
  for(const key of ['packagePath','sha256','sourceHash']){
    assert.equal(key in mindMap,false);
  }
  assert.deepEqual(validateOfficialPageReleases(catalog),catalog);
});

test('regenerating an old bundled catalog removes only the retired standalone queue resource',async t=>{
  const output=await mkdtemp(join(tmpdir(),'official-page-retirement-'));
  t.after(()=>rm(output,{recursive:true,force:true}));
  const result=await createOfficialPageResources();
  const retired='official-pages/opendesk.ai-send-queue/opendesk.ai-send-queue.opendesk-page.json';
  await mkdir(join(output,'official-pages/opendesk.ai-send-queue'),{recursive:true});
  await writeFile(join(output,retired),'historical generated bytes');
  await writeFile(join(output,OFFICIAL_PAGE_CATALOG_PATH),JSON.stringify({...result.catalog,
    apps:[...result.catalog.apps,{...result.catalog.apps[1],programId:'opendesk.ai-send-queue',
      installationPolicy:'reviewed'}]}));
  await writeOfficialPageResources(result,output);
  await assert.rejects(readFile(join(output,retired)),{code:'ENOENT'});
  assert.deepEqual(JSON.parse(await readFile(join(output,OFFICIAL_PAGE_CATALOG_PATH))),result.catalog);
  await assert.rejects(writeOfficialPageResources(result,output,{ownedPaths:['official-pages/unowned.json']}),
    /不安全的旧官方资源路径/);
});

test('R1.2.4 source catalog rejects spoofing IDs, site expansion, release, and package path',async()=>{
  const source=JSON.parse(await readFile(OFFICIAL_PAGE_SOURCE_PATH,'utf8'));
  for(const change of [
    row=>{row.programId='opendesk.fake-page';},
    row=>{row.sites.push('https://example.com/*');},
    row=>{row.publication='available';},
    row=>{row.packageFile='../attack.opendesk-page.json';},
    row=>{row.installationPolicy='reviewed';}
  ]){
    const modified=clone(source);
    change(modified.programs[0]);
    assert.throws(()=>validateOfficialPageSources(modified),{code:'E_PAGE_CATALOG'});
  }
});

test('R1.2.4 extension-origin catalog fetch never authorizes a blocked install',async()=>{
  const {catalog,resources}=await createOfficialPageResources();
  const bytes=resources.get(OFFICIAL_PAGE_CATALOG_PATH),requests=[];
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path}};
  const fetcher=async url=>{
    requests.push(url);
    assert.equal(url,api.runtime.getURL(OFFICIAL_PAGE_CATALOG_PATH));
    return {ok:true,url,redirected:false,headers:{get:key=>key==='content-length'?String(bytes.length):null},
      arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  };
  assert.deepEqual(await loadOfficialPageCatalog({api,fetcher}),catalog);
  await assert.rejects(loadOfficialPagePackage(catalog.apps[1],{api,fetcher}),
    {code:'E_PAGE_RELEASE_CHANGED'});
  const candidate={...catalog.apps[0],version:'0.4.25',revision:28};
  await assert.rejects(loadOfficialPagePackage(candidate,{api,fetcher}),{code:'E_PAGE_RELEASE_CHANGED'});
  assert.equal(requests.length,3,'blocked candidates only read catalog, never package bytes');
});

test('document_end official Page builder and loader preserve catalog identity and byte integrity',async t=>{
  const root=await mkdtemp(join(tmpdir(),'official-dom-ready-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const source=clone(await readOfficialPageSources()),base=source.programs[0];
  base.publication='approved';delete base.blockedReason;
  const sourceUtf8='async function main(){return "DOM ready";}';
  const payload={format:'opendesk.page-install.v1',programId:base.programId,version:base.version,
    title:base.title,revision:base.revision,entryFormat:'async-main',sourceUtf8,
    sourceHash:await digestUtf8(sourceUtf8),pageRules:{matches:base.sites,excludeMatches:[],
      runAt:'document_end',allFrames:false,world:'USER_SCRIPT'}};
  const pkg={...payload,packageHash:await digest(payload)},bytes=JSON.stringify(pkg);
  const archivePath=approvalDir+'/'+base.version+'-r'+base.revision+'.opendesk-page.json';
  await mkdir(join(root,dirname(archivePath)),{recursive:true});
  await mkdir(join(root,base.project),{recursive:true});
  await writeFile(join(root,OFFICIAL_PAGE_SOURCE_PATH),JSON.stringify(source));
  await writeFile(join(root,releasePath),JSON.stringify({version:base.version,revision:base.revision,sha256:sha256(bytes)}));
  await writeFile(join(root,archivePath),bytes);
  await writeFile(join(root,base.project,base.packageFile),bytes);
  const {catalog,resources}=await createOfficialPageResources({root}),release=catalog.apps[0];
  assert.equal(release.status,'available');
  assert.equal(release.packageHash,pkg.packageHash);
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path}};
  const fetcher=async url=>new Response(resources.get(new URL(url).pathname.slice(1)));
  assert.deepEqual((await loadOfficialPagePackage(release,{api,fetcher})).pkg,pkg);
  resources.set(release.packagePath,bytes+' ');
  await assert.rejects(loadOfficialPagePackage(release,{api,fetcher}),{code:'E_PAGE_PACKAGE_INTEGRITY'});
});
