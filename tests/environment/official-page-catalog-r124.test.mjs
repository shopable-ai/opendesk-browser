import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  createOfficialPageResources,officialPageInputs,readOfficialPageSources
} from '../../scripts/build-official-pages.mjs';
import {OFFICIAL_PAGE_SOURCE_PATH,OFFICIAL_PAGE_CATALOG_PATH}
  from '../../src/scripting/user-scripts/official-page-catalog.js';
import {
  validateOfficialPageSources,validateOfficialPageReleases,loadOfficialPageCatalog,
  loadOfficialPagePackage
} from '../../src/scripting/user-scripts/official-page-catalog.js';

const clone=value=>structuredClone(value);
const expectedIds=['opendesk.ai-scroll-navigation','opendesk.ai-reply-mindmap','opendesk.ai-send-queue'];

test('R1.2.4 official Page source keeps exact independent IDs, sites and blocked gates',async()=>{
  const source=await readOfficialPageSources();
  assert.deepEqual(source.programs.map(row=>row.programId),expectedIds);
  assert.deepEqual(source.programs[0].sites,[
    'https://chatgpt.com/*','https://chat.deepseek.com/*','https://gemini.google.com/*'
  ]);
  assert.deepEqual(source.programs.slice(1).map(row=>row.sites),[
    ['https://chatgpt.com/*'],['https://chatgpt.com/*']
  ]);
  assert.deepEqual(source.programs.map(row=>row.publication),['blocked','blocked','blocked']);
  assert.deepEqual(await officialPageInputs(),[
    'examples/sidebar-tools/ai-send-queue/ai-send-queue.opendesk-page.json',OFFICIAL_PAGE_SOURCE_PATH]);
  for(const row of source.programs)assert.match(row.blockedReason,/./);
});

test('blocked discovery stays metadata only while exact queue review bytes remain separate',async()=>{
  const {catalog,resources}=await createOfficialPageResources();
  const candidatePath='official-pages/opendesk.ai-send-queue/opendesk.ai-send-queue.opendesk-page.json';
  assert.deepEqual([...resources.keys()],[candidatePath,OFFICIAL_PAGE_CATALOG_PATH]);
  assert.deepEqual(resources.get(candidatePath),await readFile(
    'examples/sidebar-tools/ai-send-queue/ai-send-queue.opendesk-page.json'));
  assert.equal(catalog.apps.length,3);
  for(const row of catalog.apps){
    assert.equal(row.kind,'page-program');
    assert.equal(row.status,'blocked');
    assert.equal('packagePath' in row,false);
    assert.equal('sha256' in row,false);
    assert.equal('sourceHash' in row,false);
  }
  assert.deepEqual(validateOfficialPageReleases(catalog),catalog);
});

test('R1.2.4 source catalog rejects spoofing IDs, site expansion, release, and package path',async()=>{
  const source=JSON.parse(await readFile(OFFICIAL_PAGE_SOURCE_PATH,'utf8'));
  for(const change of [
    row=>{row.programId='opendesk.fake-page';},
    row=>{row.sites.push('https://example.com/*');},
    row=>{row.publication='available';},
    row=>{row.packageFile='../attack.opendesk-page.json';},
    row=>{row.installationPolicy='preinstalled';}
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
  await assert.rejects(loadOfficialPagePackage(catalog.apps[0],{api,fetcher}),
    {code:'E_PAGE_RELEASE_CHANGED'});
  await assert.rejects(loadOfficialPagePackage(catalog.apps[2],{api,fetcher}),
    {code:'E_PAGE_RELEASE_CHANGED'});
  assert.equal(requests.length,3,'blocked candidates only read catalog, never package bytes');
});
