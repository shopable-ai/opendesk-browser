import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';

const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function fixture(saved=true,initialHandlers=[]){
  const {document,window}=parseHTML('<html><body>'+html+'</body></html>');
  const root=document.querySelector('main'),calls=[];
  const handlers=new Map(initialHandlers);
  const request=async(op,args)=>{
    calls.push({op,args});
    if(handlers.has(op))return handlers.get(op)(args);
    if(op==='storage.get')return {value:saved};
    if(op==='videoSpeed.shortcuts.enable')return {enabled:true};
    if(op==='videoSpeed.status')return {status:'available',speed:1};
    if(op==='videoSpeed.set')return {status:'available',speed:args.speed};
    if(op==='storage.set'||op==='videoSpeed.shortcuts.disable')return {};
    throw Error('Unexpected request: '+op);
  };
  // Evaluate the unmodified production entry, with only its SDK boundary stubbed.
  runInNewContext(source,{document,window,OpenDeskTool:{root,request}});
  return {
    calls,handlers,root,window,
    on:()=>root.querySelector('#speed-shortcut-toggle').getAttribute('aria-checked'),
    send(kind,extra={},parent=true){
      const event=new window.Event('message');event.source=parent?window.parent:{};
      event.data={protocol:'opendesk.video-speed.shortcut.v1',kind,...extra};window.dispatchEvent(event);
    },
    count:op=>calls.filter(call=>call.op===op).length,
    toggle:root.querySelector('#speed-shortcut-toggle'),
    refresh:()=>root.querySelector('#speed-refresh').click(),
    navigate:()=>root.dispatchEvent(new window.Event('opendesk-page-changed')),
    key(key){
      const event=new window.Event('keydown',{bubbles:true,cancelable:true});
      event.key=key;document.dispatchEvent(event);
    }
  };
}

for(const trigger of ['refresh','navigate']){
  test(`${trigger} completion cannot re-enable shortcuts while OFF storage is pending`,async()=>{
    const f=fixture();await flush();
    assert.equal(f.count('videoSpeed.shortcuts.enable'),1);
    const status=deferred(),disable=deferred(),save=deferred();
    f.handlers.set('videoSpeed.status',()=>status.promise);
    f.handlers.set('videoSpeed.shortcuts.disable',()=>disable.promise);
    f.handlers.set('storage.set',()=>save.promise);
    f[trigger]();
    assert.equal(f.count('videoSpeed.status'),2);
    f.toggle.click();
    assert.equal(f.count('videoSpeed.shortcuts.disable'),1);
    f.key('d');
    assert.equal(f.count('videoSpeed.set'),0);
    disable.resolve({});await flush();
    assert.equal(f.count('storage.set'),1);
    assert.equal(f.calls.find(call=>call.op==='storage.set').args.value,false);
    status.resolve({status:'available',speed:1});await flush();
    f.key('d');await flush();
    assert.equal(f.count('videoSpeed.set'),0,'sidebar shortcut stays stopped during save');
    const enablesWhileSaving=f.count('videoSpeed.shortcuts.enable');
    save.resolve({});await flush();
    assert.equal(enablesWhileSaving,1,'completed refresh must not reactivate after disable');
    assert.equal(f.toggle.getAttribute('aria-checked'),'false');
    assert.equal(f.toggle.disabled,false);
    f.key('d');await flush();
    assert.equal(f.count('videoSpeed.set'),0);
    assert.equal(f.count('videoSpeed.shortcuts.enable'),1);
  });
}

test('refresh while startup preference is pending never enables a saved false preference',async()=>{
  const saved=deferred();
  const f=fixture(false,[['storage.get',()=>saved.promise]]);
  await flush();
  f.refresh();await flush();
  const enablesBeforeLoad=f.count('videoSpeed.shortcuts.enable');
  saved.resolve({value:false});await flush();
  f.refresh();await flush();
  assert.equal(enablesBeforeLoad,0);
  assert.equal(f.count('videoSpeed.shortcuts.enable'),0);
  assert.equal(f.toggle.getAttribute('aria-checked'),'false');
});

test('ON enables page and sidebar shortcuts only after successful storage save',async()=>{
  const f=fixture(false);await flush();
  const save=deferred();f.handlers.set('storage.set',()=>save.promise);
  f.toggle.click();await flush();
  f.refresh();await flush();f.key('d');await flush();
  assert.equal(f.count('videoSpeed.shortcuts.enable'),0);
  assert.equal(f.count('videoSpeed.set'),0);
  save.resolve({});await flush();
  assert.equal(f.toggle.getAttribute('aria-checked'),'true');
  assert.equal(f.toggle.disabled,false);
  assert.equal(f.count('videoSpeed.shortcuts.enable'),1);
  f.key('d');await flush();
  assert.equal(f.count('videoSpeed.set'),1);
});

