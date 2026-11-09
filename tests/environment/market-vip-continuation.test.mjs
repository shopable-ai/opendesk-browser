// Source-bound component tests; a VM receiver is not a Chrome native install.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {randomUUID,webcrypto} from 'node:crypto';
import {vipActivationLanding,vipResumeProof} from '../../src/market-site/vip-continuation.js';

const MARKET='http://127.0.0.1:43132';
const REF='a'.repeat(32);
const HASH='#vip-ref='+REF;
const app={kind:'app',marketId:'opendesk/ai-vip-share',version:'1.4.32'};
const channel={protocol:'opendesk.market.intent.v1',schema:'opendesk.market.channel.v1',
  enabled:true,mode:'development',origin:MARKET,extensionId:'a'.repeat(32)};
const script=(await readFile('src/market-site/client.js','utf8')).replace(
  "import {vipActivationLanding,vipResumeProof} from './vip-continuation.js';",'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const receipt=({action,intentId},extra={})=>({
  ok:true,protocol:'opendesk.market.intent.v1',
  ...(action==='GET_APP_STATUS'?{status:'APP_STATUS',currentInstallation:'not-installed',
    installedVersion:null,enabled:null}:
    action==='OPEN_INSTALL_REVIEW'?{status:'REVIEW_OPENED',intentId}:
    action==='GET_INSTALL_STATUS'?{status:'INSTALL_STATUS',intentId,installation:'review',
      currentInstallation:'not-installed',installedVersion:null,enabled:null,progress:null}:
    {status:'APP_OPENED'}),
  ...extra
});
function browser({hash=HASH,mode='development',storage=new Map()}={}){
  const messages=[],navigations=[],listeners=new Map();
  const node=()=>({dataset:{},hidden:false,disabled:false,textContent:'',
    addEventListener(event,fn){this.listeners??={};this.listeners[event]=fn;}});
  const primary=node(),status=node(),back=node();primary.dataset.subject=JSON.stringify(app);
  primary.textContent='安装到浏览器';
  primary.parentElement={querySelector:selector=>({'[data-handoff-state]':status,'[data-return-review]':back})[selector]};
  const internals={'#open-review':primary,'#handoff-state':status,'#handoff-details':node(),'#handoff-code':node()};
  const page={origin:MARKET,pathname:'/apps/opendesk/ai-vip-share/',hash,
    assign(url){navigations.push(url);}};
  const chrome={runtime:{sendMessage(id,message,callback){
    assert.equal(id,channel.extensionId);
    assert.deepEqual(Object.keys(message).sort(),
      (['GET_APP_STATUS','OPEN_INSTALLED_APP'].includes(message.action)?['protocol','action','subject']:
        ['protocol','action','intentId','subject']).sort());
    messages.push({message,callback});
  }}};
  const stored={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),
    removeItem:key=>storage.delete(key)};
  const vm={document:{querySelector:selector=>internals[selector]||null,
      querySelectorAll:selector=>selector==='[data-open-review]'?[primary]:[],
      hidden:false},
    location:page,chrome,crypto:{randomUUID,subtle:webcrypto.subtle},
    vipActivationLanding,vipResumeProof,
    fetch:async()=>({ok:true,json:async()=>({...channel,mode})}),
    sessionStorage:stored,setTimeout:()=>123,clearTimeout:()=>{},setInterval:()=>456,
    addEventListener:(event,fn)=>listeners.set(event,fn),Date,URL};
  runInNewContext(script,vm,{filename:'src/market-site/client.js'});
  const pending=()=>messages.filter(row=>!row.done);
  const answer=(action,extra={})=>{
    const found=pending().find(row=>row.message.action===action);
    assert.ok(found,'missing '+action+', pending: '+pending().map(x=>x.message.action).join(','));
    found.done=true;found.callback(receipt(found.message,extra));return found;
  };
  return {page,primary,status,back,messages,navigations,answer,pending,storage,
    click:()=>primary.listeners.click(),focus:()=>listeners.get('focus')?.()};
}
async function settleReads(h){
  for(let i=0;i<10;i++){
    await tick();
    const reads=h.pending().filter(x=>x.message.action==='GET_APP_STATUS');
    for(const request of reads)h.answer('GET_APP_STATUS');
  }
}
test('only exact development origin, VIP detail route and canonical fragment can resume',async()=>{
  const input={origin:MARKET,pathname:'/apps/opendesk/ai-vip-share/',hash:HASH};
  assert.deepEqual(vipActivationLanding(input,channel),{
    activationUrl:'http://127.0.0.1:7898/activate?activation_code='+REF});
  for(const [page,options] of [
    [{...input,hash:HASH+'&next=evil'},channel],
    [{...input,hash:HASH.replace('vip-ref','activation_code')},channel],
    [{...input,hash:HASH+'#junk'},channel],
    [{...input,pathname:'/'},channel],
    [{...input,origin:'http://127.0.0.1:43133'},channel],
    [input,{...channel,mode:'production'}],
    [input,{...channel,enabled:false}]]){
    assert.equal(vipActivationLanding(page,options),null);
  }
  assert.equal((await vipResumeProof(HASH)).length,64);
  assert.equal(await vipResumeProof(HASH+'?next=evil'),null);
});
test('installed VIP click opens exact pinned package and continues only after APP_OPENED',async()=>{
  const h=browser();await tick();
  h.answer('GET_APP_STATUS',{currentInstallation:'installed',installedVersion:app.version,enabled:true});
  await tick();
  assert.match(h.primary.textContent,/打开应用并继续领取/);
  const clicking=h.click();await tick();
  h.answer('GET_APP_STATUS',{currentInstallation:'installed',installedVersion:app.version,enabled:true});
  await tick();assert.equal(h.navigations.length,0);
  assert.deepEqual(h.pending().map(x=>x.message.action),['OPEN_INSTALLED_APP']);
  h.answer('OPEN_INSTALLED_APP');await clicking;
  assert.deepEqual(h.navigations,['http://127.0.0.1:7898/activate?activation_code='+REF]);
  assert.equal(h.messages.filter(x=>x.message.action==='OPEN_INSTALL_REVIEW').length,0);
});
test('first install preserves only digest, resumes original link after trusted journal receipt',async()=>{
  const h=browser();await tick();h.answer('GET_APP_STATUS');await tick();
  const promise=h.click();await tick();h.answer('GET_APP_STATUS');await tick();
  const review=h.answer('OPEN_INSTALL_REVIEW');await promise;
  assert.ok(review.message.intentId);
  const saved=JSON.parse([...h.storage.values()][0]);
  assert.equal(saved.resumeProof,await vipResumeProof(HASH));
  assert.equal(JSON.stringify(saved).includes(REF),false,'no bearer reference in continuation journal');
  const checking=h.click();await tick();
  h.answer('GET_INSTALL_STATUS',{installation:'installed',currentInstallation:'installed',
    installedVersion:app.version,enabled:true});await tick();
  assert.equal(h.navigations.length,0);
  h.answer('OPEN_INSTALLED_APP');await checking;
  assert.deepEqual(h.navigations,['http://127.0.0.1:7898/activate?activation_code='+REF]);
  assert.equal(h.storage.size,0);
});
test('cancel or changed source never reopens installed tool or consumes link',async()=>{
  for(const alter of ['cancelled','changed']){
    const h=browser();await tick();h.answer('GET_APP_STATUS');await tick();
    const clicking=h.click();await tick();h.answer('GET_APP_STATUS');await tick();
    h.answer('OPEN_INSTALL_REVIEW');await clicking;
    if(alter==='changed')h.page.hash='#vip-ref='+ 'b'.repeat(32);
    const checking=h.click();await tick();
    h.answer('GET_INSTALL_STATUS',alter==='changed'?
      {installation:'installed',currentInstallation:'installed',installedVersion:app.version,enabled:true}:
      {installation:'cancelled'});await checking;
    assert.deepEqual(h.navigations,[]);
    assert.equal(h.messages.some(row=>row.message.action==='OPEN_INSTALLED_APP'),false);
  }
});
test('pending panel navigation does not trigger a link redirect',async()=>{
  const h=browser();await tick();h.answer('GET_APP_STATUS');await tick();
  const click=h.click();await tick();h.answer('GET_APP_STATUS',{currentInstallation:'installed',installedVersion:app.version,enabled:true});
  await tick();h.answer('OPEN_INSTALLED_APP',{status:'PANEL_REQUIRED'});await click;
  assert.equal(h.navigations.length,0);
  assert.match(h.status.textContent,/工具栏/);
});
