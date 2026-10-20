// R2.15 Service Worker gesture bridge unit tests. Not a native-Chrome acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {handlePromptRailOpen,PROMPT_RAIL_OPEN_PROTOCOL}
  from '../../examples/sidebar-tools/prompt-shortcuts/trusted/rail-open.js';

test('R2.15 fixed build admits exact reviewed rail code only in its two owners',async()=>{
  const path='examples/sidebar-tools/prompt-shortcuts/trusted/rail-open.js';
  const describe=(target,root=process.cwd(),input=path)=>describeBundle({root,
    chunk:{fileName:target,modules:{[resolve(root,input)]:{renderedLength:1,originalLength:1}}},lock:{packages:{}}});
  for(const target of ['sw.js','agents/page-relay.js'])
    assert.equal(describe(target).modules[0].reviewedFirstPartyBlob,'d8650195e9b43178caafa015edaf60649d994b2f');
  for(const target of ['ui/sidebar-tool-host.js','ui/tool-shell.js'])
    assert.throws(()=>describe(target),/cannot enter a privileged fixed bundle/);
  for(const name of ['model.js','policy.js','page.js'])
    assert.throws(()=>describe('sw.js',process.cwd(),path.replace('rail-open.js',name)),/cannot enter a privileged fixed bundle/);
  assert.equal(describe('agents/page-relay.js',process.cwd(),path.replace('rail-open.js','page.js')).modules[0].reviewedFirstPartyBlob,
    'c39f288fb30739549733806996b2ef6faffc37d7');
  const root=await realpath(await mkdtemp(join(tmpdir(),'prompt-rail-provenance-')));
  try{
    await mkdir(resolve(root,'examples/sidebar-tools/prompt-shortcuts/trusted'),{recursive:true});
    for(const input of [path,path.replace('rail-open.js','page.js')]){
      await writeFile(resolve(root,input),(await readFile(input,'utf8'))+'\n// unreviewed change\n');
      assert.throws(()=>describe('agents/page-relay.js',root,input),/review and re-pin/);
    }
    assert.throws(()=>describe('sw.js',root),/review and re-pin/);
  }finally{await rm(root,{recursive:true,force:true});}
});

const sender=()=>({id:'opendesk',frameId:0,documentLifecycle:'active',
  url:'https://chatgpt.com/c/test',tab:{id:8,windowId:3,
    url:'https://chatgpt.com/c/test',incognito:false}});
const message=()=>({protocol:PROMPT_RAIL_OPEN_PROTOCOL,expectedUrl:'https://chatgpt.com/c/test'});
const reply=()=>{const received=[];return {received,respond:x=>received.push(x)};};

test('Built-in site OD entry opens only the current exact DeepSeek/Gemini page',async()=>{
  const urls=['https://chat.deepseek.com/',
    'https://chat.deepseek.com/a/chat/s/01234567-89ab-cdef',
    'https://gemini.google.com/app','https://gemini.google.com/app/01234567'];
  for(const url of urls){
    let opened=0;
    const s=sender(),r=reply();s.url=s.tab.url=url;
    handlePromptRailOpen({api:{runtime:{id:'opendesk'},sidePanel:{open(){opened++;return Promise.resolve();}},
      storage:{session:{set:async()=>{}}}},sender:s,
      message:{...message(),expectedUrl:url},respond:r.respond});
    assert.equal(opened,1,'native panel opens synchronously on '+url);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(r.received[0]?.ok,true);
  }
  for(const url of ['https://gemini.google.com/','https://gemini.google.com/settings',
    'https://chat.deepseek.com/settings','https://chat.deepseek.com/a/chat/s/id/extra',
    'https://chat.deepseek.com:444/','https://user@chat.deepseek.com/',
    'https://gemini.google.com.evil.example/app']){
    let opened=0;
    const s=sender(),r=reply();s.url=s.tab.url=url;
    handlePromptRailOpen({api:{runtime:{id:'opendesk'},sidePanel:{open(){opened++;}}},sender:s,
      message:{...message(),expectedUrl:url},respond:r.respond});
    assert.equal(opened,0);assert.equal(r.received[0]?.error?.code,'E_SENDER');
  }
  const s=sender(),r=reply();s.url='https://gemini.google.com/app';
  s.tab.url='https://gemini.google.com/app/other';
  let opened=0;
  handlePromptRailOpen({api:{runtime:{id:'opendesk'},sidePanel:{open(){opened++;}}},sender:s,
    message:{...message(),expectedUrl:s.url},respond:r.respond});
  assert.equal(opened,0);assert.equal(r.received[0]?.error?.code,'E_SENDER');
});

test('R2.15 genuine top-level ChatGPT sender opens existing Chrome panel synchronously',async()=>{
  const r=reply();let opened=0,complete;
  const api={runtime:{id:'opendesk'},storage:{session:{set:async()=>{}}},sidePanel:{open(params){
    opened++;assert.deepEqual(params,{windowId:3});
    return new Promise(resolve=>{complete=resolve;});
  }}};
  assert.equal(handlePromptRailOpen({api,message:message(),sender:sender(),respond:r.respond}),true);
  assert.equal(opened,1,'must call sidePanel.open before any awaited permission/storage read');
  assert.deepEqual(r.received,[]);
  complete();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(r.received,[{ok:true,data:{opened:true}}]);
});

test('R2.15 rejection, missing sidePanel, and denied sender never claim success',async()=>{
  for(const mutate of [
    s=>{s.frameId=1;},s=>{s.tab.incognito=true;},s=>{s.id='other-extension';},
    s=>{s.documentLifecycle='prerender';},s=>{s.tab.windowId=-1;},
    s=>{s.url='https://chatgpt.com.evil.example/';},
    s=>{s.tab.url='https://evil.example/';}
  ]){
    const s=sender();mutate(s);const r=reply();let opened=0;
    assert.equal(handlePromptRailOpen({api:{runtime:{id:'opendesk'},
      sidePanel:{open(){opened++;}}},message:message(),sender:s,respond:r.respond}),true);
    assert.equal(opened,0,'invalid sender cannot open Chrome UI');
    assert.equal(r.received[0]?.error?.code,'E_SENDER');
  }
  const r=reply();
  assert.equal(handlePromptRailOpen({api:{runtime:{id:'opendesk'}},
    message:message(),sender:sender(),respond:r.respond}),true);
  assert.equal(r.received[0]?.error?.code,'E_CHROME_UNSUPPORTED');
  const rejected=reply();
  handlePromptRailOpen({api:{runtime:{id:'opendesk'},
    storage:{session:{set:async()=>{}}},
    sidePanel:{open:()=>Promise.reject(Error('gesture lost'))}},
    message:message(),sender:sender(),respond:rejected.respond});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(rejected.received,[{ok:false,error:{code:'E_SIDE_PANEL'}}]);
});

test('R2.15 never intercepts unrelated Foundation messages',()=>{
  const r=reply();
  assert.equal(handlePromptRailOpen({api:{runtime:{id:'opendesk'}},
    message:{protocol:'opendesk.foundation.v1'},sender:sender(),respond:r.respond}),false);
  assert.deepEqual(r.received,[]);
});
