import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const js=await fs.readFile(new URL('../src/main.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const store={value:null,revision:1,origin:'https://example.com',fail:false,requests:[],conflict:false};
  const request=async(op,args)=>{
    store.requests.push({op,args});
    if(op==='storage.get')return {value:store.value?{...store.value}:null,etag:'v'+store.revision};
    if(op==='storage.set'){
      if(store.fail)throw Error('E_STORAGE_FAIL');
      if(store.conflict){store.conflict=false;store.revision++;
        throw Object.assign(Error('conflict'),{code:'E_STORAGE_CONFLICT'});}
      if(args.ifMatch!=='v'+store.revision)throw Error('CAS mismatch');
      store.value=args.value;store.revision++;
      return {saved:true};
    }
    if(op==='currentPage.info')return {status:'available',url:store.origin+'/post'};
    if(op==='page.request')throw Error('E_PAGE_RELOAD_REQUIRED');
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
