import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPageDependencyPanel} from '../../src/ui/page-dependencies.js';
import {parseUserScriptDependencies,assessUserScriptExecution} from '../../src/scripting/user-scripts/dependency-metadata.js';

// Component DOM/client doubles exercise the real panel handlers and rendering.
// isTrusted here selects a handler branch; it is NOT a native Chrome gesture.
class Element {
  constructor(tag='div',type='') {
    this.tagName=tag.toUpperCase();this.type=type;this._value='';this.textContent='';this.dataset={};
    this.disabled=false;this.hidden=false;this.checked=false;this.children=[];this.attributes={};this.files=[];this.listeners=new Map();
  }
  get value(){return this._value;}
  set value(value){this._value=String(value);if(this.type==='file' && value==='')this.files=[];}
  addEventListener(event,listener){const rows=this.listeners.get(event)||new Set();rows.add(listener);this.listeners.set(event,rows);}
  removeEventListener(event,listener){this.listeners.get(event)?.delete(listener);}
  fire(event,detail={}){for(const listener of [...this.listeners.get(event)||[]])listener({type:event,target:this,...detail});}
  setAttribute(key,value){this.attributes[key]=String(value);}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];this.textContent='';if(this.tagName==='SELECT')this.value=children[0]?.value||'';}
}
globalThis.Option=class extends Element {constructor(text,value){super('option');this.textContent=text;this.value=value;}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{await tick();await tick();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const html=await readFile('src/ui/tool.html','utf8');
const firstUrl='https://first.example.org/library.js',secondUrl='https://second.example.net/helper.js';
const source=(urls=[firstUrl],body='async function main(){return document.title;}') =>
  ['// ==UserScript==','// @name 依赖界面测试',...urls.map(url=>'// @require '+url),'// ==/UserScript==',body].join('\n');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const keyFor=input=>JSON.stringify({entryFormat:input.entryFormat,requires:parseUserScriptDependencies(input.sourceUtf8).requires.map(row=>row.raw)});

async function fixture({sourceUtf8=source(),entryFormat='async-main',cached=false,locked=false}={}) {
  const nodes=new Map([...html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)]
    .map(([,tag,attrs,id])=>[id,new Element(tag,/\btype="([^"]+)"/.exec(attrs)?.[1]||'')]));
  const get=id=>{assert.ok(nodes.has(id),'missing real tool.html element '+id);return nodes.get(id);};
  const doc={getElementById:get,createElement:tag=>new Element(tag)};
  get('script-source').value=sourceUtf8;get('page-preview-entry').value=entryFormat;
  const requests=[],permissions=[],trace=[],gates=new Map(),reviews=new Map(),locks=new Map(),cache=new Map();
  let permission=Promise.resolve(true),reviewSerial=0,lockSerial=0,stateNotifications=0;
  const entriesFor=input=>parseUserScriptDependencies(input.sourceUtf8).requires.map(row=>({
    ...row,name:'普通库 '+(row.order+1),version:null,sourceKind:'https',
    sha256:hash('fixture library '+row.url),byteLength:42,resolvedUrl:row.url,acquisition:'https-download',
    license:{status:'unknown',name:null},risk:'可以读取或修改授权网页 DOM。'}));
  const initial={sourceUtf8,entryFormat};
  if(cached || locked)for(const row of entriesFor(initial))cache.set(row.url,[row]);
  if(locked)locks.set(keyFor(initial),[{lockId:'existing-lock',approvedAt:1720000000000,entries:entriesFor(initial)}]);
  const client={ready:Promise.resolve(),async request(method,payload) {
    const input=structuredClone(payload);requests.push({method,payload:input});trace.push(method);
    const pending=gates.get(method)?.shift();if(pending)await pending.promise;
    if(method==='inspectPageDependencies') {
      const parsed=parseUserScriptDependencies(input.sourceUtf8),available=locks.get(keyFor(input))||[];
      return {requires:entriesFor(input).map(row=>({...row,cacheChoices:structuredClone(cache.get(row.url)||[])})),
        locks:structuredClone(available),admission:assessUserScriptExecution(parsed,{entryFormat:input.entryFormat,dependenciesLocked:available.length>0})};
    }
    if(method==='preparePageDependencies') {
      assert.equal(input.explicitUserAction,true);
      const entries=entriesFor(input).map(row=>{
        const selection=input.selections.find(item=>item.order===row.order);
        if(selection?.localFile){const bytes=Buffer.from(selection.localFile.bytesBase64,'base64');
          return {...row,sha256:hash(bytes),byteLength:bytes.length,sourceKind:'local-file',acquisition:'local-file',resolvedUrl:'local:'+selection.localFile.name};}
        return selection?.assetSha256?{...row,sha256:selection.assetSha256,acquisition:'approved-cache'}:row;
      });
      const result={reviewId:'review-'+(++reviewSerial),entries};reviews.set(result.reviewId,{input,result});return structuredClone(result);
    }
    if(method==='approvePageDependencies') {
      assert.equal(input.explicitUserAction,true);
      const saved=reviews.get(input.reviewId);assert.ok(saved);
      assert.deepEqual(input.acceptedHashes,saved.result.entries.map(row=>row.sha256));
      const lock={lockId:'new-lock-'+(++lockSerial),approvedAt:1720000000000,entries:saved.result.entries};
      locks.set(keyFor(saved.input),[lock]);for(const row of lock.entries)cache.set(row.url,[row]);return structuredClone(lock);
    }
    assert.fail('Unexpected product operation: '+method+'; this panel must not save, install or run');
  }};
  const api={permissions:{request:payload=>{permissions.push(structuredClone(payload));trace.push('permission');return permission;}}};
  const panel=createPageDependencyPanel({client,api,document:doc,getSource:()=>get('script-source').value,
    setSource:value=>{get('script-source').value=value;},onState:()=>{stateNotifications++;}});
  await settle();
  return {panel,get,requests,permissions,trace,cache,locks,reviews,
    click(id,trusted=true){get(id).fire('click',{isTrusted:trusted});},
    async edit(value){get('script-source').value=value;get('script-source').fire('input',{isTrusted:true});await settle();},
    gate(method){const value=deferred(),rows=gates.get(method)||[];rows.push(value);gates.set(method,rows);return value;},
    setPermission(value){permission=value;},stateNotifications:()=>stateNotifications,
    async prepare(){this.click('page-dependency-prepare');await settle();},
    async approve(){this.click('page-dependency-approve');await settle();},
    sourceSelect(order=0){return get('page-dependency-sources').children[order].children[0].children[0];}};
}

test('pasting @require only inspects; trusted acquisition requests permission synchronously and full-hash approval unlocks unsaved edits',async t=>{
  const f=await fixture();t.after(()=>f.panel.dispose());
  assert.deepEqual(f.requests.map(row=>row.method),['inspectPageDependencies']);
  assert.equal(f.permissions.length,0);assert.equal(f.get('page-dependency-status').dataset.state,'needs-review');
  assert.match(f.get('page-dependency-warnings').textContent,/USER_SCRIPT/);
  assert.throws(()=>f.panel.capture(),error=>error.code==='E_DEPENDENCY_UNLOCKED');
  f.click('page-dependency-prepare',false);await settle();assert.equal(f.permissions.length,0);
  const permission=deferred();f.setPermission(permission.promise);f.trace.length=0;
  f.click('page-dependency-prepare');
  assert.deepEqual(f.trace,['permission'],'Chrome permission request occurs before returning from the click handler');
  assert.deepEqual(f.permissions,[{origins:['https://first.example.org/*']}]);
  assert.equal(f.requests.filter(row=>row.method==='preparePageDependencies').length,0);
  permission.resolve(true);await settle();
  const prepared=f.requests.find(row=>row.method==='preparePageDependencies');
  assert.equal(prepared.payload.sourceUtf8,source());assert.equal(prepared.payload.entryFormat,'async-main');
  assert.equal(f.get('page-dependency-status').dataset.state,'pending-review');
  const expected=f.reviews.values().next().value.result.entries[0].sha256;
  assert.ok(f.get('page-dependency-review').textContent.includes(expected),'review displays all 64 SHA-256 digits');
  assert.equal(f.requests.filter(row=>row.method==='approvePageDependencies').length,0);
  f.click('page-dependency-approve',false);await settle();
  assert.equal(f.requests.filter(row=>row.method==='approvePageDependencies').length,0);
  await f.approve();assert.deepEqual(f.requests.find(row=>row.method==='approvePageDependencies').payload.acceptedHashes,[expected]);
  const lockId=f.panel.capture().lockId,inspections=f.requests.filter(row=>row.method==='inspectPageDependencies').length;
  const edited=source([firstUrl],'async function main(){return "unsaved body B";}');
  await f.edit(edited);
  assert.deepEqual(f.panel.capture(),{sourceUtf8:edited,entryFormat:'async-main',lockId});
  assert.equal(f.requests.filter(row=>row.method==='inspectPageDependencies').length,inspections);
  assert.equal(f.permissions.length,1,'body edits do not ask for another CDN grant');
});

test('changing declarations clears an old lock and a late old review cannot replace the current source or become approvable',async t=>{
  const f=await fixture({locked:true});t.after(()=>f.panel.dispose());
  assert.equal(f.panel.capture().lockId,'existing-lock');
  const old=f.gate('preparePageDependencies');await f.prepare();
  assert.equal(f.panel.busy,true);
  await f.edit(source([secondUrl]));
  assert.equal(f.get('page-dependency-lock').value,'');
  assert.throws(()=>f.panel.capture(),error=>error.code==='E_DEPENDENCY_UNLOCKED');
  old.resolve();await settle();
  assert.equal(f.get('page-dependency-status').dataset.state,'needs-review');
  assert.equal(f.get('page-dependency-review').hidden,true);
  assert.equal(f.get('page-dependency-approve').disabled,true);
  assert.equal(f.get('page-dependency-sources').children[0].children[1].textContent,secondUrl);
  await f.approve();assert.equal(f.requests.filter(row=>row.method==='approvePageDependencies').length,0);
  const stale=f.gate('inspectPageDependencies');
  const editing=f.edit(source([firstUrl]));await settle();await f.edit(source([secondUrl]));
  stale.resolve();await editing;await settle();
  assert.equal(f.get('page-dependency-sources').children[0].children[1].textContent,secondUrl);
  assert.equal(f.get('page-dependency-lock').value,'');
});

test('approved cached bytes can be locked for explicitly selected classic mode without a CDN permission prompt',async t=>{
  const f=await fixture({cached:true,entryFormat:'classic-userscript',sourceUtf8:source([firstUrl],'var value=1; document.title=String(value);')});
  t.after(()=>f.panel.dispose());
  assert.equal(f.requests[0].payload.entryFormat,'classic-userscript');
  assert.equal(f.get('page-preview-jquery').disabled,true);
  const cachedHash=f.sourceSelect().value;assert.match(cachedHash,/^[a-f0-9]{64}$/);
  await f.prepare();assert.equal(f.permissions.length,0);
  const preparation=f.requests.find(row=>row.method==='preparePageDependencies');
  assert.deepEqual(preparation.payload.selections,[{order:0,assetSha256:cachedHash}]);
  await f.approve();assert.equal(f.panel.capture().entryFormat,'classic-userscript');assert.ok(f.panel.capture().lockId);
  f.get('page-preview-entry').value='async-main';f.get('page-preview-entry').fire('change',{isTrusted:true});await settle();
  assert.equal(f.get('page-dependency-lock').value,'','entry mode is part of dependency identity');
  assert.throws(()=>f.panel.capture(),error=>error.code==='E_DEPENDENCY_UNLOCKED');
});

test('permission refusal stops acquisition and local files preserve their original bytes without a CDN request',async t=>{
  const denied=await fixture();t.after(()=>denied.panel.dispose());denied.setPermission(Promise.resolve(false));
  await denied.prepare();assert.equal(denied.requests.filter(row=>row.method==='preparePageDependencies').length,0);
  assert.match(denied.get('page-dependency-status').textContent,/E_DEPENDENCY_PERMISSION/);
  const f=await fixture();t.after(()=>f.panel.dispose());
  const raw=new TextEncoder().encode('\ufeffvar LocalDependency = 1;');
  f.get('page-dependency-local-order').value='0';
  f.get('page-dependency-local-file').files=[{name:'local.js',size:raw.byteLength,arrayBuffer:async()=>raw.buffer}];
  await f.prepare();assert.equal(f.permissions.length,0);
  const selected=f.requests.find(row=>row.method==='preparePageDependencies').payload.selections[0];
  assert.equal(selected.order,0);assert.equal(selected.localFile.name,'local.js');
  assert.deepEqual(Buffer.from(selected.localFile.bytesBase64,'base64'),Buffer.from(raw));
  assert.match(f.get('page-dependency-review').textContent,/local:local\.js/);
});

test('add dependency edits only the true metadata block, leaves examples intact and refuses to hide an incomplete header',async t=>{
  const prefix='/* Documentation example:\n// ==/UserScript==\n*/\n';
  const original=prefix+source([firstUrl],'const text = "// ==/UserScript==";\nasync function main(){return text;}');
  const f=await fixture({sourceUtf8:original});t.after(()=>f.panel.dispose());
  f.get('page-dependency-url').value=secondUrl;f.click('page-dependency-add');await settle();
  const changed=f.get('script-source').value,parsed=parseUserScriptDependencies(changed);
  assert.deepEqual(parsed.requires.map(row=>row.url),[firstUrl,secondUrl]);
  assert.ok(changed.startsWith(prefix));
  assert.equal(changed.slice(parsed.headerRange.end),original.slice(parseUserScriptDependencies(original).headerRange.end));
  const noHeader='const docs = `// ==UserScript==\n// ==/UserScript==`;\nasync function main(){return docs;}';
  await f.edit(noHeader);f.get('page-dependency-url').value=secondUrl;f.click('page-dependency-add');await settle();
  assert.ok(f.get('script-source').value.endsWith(noHeader));
  assert.deepEqual(parseUserScriptDependencies(f.get('script-source').value).requires.map(row=>row.url),[secondUrl]);
  const incomplete='// ==UserScript==\n// @grant GM_getValue\n// @require '+firstUrl;
  await f.edit(incomplete);f.get('page-dependency-url').value=secondUrl;f.click('page-dependency-add');await settle();
  assert.equal(f.get('script-source').value,incomplete,'a new header must not hide unsupported declarations in a broken original');
  assert.match(f.get('page-dependency-status').textContent,/E_METADATA_HEADER/);
});

test('closing or changing source while permission/file reading is pending cancels acquisition and old approval handlers',async t=>{
  for(const pendingKind of ['file','permission']) {
    for(const action of ['dispose','edit']) {
      const f=await fixture();t.after(()=>f.panel.dispose());const pending=deferred();
      if(pendingKind==='file') {
        f.get('page-dependency-local-order').value='0';
        f.get('page-dependency-local-file').files=[{name:'late.js',size:1,arrayBuffer:()=>pending.promise}];
      } else f.setPermission(pending.promise);
      await f.prepare();assert.equal(f.panel.busy,true);
      if(action==='dispose')f.panel.dispose();else await f.edit(source([secondUrl]));
      pending.resolve(pendingKind==='file'?new Uint8Array([49]).buffer:true);await settle();
      assert.equal(f.requests.filter(row=>row.method==='preparePageDependencies').length,0,pendingKind+'/'+action);
      await f.approve();assert.equal(f.requests.filter(row=>row.method==='approvePageDependencies').length,0);
    }
  }
  const ready=await fixture();t.after(()=>ready.panel.dispose());await ready.prepare();
  const oldHandler=[...ready.get('page-dependency-approve').listeners.get('click')][0];
  ready.panel.dispose();oldHandler({isTrusted:true});await settle();
  assert.equal(ready.requests.filter(row=>row.method==='approvePageDependencies').length,0);
});

test('review freezes dependency source selectors and lock status does not claim cache verification',async t=>{
  const f=await fixture({cached:true,locked:true});
  t.after(()=>f.panel.dispose());
  const select=f.sourceSelect();
  assert.equal(select.disabled,false);
  assert.match(f.get('page-dependency-status').textContent,/运行时仍会校验本地字节/);
  const pending=f.gate('preparePageDependencies');
  f.click('page-dependency-prepare');await settle();
  assert.equal(f.panel.busy,true);
  for(const node of [select,f.get('page-dependency-local-file'),f.get('page-dependency-local-order'),
    f.get('page-dependency-url')])assert.equal(node.disabled,true);
  pending.resolve();await settle();
  assert.equal(f.panel.busy,false);
  assert.equal(select.disabled,false);
  assert.equal(f.get('page-dependency-local-file').disabled,false);
});

test('a late dependency inspection cannot replace the admission of current metadata with the old source policy',async t=>{
  for(const directive of ['@grant GM_getValue','@resource token https://first.example.org/token.txt','@include *://*/*']) {
    const f=await fixture({locked:true});t.after(()=>f.panel.dispose());
    const pending=f.gate('inspectPageDependencies');
    f.click('page-dependency-refresh');await settle();
    await f.edit(source().replace('// ==/UserScript==','// '+directive+'\n// ==/UserScript=='));
    assert.match(f.get('page-dependency-warnings').textContent,/E_/);
    pending.resolve();await settle();
    assert.match(f.get('page-dependency-warnings').textContent,/E_/,directive+' remains blocked after old report');
    assert.equal(f.get('page-dependency-prepare').disabled,true);
    assert.equal(f.get('page-dependency-approve').disabled,true);
    assert.equal(f.get('page-dependency-status').dataset.state,'error');
    assert.throws(()=>f.panel.capture(),error=>error.code.startsWith('E_'));
  }
});

test('repairing metadata during inspection uses current admission and retains a dependency-only lock',async t=>{
  const blocked=source().replace('// ==/UserScript==','// @grant GM_getValue\n// ==/UserScript==');
  const f=await fixture({sourceUtf8:blocked,locked:true});t.after(()=>f.panel.dispose());
  const pending=f.gate('inspectPageDependencies');f.click('page-dependency-refresh');await settle();
  await f.edit(source());pending.resolve();await settle();
  assert.doesNotMatch(f.get('page-dependency-warnings').textContent,/E_GRANT_UNSUPPORTED/);
  assert.equal(f.get('page-dependency-prepare').disabled,false);
  assert.equal(f.panel.capture().lockId,'existing-lock');
  assert.equal(f.permissions.length,0,'policy edits do not request a new download grant');
});

test('a newly unsupported policy cancels acquisition after the permission await even when dependencies are unchanged',async t=>{
  for(const dispatchInput of [true,false]) {
    const f=await fixture();t.after(()=>f.panel.dispose());
    const permission=deferred();f.setPermission(permission.promise);await f.prepare();
    const changed=source().replace('// ==/UserScript==','// @grant GM_getValue\n// ==/UserScript==');
    if(dispatchInput)await f.edit(changed);else f.get('script-source').value=changed;
    permission.resolve(true);await settle();
    assert.equal(f.requests.filter(row=>row.method==='preparePageDependencies').length,0);
    assert.equal(f.get('page-dependency-approve').disabled,true);
    assert.equal(f.get('page-dependency-prepare').disabled,true);
    assert.match(f.get('page-dependency-warnings').textContent,/E_GRANT_UNSUPPORTED/);
    assert.match(f.get('page-dependency-status').textContent,/E_GRANT_UNSUPPORTED/);
  }
});

test('approval revalidates current source even when an importer did not dispatch an input event',async t=>{
  for(const edit of [
    source().replace('// ==/UserScript==','// @grant GM_getValue\n// ==/UserScript=='),
    source([secondUrl])
  ]) {
    const f=await fixture();t.after(()=>f.panel.dispose());await f.prepare();
    f.get('script-source').value=edit;
    await f.approve();
    assert.equal(f.requests.filter(row=>row.method==='approvePageDependencies').length,0);
    assert.match(f.get('page-dependency-status').textContent,/E_GRANT_UNSUPPORTED|E_DEPENDENCY_LOCK_STALE/);
  }
});

test('declared antifeatures remain visible as untrusted plain text through inspection and source edits',async t=>{
  const disclosure='tracking <img src=x onerror=alert(1)>';
  const declared=source().replace('// ==/UserScript==','// @antifeature '+disclosure+'\n// ==/UserScript==');
  const f=await fixture({sourceUtf8:declared});t.after(()=>f.panel.dispose());
  assert.ok(f.get('page-dependency-warnings').textContent.includes(disclosure));
  assert.match(f.get('page-dependency-warnings').textContent,/W_ANTIFEATURE_DECLARED/);
  assert.equal(f.get('page-dependency-warnings').children.length,0,'source text cannot create markup');
  await f.edit(source());
  assert.doesNotMatch(f.get('page-dependency-warnings').textContent,/W_ANTIFEATURE_DECLARED/);
});
