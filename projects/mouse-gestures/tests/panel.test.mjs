import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const panelSource=await fs.readFile(new URL('../src/main.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function storeFixture(){
  let value=null,revision=1,fail=false,conflictOnce=false,concurrent=null,lostReceipt=false;
  const reads=[];
  const actions=[];
  const request=async (op,payload)=>{
    actions.push({op,payload});
    if(op==='storage.get'){
      const snapshot={value:value===null?null:structuredClone(value),etag:'v'+revision};
      return reads.length?reads.shift()(snapshot):snapshot;
    }
    if(op==='storage.set'){
      if(fail)throw Error('E_STORAGE');
      if(conflictOnce){conflictOnce=false;if(concurrent)value=structuredClone(concurrent);revision++;
        const e=Error('stale');e.code='E_STORAGE_CONFLICT';throw e;}
      if(payload.ifMatch!==('v'+revision))throw Error('CAS mismatch');
      value=payload.value;revision++;
      if(lostReceipt)throw Error('E_RECEIPT_LOST');
      return {saved:true};
    }
    if(op==='page.request')throw Error('E_PAGE_AUTHORIZATION');
    throw Error('UNEXPECTED_OP');
  };
  return {request,actions,read:()=>value,fail(){fail=true;},conflict(next=null){conflictOnce=true;concurrent=next;},
    loseReceipt(){lostReceipt=true;},
    readNext(fn){reads.push(fn);},
    deferRead(){
      let resolve,reject;
      const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
      reads.push(snapshot=>promise.then(()=>snapshot));
      return {resolve,reject};
    }};
}
function panel(store,ui){
  const listeners=new Map(),windowHandlers=new Map(),states=[];
  const toggle={checked:true,disabled:true,attributes:new Map(),
    addEventListener(type,fn){listeners.set('enabled:'+type,fn);},
    setAttribute(k,v){this.attributes.set(k,v);}};
  const trigger={value:'right',disabled:true,addEventListener(type,fn){listeners.set('trigger:'+type,fn);}};
  const trace={checked:true,disabled:true,addEventListener(type,fn){listeners.set('trace:'+type,fn);}};
  const menuHelp={textContent:''};
  const combo={value:'left-down',disabled:true,addEventListener(type,fn){listeners.set('combo:'+type,fn);}};
  const comboAction={value:'none',disabled:true,addEventListener(type,fn){listeners.set('comboAction:'+type,fn);}};
  const hint={textContent:''},error={textContent:'',hidden:true};
  const elements=new Map([['#gesture-enabled',toggle],['#gesture-trigger',trigger],
    ['#gesture-trace',trace],['#gesture-menu-help',menuHelp],
    ['#gesture-combo',combo],['#gesture-combo-action',comboAction],['#gesture-help',hint],['#gesture-error',error]]);
  const root={querySelector(id){return elements.get(id)||null;},
    addEventListener(type,fn){listeners.set('root:'+type,fn);}};
  const window={addEventListener(type,fn){windowHandlers.set(type,fn);}};
  const tool={root,ui,request:store.request,setState(state){states.push(state);}};
  vm.runInNewContext(panelSource,{globalThis:{OpenDeskTool:tool},window});
  const flush=async()=>{await tick();await tick();};
  return {toggle,trigger,trace,menuHelp,combo,comboAction,hint,error,states,windowHandlers,
    async change(value){toggle.checked=value;listeners.get('enabled:change')();await flush();},
    async changeTrigger(value){trigger.value=value;listeners.get('trigger:change')();await flush();},
    async changeTrace(value){trace.checked=value;listeners.get('trace:change')();await flush();},
    async changeCombo(value){combo.value=value;listeners.get('combo:change')();await flush();},
    async changeComboAction(value){comboAction.value=value;listeners.get('comboAction:change')();await flush();},
    async reload(){listeners.get('root:opendesk-page-changed')();await flush();},
    close(){windowHandlers.get('pagehide')?.();}};
}

test('Side Panel persists switch and restores it after reopening',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();assert.equal(one.toggle.checked,true);assert.equal(one.toggle.disabled,false);
  assert.equal(store.read(),null); // First install must not require a second enable/save.
  await one.change(false);
  assert.equal(store.read().enabled,false);assert.equal(one.toggle.checked,false);
  assert.equal(one.toggle.disabled,false);
  assert.equal(one.states.at(-1).busy,false);
  one.close();
  const two=panel(store);await tick();assert.equal(two.toggle.checked,false);
  await two.change(true);assert.equal(store.read().enabled,true);
  assert.equal(two.toggle.checked,true);
  two.close();
});
test('Side Panel retries only documented ETag conflict and does not overwrite config',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();store.conflict();await one.change(false);
  assert.equal(store.read().enabled,false);
  assert.equal(store.actions.filter(x=>x.op==='storage.set').length,2);
  one.close();
});
test('failed save never changes confirmed state or claims enabled',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();store.fail();await one.change(false);
  assert.equal(store.read(),null);
  assert.equal(one.toggle.checked,true);
  assert.match(one.error.textContent,/未确认/);
  assert.equal(one.toggle.disabled,false); // confirmed old state remains retryable
  one.close();
});
test('synchronization to restricted website is optional, not a false failure',async()=>{
  const store=storeFixture(),one=panel(store);
  await tick();await one.change(false);
  assert.equal(one.error.hidden,true);
  assert.equal(store.actions.some(x=>x.op==='page.request'),true);
  one.close();
});

