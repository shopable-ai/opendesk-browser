import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageProgramLibrary} from '../../src/ui/page-program-library.js';

// UI component boundary only. Native permission prompts have separate evidence.
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
class Element{
  value='';textContent='';disabled=false;hidden=false;children=[];listeners=new Map();
  addEventListener(name,fn){const list=this.listeners.get(name)||new Set();list.add(fn);this.listeners.set(name,list);}
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  fire(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event);}
  replaceChildren(){this.children=[];this.value='';}
  append(child){this.children.push(child);if(this.children.length===1)this.value=child.value;}
}
const events=()=>{const listeners=new Set();return{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:value=>{for(const fn of listeners)fn(value);}};};
const installationId='11111111-1111-4111-8111-111111111111';
const rules=site=>({matches:[site],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'});
const candidate=(revision=1,site='https://a.example/*')=>({programId:'page-a',revision,manifestHash:String(revision).repeat(64),sourceHash:'a'.repeat(64),
  stage:'Verified',pageRules:rules(site),installed:null,authorizationChange:{requiresConfirmation:false,addedSites:[],removedExclusions:[],changedExecution:false}});
async function fixture(catalog=[candidate()]){
  const nodes=new Map(['list','status','detail','load','verify','install','toggle','refresh','restore'].map(id=>[id,new Element()]));
  const doc={getElementById:id=>nodes.get(id.replace('page-program-','')),createElement:()=>new Element()};
  const grants=new Set(['https://a.example/*']),requests=[],calls=[];
  const api={permissions:{onAdded:events(),onRemoved:events(),contains:async request=>(request.origins||[]).every(value=>grants.has(value)),
    request:request=>{requests.push(structuredClone(request));for(const origin of request.origins||[])grants.add(origin);return Promise.resolve(true);}}};
  const client={ready:Promise.resolve(),request:async(method,input)=>{
    calls.push({method,input:structuredClone(input)});
    if(method==='listPagePrograms')return{catalog:structuredClone(catalog)};
    const row=catalog.find(row=>row.programId===input.programId&&(!input.revision||row.revision===input.revision));
    if(method==='verifyPageCandidate'){row.stage='Verified';return{stage:'Verified'};}
    if(method==='makePageAvailable'){row.stage='Available';return{stage:'Available'};}
    if(method==='installPageProgram'){
      row.installed={revision:row.revision,manifestHash:row.manifestHash,pageRules:row.pageRules,enabled:true,nativeState:'registered',
        authorization:{installationId,status:'active',generation:(input.expectedGeneration??0)+1}};
      return row.installed;
    }
    if(method==='setInstalledPageEnabled'){
      row.installed.enabled=input.enabled;row.installed.authorization.status=input.enabled?'active':'disabled';
      row.installed.authorization.generation++;return row.installed;
    }
    throw Error('Unexpected '+method);
  }};
  const target={capture:()=>({tabId:1,documentId:'document-a',url:'https://a.example/',windowId:1}),revalidate:async()=>true};
  const ui=createPageProgramLibrary({client,currentPageTarget:target,api,document:doc,onLoad:async()=>{}});
  await tick();await tick();
  return{ui,api,client,target,catalog,grants,requests,calls,get:id=>nodes.get(id),
    click:async id=>{nodes.get(id).fire('click',{isTrusted:true});await tick();await tick();}};
}

test('Page Verify, Install and Enable reuse native grants and keep program authorization in the existing RPC',async t=>{
  const row=candidate();row.stage='Candidate';const f=await fixture([row]);t.after(()=>f.ui.dispose());
  await f.click('verify');await f.click('install');
  assert.equal(f.requests.length,0);assert.equal(f.calls.filter(row=>row.method==='installPageProgram').length,1);
  assert.match(f.get('detail').textContent,/已授权/);assert.equal(f.get('restore').hidden,true);
  await f.click('toggle');await f.click('toggle');assert.equal(f.requests.length,0);
  const enables=f.calls.filter(row=>row.method==='setInstalledPageEnabled');
  assert.deepEqual(enables.map(row=>row.input.expectedGeneration),[1,2]);
  assert.equal(enables[1].input.enabled,true);
});

test('scope expansion is visible and only new Chrome sites are requested synchronously by Install',async t=>{
  const row=candidate(2);row.pageRules.matches.push('https://b.example/*');
  row.installed={...candidate(),enabled:true,nativeState:'registered',authorization:{generation:4,status:'active'}};
  row.authorizationChange={requiresConfirmation:true,addedSites:['https://b.example/*'],removedExclusions:[],changedExecution:false};
  const f=await fixture([row]);t.after(()=>f.ui.dispose());
  assert.match(f.get('detail').textContent,/新增权限需要确认：新增网站 https:\/\/b.example/);
  assert.equal(f.get('install').textContent,'确认新增权限并升级');
  f.get('install').fire('click',{isTrusted:false});assert.equal(f.requests.length,0);
  f.get('install').fire('click',{isTrusted:true});assert.deepEqual(f.requests,[{origins:['https://b.example/*']}]);
  assert.equal(f.get('list').disabled,true);await tick();await tick();
  const install=f.calls.find(row=>row.method==='installPageProgram');
  assert.equal(install.input.expectedGeneration,4);assert.equal(install.input.expectedInstalledManifestHash,'1'.repeat(64));
});

test('Restore acts on the selected candidate scope and cannot silently enable a different installed version',async t=>{
  const row=candidate(2,'https://b.example/*');
  row.installed={...candidate(),enabled:true,nativeState:'blocked',authorization:{generation:5,status:'suspended'}};
  const f=await fixture([row]);t.after(()=>f.ui.dispose());
  assert.equal(f.get('restore').hidden,false);await f.click('restore');
  assert.deepEqual(f.requests,[{origins:['https://b.example/*']}]);
  assert.equal(f.calls.filter(row=>row.method==='setInstalledPageEnabled').length,0);
  assert.match(f.get('status').textContent,/请验证并明确安装/);
  assert.equal(row.installed.authorization.status,'suspended');
});

test('restoring the current suspended installation is explicit, silent if Chrome is already granted, and never executes',async t=>{
  const row=candidate();row.installed={...row,enabled:true,nativeState:'blocked',authorization:{installationId,generation:5,status:'suspended'}};
  const f=await fixture([row]);t.after(()=>f.ui.dispose());await f.click('restore');
  assert.equal(f.requests.length,0);assert.equal(row.installed.authorization.generation,6);
  assert.deepEqual(f.calls.filter(row=>row.method!=='listPagePrograms').map(row=>row.method),['setInstalledPageEnabled']);
  assert.match(f.get('status').textContent,/未重放/);
});

test('a late Worker suspension is restored by one click, while concurrent disable or reinstall is never revived',async t=>{
  for(const change of ['suspend','disable','reinstall']){
    const row=candidate();row.installed={...row,enabled:true,nativeState:'registered',authorization:{installationId,generation:1,status:'active'}};
    const f=await fixture([row]);t.after(()=>f.ui.dispose());
    f.grants.clear();f.api.permissions.onRemoved.emit({origins:['https://a.example/*']});
    // The refresh has captured old active catalog state; the Worker now commits
    // revocation before the upcoming trusted Restore click.
    row.installed.authorization.status='suspended';row.installed.authorization.generation=2;
    if(change==='disable'){row.installed.enabled=false;row.installed.authorization.status='disabled';}
    if(change==='reinstall')row.installed.authorization.installationId='22222222-2222-4222-8222-222222222222';
    await tick();await tick();await f.click('restore');
    assert.equal(f.requests.length,1);
    const restored=f.calls.filter(row=>row.method==='setInstalledPageEnabled');
    assert.equal(restored.length,change==='suspend'?1:0);
    if(change==='suspend'){assert.equal(restored[0].input.expectedGeneration,2);assert.equal(row.installed.authorization.status,'active');}
    if(change==='disable')assert.match(f.get('status').textContent,/仍已停用/);
    if(change==='reinstall')assert.match(f.get('status').textContent,/E_REVISION/);
  }
});

test('permission revocation invalidates the preflight and a closed panel never installs after late approval',async t=>{
  const row=candidate(),f=await fixture([row]);t.after(()=>f.ui.dispose());
  f.grants.clear();f.api.permissions.onRemoved.emit({origins:['https://a.example/*']});
  assert.equal(f.get('install').disabled,true);await tick();
  let release;f.api.permissions.request=request=>{f.requests.push(request);return new Promise(resolve=>release=resolve);};
  f.get('install').fire('click',{isTrusted:true});assert.equal(f.requests.length,1);
  f.ui.dispose();f.grants.add('https://a.example/*');release(true);await tick();await tick();
  assert.equal(f.calls.filter(row=>row.method==='installPageProgram').length,0);
});
