import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const js=await fs.readFile(new URL('../src/main.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const store={value:null,revision:1,origin:'https://example.com',fail:false,requests:[],conflict:false,saveGate:null};
  const request=async(op,args)=>{
    store.requests.push({op,args});
    if(op==='storage.get')return {value:store.value?{...store.value}:null,etag:'v'+store.revision};
    if(op==='storage.set'){
      if(store.saveGate)await store.saveGate;
      if(store.fail)throw Error('E_STORAGE_FAIL');
      if(store.conflict){store.conflict=false;store.revision++;
        throw Object.assign(Error('conflict'),{code:'E_STORAGE_CONFLICT'});}
      if(args.ifMatch!=='v'+store.revision)throw Error('CAS mismatch');
      store.value=args.value;store.revision++;
      return {saved:true};
    }
    if(op==='currentPage.info')return {status:'available',url:store.origin+'/post'};
    if(op==='page.request')return store.page?.()??{enabled:store.value?.enabled!==false&&!store.value?.disabledOrigins?.includes(store.origin)};
    throw Error('E_UNKNOWN_OP');
  };
  const handlers=new Map(),windowHandlers=new Map();
  const input=()=>({checked:false,disabled:false,attributes:{},
    setAttribute(k,v){this.attributes[k]=v;},addEventListener(t,fn){handlers.set(this===globalSwitch?'global':'site',fn);}});
  const globalSwitch=input(),siteSwitch=input();
  const element=()=>({textContent:'',hidden:true});
  const originView=element(),status=element(),errorView=element();
  const els={'#fc-enabled':globalSwitch,'#fc-site-enabled':siteSwitch,
    '#fc-origin':originView,'#fc-status':status,'#fc-error':errorView};
  const root={querySelector(id){return els[id];},
    addEventListener(type,fn){handlers.set(type,fn);}};
  const tool={root,request,setState(){}};
  vm.runInNewContext(js,{globalThis:{OpenDeskTool:tool},window:{
    addEventListener(type,fn){windowHandlers.set(type,fn);}},URL});
  async function settle(){for(let i=0;i<6;i++)await tick();}
  return {store,globalSwitch,siteSwitch,status,errorView,originView,handlers,
    async changeGlobal(v){globalSwitch.checked=v;handlers.get('global')();await settle();},
    async changeSite(v){siteSwitch.checked=v;handlers.get('site')();await settle();},
    async reload(){handlers.get('opendesk-page-changed')();await settle();},
    close(){windowHandlers.get('pagehide')?.();},settle};
}
test('side panel starts ready and global switch persists pause and resume',async()=>{
  const f=fixture();await f.settle();
  assert.equal(f.globalSwitch.checked,true);
  assert.equal(f.siteSwitch.checked,true);
  await f.changeGlobal(false);
  assert.equal(f.store.value.enabled,false);
  assert.equal(f.globalSwitch.checked,false);
  await f.changeGlobal(true);
  assert.equal(f.store.value.enabled,true);
  assert.equal(f.globalSwitch.checked,true);
  assert.equal(f.errorView.hidden,true);
  f.close();
});
test('current-site exception is isolated to origin and follows tab changes',async()=>{
  const f=fixture();await f.settle();
  await f.changeSite(false);
  assert.deepEqual(Array.from(f.store.value.disabledOrigins),['https://example.com']);
  assert.equal(f.siteSwitch.checked,false);
  f.store.origin='https://other.example';
  await f.reload();
  assert.equal(f.siteSwitch.checked,true);
  assert.equal(f.originView.textContent,'https://other.example');
  f.store.origin='https://example.com';
  await f.reload();assert.equal(f.siteSwitch.checked,false);
  await f.changeSite(true);
  assert.deepEqual(Array.from(f.store.value.disabledOrigins),[]);
  f.close();
});
test('CAS conflict retries and never overwrites unrelated settings',async()=>{
  const f=fixture();await f.settle();
  f.store.value={enabled:true,disabledOrigins:[],otherSetting:'keep'};
  f.store.conflict=true;
  await f.changeGlobal(false);
  assert.equal(f.store.value.otherSetting,'keep');
  assert.equal(f.store.value.enabled,false);
  assert.equal(f.store.requests.filter(x=>x.op==='storage.set').length,2);
  f.close();
});
test('failed save does not claim success and reflects readback',async()=>{
  const f=fixture();await f.settle();
  f.store.fail=true;
  await f.changeGlobal(false);
  assert.equal(f.globalSwitch.checked,true);
  assert.equal(f.store.value,null);
  assert.equal(f.errorView.hidden,false);
  assert.match(f.errorView.textContent,/未确认/);
  f.close();
});
test('site unavailable disables only site switch',async()=>{
  const f=fixture();await f.settle();
  f.store.origin='chrome://settings';
  await f.reload();
  assert.equal(f.siteSwitch.disabled,true);
  assert.equal(f.globalSwitch.disabled,false);
  f.close();
});
test('pending save reports progress and locks both switches until the preference is saved',async()=>{
  const f=fixture();await f.settle();
  let release;f.store.saveGate=new Promise(resolve=>{release=resolve;});
  const change=f.changeGlobal(false);await f.settle();
  assert.match(f.status.textContent,/正在保存/);
  assert.equal(f.globalSwitch.disabled,true);
  assert.equal(f.siteSwitch.disabled,true);
  release();await change;await f.settle();
  assert.equal(f.globalSwitch.checked,false);
  assert.equal(f.status.hidden,true);
  assert.equal(f.globalSwitch.disabled,false);
  f.close();
});

test('confirmed preference and live document status are separate; unknown page request is not replayed',async()=>{
  const f=fixture();await f.settle();
  const unavailable=code=>()=>{throw Object.assign(Error(code),{code});};
  f.store.page=unavailable('E_APP_PAGE_ACTIVATION_REQUIRED');
  await f.changeSite(false);await f.changeSite(true);
  assert.equal(f.store.value.disabledOrigins.length,0);
  assert.equal(f.siteSwitch.checked,true);
  assert.equal(f.status.hidden,false);
  assert.match(f.status.textContent,/扩展 → 更多 → 网页功能帮助.*允许用户脚本.*返回检查自由复制/);
  f.store.page=unavailable('E_PERMISSION');await f.reload();
  assert.match(f.status.textContent,/网站访问受限/);
  f.store.page=unavailable('E_APP_PAGE_RELOAD_REQUIRED');await f.reload();
  assert.match(f.status.textContent,/旧文档.*保存.*刷新/);
  f.store.page=undefined;await f.reload();
  assert.equal(f.status.hidden,true);
  f.store.page=unavailable('E_EFFECT_UNKNOWN');await f.reload();
  const count=f.store.requests.filter(x=>x.op==='page.request').length;
  await f.reload();
  assert.equal(f.store.requests.filter(x=>x.op==='page.request').length,count);
  assert.match(f.status.textContent,/结果未知/);
  f.close();
});