test('failed OFF save restores the original ON state and shortcuts',async()=>{
  const f=fixture();await flush();
  const save=deferred();f.handlers.set('storage.set',()=>save.promise);
  f.toggle.click();await flush();
  assert.equal(f.count('videoSpeed.shortcuts.disable'),1);
  f.key('d');assert.equal(f.count('videoSpeed.set'),0);
  save.reject(Error('storage unavailable'));await flush();
  assert.equal(f.toggle.getAttribute('aria-checked'),'true');
  assert.equal(f.toggle.disabled,false);
  assert.equal(f.count('videoSpeed.shortcuts.enable'),2);
  f.key('d');await flush();assert.equal(f.count('videoSpeed.set'),1);
});

test('failed ON save retains the original OFF state',async()=>{
  const f=fixture(false);await flush();
  const save=deferred();f.handlers.set('storage.set',()=>save.promise);
  f.toggle.click();await flush();
  save.reject(Error('storage unavailable'));await flush();
  assert.equal(f.toggle.getAttribute('aria-checked'),'false');
  assert.equal(f.toggle.disabled,false);
  assert.equal(f.count('videoSpeed.shortcuts.enable'),0);
  f.key('d');await flush();assert.equal(f.count('videoSpeed.set'),0);
});

test('preference OFF event supersedes stale initial load and suppresses both shortcut paths',async()=>{
  const load=deferred(),f=fixture(true,[['storage.get',()=>load.promise]]);
  f.send('preference',{enabled:false},false);
  assert.equal(f.on(),'true','foreign source cannot change preference');
  f.send('preference',{enabled:false});
  load.resolve({value:true});await flush();
  assert.equal(f.on(),'false');assert.equal(f.count('videoSpeed.shortcuts.enable'),0);
  f.key('d');f.send('verified',{key:'d',result:{status:'available',speed:2}});
  f.send('pending',{requested:3});await flush();
  assert.equal(f.count('videoSpeed.set'),0);
  assert.equal(f.root.querySelector('#speed-current').textContent,'1.00');
  assert.equal(f.root.querySelector('#speed-verification').textContent,'已读回');
});
test('new OFF event wins over pending ON save and late enable completion',async()=>{
  const f=fixture(false);await flush();
  const save=deferred();f.handlers.set('storage.set',()=>save.promise);f.toggle.click();await flush();
  f.send('preference',{enabled:false});save.resolve({});await flush();
  assert.equal(f.on(),'false');assert.equal(f.count('videoSpeed.shortcuts.enable'),0);
  f.send('preference',{enabled:true});await flush();
  assert.equal(f.on(),'true');assert.equal(f.count('videoSpeed.shortcuts.enable'),1);
  const enable=deferred();f.handlers.set('videoSpeed.shortcuts.enable',()=>enable.promise);
  f.root.dispatchEvent(new f.window.Event('opendesk-page-changed'));await flush();
  f.send('preference',{enabled:false});enable.resolve({enabled:true});await flush();
  assert.equal(f.on(),'false');f.key('d');assert.equal(f.count('videoSpeed.set'),0);
});
for(const value of [null,'true',{},undefined])test(`malformed preference event ${JSON.stringify(value)} fails closed`,async()=>{
  const f=fixture();await flush();f.send('preference',{enabled:value});await flush();
  assert.equal(f.on(),'false');f.key('d');assert.equal(f.count('videoSpeed.set'),0);
});

test('own ON storage event during save still activates after the save settles',async()=>{
  const f=fixture(false);await flush();
  const save=deferred();f.handlers.set('storage.set',()=>save.promise);
  f.toggle.click();await flush();f.send('preference',{enabled:true});
  assert.equal(f.count('videoSpeed.shortcuts.enable'),0);
  save.resolve({});await flush();
  assert.equal(f.on(),'true');assert.equal(f.count('videoSpeed.shortcuts.enable'),1);
});
test('OFF during pending page shortcut releases controls for explicit fresh detection',async()=>{
  const f=fixture();await flush();
  f.send('pending',{requested:1.25});f.send('preference',{enabled:false});
  f.send('verified',{key:'d',result:{status:'available',speed:1.25}});
  assert.equal(f.root.querySelector('#speed-refresh').disabled,false);
  assert.equal(f.root.querySelector('#speed-current').textContent,'—','in-flight effect is unknown');
  f.refresh();await flush();
  assert.equal(f.root.querySelector('#speed-current').textContent,'1.00');
  assert.equal(f.on(),'false');assert.equal(f.count('videoSpeed.shortcuts.enable'),1);
});