test('preview and installed Side Panel both retain four visible gesture entries',async()=>{
  const expected=['←后退','→前进','↑刷新','↓到底'];
  for(const relative of ['../preview/index.html','../src/index.html']){
    const html=await fs.readFile(new URL(relative,import.meta.url),'utf8');
    const list=html.match(/<ul\b[^>]*class="(?:od-collection|mg-list)"[^>]*>([\s\S]*?)<\/ul>/);
    assert.ok(list,relative+' should expose the gesture list');
    const rows=[...list[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
      .map(match=>match[1].replace(/<[^>]*>/g,'').replace(/\s+/g,'').trim());
    assert.deepEqual(rows,expected,relative+' must keep all four direction labels');
  }
});


test('trigger fallback and trace preference persist without resetting enabled state',async()=>{
  const store=storeFixture(),one=panel(store);await tick();
  await one.changeTrigger('alt-left');
  await one.changeTrace(false);
  assert.equal(store.read().enabled,undefined);
  assert.equal(store.read().trigger,'alt-left');
  assert.equal(store.read().showTrace,false);
  one.close();
  const again=panel(store);await tick();
  assert.equal(again.toggle.checked,true);
  assert.equal(again.trigger.value,'alt-left');
  assert.equal(again.trace.checked,false);
  assert.match(again.hint.textContent,/Option/);
  await again.change(false);
  assert.equal(store.read().enabled,false);
  assert.equal(store.read().trigger,'alt-left');
  assert.equal(store.read().showTrace,false);
  again.close();
});

test('production panel and standalone preview both mark first-install default ON',async()=>{
  const production=await fs.readFile(new URL('../src/index.html',import.meta.url),'utf8');
  const preview=await fs.readFile(new URL('../preview/index.html',import.meta.url),'utf8');
  for(const html of [production,preview]){
    assert.match(html,/<input[^>]*id="gesture-enabled"[^>]*class="mg-switch"[\s\S]*?checked/);
  }
});

test('Side Panel only saves explicitly assigned two-segment mappings via CAS',async()=>{
  const store=storeFixture(),one=panel(store);await tick();
  assert.equal(one.comboAction.value,'none');
  await one.changeComboAction('up');
  assert.deepEqual(JSON.parse(JSON.stringify(store.read().gestureMappings)),{'left-down':'up'});
  await one.changeCombo('up-right');
  assert.equal(one.comboAction.value,'none');
  await one.changeComboAction('right');
  assert.deepEqual(JSON.parse(JSON.stringify(store.read().gestureMappings)),{'left-down':'up','up-right':'right'});
  await one.changeCombo('left-down');
  assert.equal(one.comboAction.value,'up');
  await one.changeComboAction('none');
  assert.deepEqual(JSON.parse(JSON.stringify(store.read().gestureMappings)),{'up-right':'right'});
  assert.equal(one.toggle.checked,true);
  one.close();
});

test('legacy menu policy is normalized on the next explicit save without losing settings',async()=>{
  const store=storeFixture();
  const value={enabled:true,menuPolicy:'gesture-first',trigger:'alt-left',showTrace:false,
    gestureMappings:{'left-down':'up'},other:'preserved'};
  await store.request('storage.set',{key:'preferences',value,ifMatch:'v1'});
  const one=panel(store);await tick();
  assert.equal(store.read().menuPolicy,'gesture-first','opening settings performs no write');
  assert.match(one.menuHelp.textContent,/保留原菜单/);
  assert.equal(one.trigger.value,'alt-left');
  await one.change(false);
  assert.equal(store.read().menuPolicy,'native-first');
  assert.equal(store.read().enabled,false);
  assert.equal(store.read().other,'preserved');
  assert.deepEqual(store.read().gestureMappings,{'left-down':'up'});
  one.close();
  const second=panel(store);await tick();
  assert.equal(second.toggle.checked,false);
  assert.equal(second.trigger.value,'alt-left');
  second.close();
});

test('new installations preserve menus without writing preferences on open',async()=>{
  const store=storeFixture(),one=panel(store);await tick();
  assert.equal(store.read(),null,'native-first default requires no background write');
  assert.match(one.menuHelp.textContent,/保留原菜单/);
  one.close();
});


test('persist remains busy through final readback and focus cannot clear later revocation',async()=>{
  const store=storeFixture(),one=panel(store);await tick();
  store.readNext(snapshot=>snapshot);
  const pending=store.deferRead();
  await one.change(false);
  assert.equal(one.states.at(-1).busy,true);
  const count=store.actions.length;
  one.windowHandlers.get('focus')();await tick();
  assert.equal(store.actions.length,count,'focus must not race final readback');
  pending.resolve();await tick();await tick();
  assert.equal(one.states.at(-1).busy,false);
  store.readNext(()=>{throw Error('E_PERMISSION_REVOKED');});
  await one.reload();
  assert.match(one.error.textContent,/权限/);
  assert.equal(one.toggle.checked,false);
  assert.equal(one.toggle.disabled,true);
  one.close();
});

test('closed panel ignores deferred persist readback and does not publish idle state',async()=>{
  const store=storeFixture(),one=panel(store);await tick();
  store.readNext(snapshot=>snapshot);const pending=store.deferRead();
  await one.change(false);one.close();const states=one.states.length;
  pending.resolve();await tick();await tick();
  assert.equal(one.states.at(-1).busy,true);
  assert.equal(one.states.length,states);
  assert.equal(one.toggle.disabled,true);
});

test('CAS conflict preserves concurrently changed scalar field and reads latest value',async()=>{
  const store=storeFixture(),one=panel(store);await tick();
  store.conflict({trigger:'alt-left',enabled:false});
  await one.change(false);
  assert.equal(store.actions.filter(x=>x.op==='storage.set').length,1);
  assert.equal(store.read().trigger,'alt-left');
  assert.equal(one.toggle.checked,false);
  assert.match(one.error.textContent,/冲突/);
  one.close();
});

test('CAS conflict does not overwrite the same mapping key',async()=>{
  const store=storeFixture(),one=panel(store);await tick();
  store.conflict({gestureMappings:{'left-down':'right'}});
  await one.changeComboAction('up');
  assert.equal(store.read().gestureMappings['left-down'],'right');
  assert.equal(one.comboAction.value,'right');
  assert.equal(store.actions.filter(x=>x.op==='storage.set').length,1);
  assert.match(one.error.textContent,/冲突/);
  assert.equal(one.comboAction.disabled,false);
  one.close();
});

test('CAS conflict merges different mapping keys and unrelated scalar fields',async()=>{
  const store=storeFixture(),one=panel(store);await tick();
  store.conflict({enabled:false,gestureMappings:{'up-right':'left'}});
  await one.changeComboAction('up');
  assert.deepEqual(JSON.parse(JSON.stringify(store.read())),{
    enabled:false,menuPolicy:'native-first',gestureMappings:{'up-right':'left','left-down':'up'}});
  assert.equal(one.toggle.checked,false);
  assert.equal(one.error.hidden,true);
  one.close();
});

test('lost successful receipt reports unknown write and the latest readback truth',async()=>{
  const store=storeFixture(),one=panel(store);await tick();store.loseReceipt();
  await one.change(false);
  assert.equal(store.read().enabled,false);
  assert.equal(one.toggle.checked,false);
  assert.match(one.error.textContent,/写入结果未知/);
  assert.match(one.error.textContent,/已读取最新设置/);
  assert.doesNotMatch(one.error.textContent,/保留原设置/);
  assert.equal(store.actions.filter(x=>x.op==='storage.set').length,1);
  one.close();
});


test('a stale refresh cannot replace a newer permission failure',async()=>{
  const store=storeFixture(),pending=store.deferRead(),one=panel(store);
  await tick();
  store.readNext(()=>{throw Error('E_PERMISSION_REVOKED');});
  await one.reload();
  const message=one.error.textContent;
  pending.resolve();await tick();await tick();
  assert.match(message,/权限/);
  assert.equal(one.error.textContent,message);
  assert.equal(one.toggle.checked,false);
  assert.equal(one.toggle.disabled,true);
  one.close();
});

test('lost receipt with failed readback stays unknown and fail closed',async()=>{
  const store=storeFixture(),one=panel(store);await tick();store.loseReceipt();
  store.readNext(snapshot=>snapshot);
  store.readNext(()=>{throw Error('E_PERMISSION_REVOKED');});
  await one.change(false);
  assert.equal(store.read().enabled,false);
  assert.match(one.error.textContent,/写入结果未知/);
  assert.match(one.error.textContent,/无法读取最新状态/);
  assert.doesNotMatch(one.error.textContent,/保留原设置/);
  assert.equal(one.toggle.checked,false);
  assert.equal(one.toggle.disabled,true);
  assert.equal(one.states.at(-1).busy,false);
  one.close();
});

test('saving an unrelated scalar preserves concurrent mapping changes',async()=>{
  const store=storeFixture(),one=panel(store);await tick();
  store.conflict({gestureMappings:{'left-down':'right'}});
  await one.changeTrace(false);
  assert.equal(store.read().showTrace,false);
  assert.equal(store.read().gestureMappings['left-down'],'right');
  assert.equal(one.error.hidden,true);
  one.close();
});

test('save feedback uses public notify only after final readback, with nearby fallback',async()=>{
  const notifications=[],store=storeFixture();
  const one=panel(store,{notify(options){notifications.push(options);return true;}});
  await tick();store.readNext(snapshot=>snapshot);const pending=store.deferRead();
  await one.change(false);
  assert.equal(notifications.length,0);
  pending.resolve();await tick();await tick();
  assert.equal(notifications.length,1);
  assert.equal(notifications[0].message,'设置已保存');
  assert.match(one.hint.textContent,/设置已保存/);
  store.loseReceipt();await one.change(true);
  assert.equal(notifications.length,1,'unknown writes must not claim success');
  assert.doesNotMatch(one.hint.textContent,/设置已保存/);
  one.close();
  // A host without notify still retains its nearby confirmed-save status.
  const plain=storeFixture(),two=panel(plain);await tick();await two.change(false);
  assert.match(two.hint.textContent,/设置已保存/);
  two.close();
});
