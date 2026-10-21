import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installedSiteAllowed,blockedInstalledOrigins,changeInstalledSiteAccess} from '../../src/ui/sidebar-tools/site-grants.js';
import {clipGrantAllowed,changeClipGrant,CLIP_SITE_STORE,CLIP_PROTOCOL} from '../../examples/sidebar-tools/web-markdown-clipper/trusted/policy.js';
import {initPageClip} from '../../examples/sidebar-tools/web-markdown-clipper/trusted/page.js';
import {captureAllowed,changeCaptureGrant} from '../../src/knowledge/policy.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const clip=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json',import.meta.url),'utf8'));
const knowledgeRoot=new URL('../../examples/sidebar-tools/knowledge-inbox/',import.meta.url);
const {files,...knowledgeConfig}=JSON.parse(await readFile(new URL('tool.config.json',knowledgeRoot),'utf8'));
const knowledge=validateSidebarToolPackage({...knowledgeConfig,format:'opendesk.sidebar-tool.v1',
  ...Object.fromEntries(await Promise.all(['html','css','js'].map(async kind=>
    [kind,await readFile(new URL(files[kind],knowledgeRoot),'utf8')])))});
const url='https://news.example/article';

test('installed clipper reads supported sites immediately without writing another grant',()=>{
  for(const settings of [undefined,{}, {[clip.id]:['https://legacy.example']}]){
    assert.equal(clipGrantAllowed([clip],settings,clip.id,url,{}),true);
    assert.equal(clipGrantAllowed([clip],settings,clip.id,'https://another.example/story',{}),true);
  }
  assert.equal(clipGrantAllowed([],{},clip.id,url,{}),false);
  assert.equal(clipGrantAllowed([{...clip,capabilities:['page.toc']}],{},clip.id,url,{}),false);
  assert.equal(clipGrantAllowed([clip],{},clip.id,url,{[clip.id]:false}),false);
  assert.equal(clipGrantAllowed([clip],{},clip.id,url,[]),false);
  for(const target of ['chrome://settings','file:///tmp/article','https://user:secret@news.example'])
    assert.equal(clipGrantAllowed([clip],{},clip.id,target,{}),false);
});

test('explicit website stop survives serialization, affects one origin, and can be restored',()=>{
  const initial={other:{mode:'all-except',blockedOrigins:['https://keep.example']}};
  const stopped=JSON.parse(JSON.stringify(changeClipGrant(initial,clip.id,url,false)));
  assert.equal(clipGrantAllowed([clip],stopped,clip.id,url,{}),false);
  assert.equal(clipGrantAllowed([clip],stopped,clip.id,'https://news.example/other',{}),false);
  assert.equal(clipGrantAllowed([clip],stopped,clip.id,'https://another.example',{}),true);
  assert.deepEqual(blockedInstalledOrigins(stopped,clip.id),['https://news.example']);
  assert.deepEqual(changeClipGrant(stopped,clip.id,url,true),initial);
  assert.deepEqual(initial,{other:{mode:'all-except',blockedOrigins:['https://keep.example']}});
});

test('corrupt preferences cannot enable reads or be overwritten by a restore',()=>{
  for(const settings of [null,[],false,{[clip.id]:null},{[clip.id]:true},
    {[clip.id]:['https://news.example/path']},
    {[clip.id]:{mode:'all-except',blockedOrigins:[],unknown:true}},
    {[clip.id]:{mode:'all-except',blockedOrigins:['https://user:secret@news.example']}}]){
    assert.equal(installedSiteAllowed(settings,clip.id,url),false);
    assert.throws(()=>changeInstalledSiteAccess(settings,clip.id,url,true),/损坏/);
  }
});

test('site exception limit preserves existing denials and other tools',()=>{
  let settings={};
  for(let i=0;i<64;i++)settings=changeClipGrant(settings,clip.id,`https://site-${i}.example`,false);
  assert.throws(()=>changeClipGrant(settings,clip.id,'https://overflow.example',false),/64/);
  assert.equal(blockedInstalledOrigins(settings,clip.id).length,64);
  assert.equal(installedSiteAllowed(settings,clip.id,'https://site-63.example'),false);
  assert.equal(blockedInstalledOrigins(changeClipGrant(settings,clip.id,'https://site-63.example',true),clip.id).length,63);
});

test('knowledge save uses the same default while keeping its fixed site and capability scope',()=>{
  const chat='https://chatgpt.com/c/answer';
  assert.equal(captureAllowed([knowledge],undefined,chat,{}),true);
  assert.equal(captureAllowed([knowledge],changeCaptureGrant({},knowledge.id,chat,false),chat,{}),false);
  assert.equal(captureAllowed([knowledge],{},'https://chatgpt.com.evil.example/c/answer',{}),false);
  assert.equal(captureAllowed([knowledge],{},url,{}),false);
  assert.equal(captureAllowed([{...knowledge,capabilities:['knowledge.store']}],{},chat,{}),false);
  assert.equal(captureAllowed([knowledge],{},chat,{[knowledge.id]:false}),false);
});

test('real page clip handler accepts first use, rejects stale instances and cancels a site stop during reading',async()=>{
  const epoch='current-install',extensionId='trusted-test-extension';
  const values={[SIDEBAR_TOOL_STORE]:[clip],[TOOL_REVOCATION_EPOCHS_STORE]:{[clip.id]:epoch}};
  let listener,reads=0,stopDuringRead=false;
  const api={runtime:{id:extensionId,getURL:path=>`chrome-extension://${extensionId}/${path}`,
    onMessage:{addListener:fn=>{listener=fn;},removeListener:()=>{listener=null;}}},
    storage:{local:{get:async keys=>{
      reads++;
      if(stopDuringRead&&reads===2)values[CLIP_SITE_STORE]=changeClipGrant({},clip.id,url,false);
      return Object.fromEntries(keys.map(key=>[key,values[key]]));
    }}}};
  const win={location:{href:url,hostname:'news.example'},addEventListener(){}};win.top=win;
  const service=initPageClip({api,doc:{title:'A real page'},win});
  const sender={id:extensionId,url:`chrome-extension://${extensionId}/sidepanel.html?hostInstanceId=12345678-1234-4234-8234-123456789abc`};
  const ask=installEpoch=>new Promise(resolve=>listener({protocol:CLIP_PROTOCOL,operation:'clip.link',
    toolId:clip.id,expectedUrl:url,installEpoch},sender,resolve));
  try{
    assert.equal((await ask(epoch)).ok,true);
    assert.equal(Object.hasOwn(values,CLIP_SITE_STORE),false,'normal use creates no permission records');
    assert.equal((await ask('old-install')).ok,false);
    reads=0;stopDuringRead=true;
    assert.equal((await ask(epoch)).ok,false,'a stop before the result is returned revokes its body');
    values[SIDEBAR_TOOL_ENABLE_STORE]={[clip.id]:false};
    assert.equal((await ask(epoch)).ok,false);
  }finally{service.dispose();}
});
