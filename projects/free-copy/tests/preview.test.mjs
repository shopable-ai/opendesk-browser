import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {generatePreview} from '../../../scripts/preview/build-preview.mjs';
import {createSidebarToolPackage} from '../../../scripts/build-sidebar-tool.mjs';

const project=resolve('projects/free-copy');
const mock=await readFile(new URL('../preview/mock-host.js',import.meta.url),'utf8');
function launch(scenario='success') {
  const handlers={},acks=[],root={dispatchEvent(){}};
  const parent={postMessage(message){acks.push(message);}};
  const env={document:{getElementById:()=>root},__opendeskPreviewScenario:scenario,
    parent,Event:class {},setTimeout:fn=>{fn();},window:{addEventListener(type,fn){handlers[type]=fn;}}};
  env.globalThis=env;
  vm.runInNewContext(mock,env,{timeout:1000});
  return {api:env.OpenDeskTool,acks,command(command,source=parent){
    handlers.message({source,data:{type:'opendesk.preview.free-copy.command.v1',command,requestId:'1'}});
  }};
}
test('preview runs the packaged UI bytes, canonical tokens and opaque sandbox; shipped preview stays fresh',async()=>{
  const pkg=await createSidebarToolPackage(project);
  const p=await generatePreview({tool:'free-copy'});
  assert.ok(p.frameHtml.includes('base64,'+Buffer.from(pkg.js).toString('base64')));
  assert.ok(p.frameHtml.includes('base64,'+Buffer.from(pkg.css).toString('base64')));
  assert.ok(p.frameHtml.includes(pkg.html));
  assert.match(pkg.css,/^\/\* opendesk.shared-tokens.v1/);
  assert.match(p.html,/sandbox="allow-scripts"/);
  assert.doesNotMatch(p.html,/allow-same-origin/);
  assert.match(p.frameHtml,/connect-src 'none'/);
  assert.doesNotMatch(pkg.html+pkg.js,/fc-preview|opendesk\.preview\.free-copy/);
  assert.doesNotMatch(p.frameHtml,/id="fc-preview-controls"/);
  assert.match(p.html,/id="fc-preview-controls"/);
  const stored=await readFile(new URL('../preview/index.html',import.meta.url),'utf8');
  const manifest=JSON.parse(stored.match(/id="opendesk-preview-manifest">([^<]+)<\/script>/)[1]);
  assert.equal(manifest.uiSha256,p.manifest.uiSha256,'regenerate preview after production changes');
  assert.deepEqual(manifest.adapterSources,p.manifest.adapterSources);
  for(const [name,hash] of Object.entries(manifest.adapterSources))
    assert.equal(hash,createHash('sha256').update(await readFile(resolve(project,'preview',name))).digest('hex'));
  assert.equal(p.html,(await generatePreview({tool:'free-copy'})).html);
});
test('mock keeps preferences through site changes and refresh, enforces CAS and rejects real page enforcement',async()=>{
  const f=launch(),read=()=>f.api.request('storage.get',{key:'preferences',withEtag:true});
  const before=await read();
  assert.equal(before.value,null);
  await f.api.request('storage.set',{key:'preferences',ifMatch:before.etag,value:{enabled:true,disabledOrigins:['https://example.invalid']}});
  f.command('site-b');
  assert.equal((await f.api.request('currentPage.info')).url,'https://other.invalid/article');
  f.command('refresh');f.command('site-a');
  assert.deepEqual(Array.from((await read()).value.disabledOrigins),['https://example.invalid']);
  await assert.rejects(f.api.request('storage.set',{key:'preferences',ifMatch:before.etag}),/E_STORAGE_CONFLICT/);
  await assert.rejects(f.api.request('page.request',{operation:'copy.refresh'}),/NOT_INSTALLED/);
  await assert.rejects(f.api.request('browser.clipboard.readText'),/E_PREVIEW_OPERATION/);
});
test('save failure leaves preferences unchanged; read failure and unavailable page can recover in memory',async()=>{
  const f=launch('save-error');
  const before=await f.api.request('storage.get',{key:'preferences',withEtag:true});
  await assert.rejects(f.api.request('storage.set',{key:'preferences',ifMatch:before.etag,value:{enabled:false}}),/E_PREVIEW_SAVE/);
  assert.equal((await f.api.request('storage.get',{key:'preferences'})).value,null);
  const broken=launch('error');
  await assert.rejects(broken.api.request('storage.get',{key:'preferences'}),/E_PREVIEW_READ/);
  broken.command('recover');
  assert.equal((await broken.api.request('storage.get',{key:'preferences'})).value,null);
  broken.command('unavailable');
  assert.equal((await broken.api.request('currentPage.info')).status,'unavailable');
  broken.command('recover');
  assert.equal((await broken.api.request('currentPage.info')).status,'available');
});
test('diagnostics ignore wrong source/unknown commands and cannot change website during save',async()=>{
  const f=launch();
  f.command('site-b',{});f.command('execute-code');
  assert.equal(f.acks.length,0);
  f.api.setState({busy:true});f.command('site-b');
  assert.match(f.acks[0].message,/正在保存/);
  assert.equal((await f.api.request('currentPage.info')).url,'https://example.invalid/article');
});
