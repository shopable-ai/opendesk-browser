import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {initMarketplace} from '../../src/marketplace/page.js';
import {createMarketPanelNavigation,marketPanelNavigationKey,MARKET_PANEL_NAV_PROTOCOL} from '../../src/marketplace/panel-navigation.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {OFFICIAL_RELEASE_SCHEMA,OFFICIAL_SOURCE_REPOSITORY,officialPackagePath} from '../../src/sidebar-tools/official-catalog.js';

const bytes=await readFile('examples/sidebar-tools/markdown-workbench/markdown-workbench.opendesk-tool.json');
const tool=JSON.parse(bytes),sha256=createHash('sha256').update(bytes).digest('hex'),EXT='a'.repeat(32);
const release={id:'opendesk/'+tool.id,toolId:tool.id,kind:'sidebar-tool',installationPolicy:'optional',
  version:tool.version,packageTitle:tool.title,description:tool.description,capabilities:tool.capabilities,
  packagePath:officialPackagePath(tool.id),bytes:bytes.length,sha256};
const source={marketId:release.id,version:tool.version,sha256};
const settle=async check=>{
  for(let i=0;i<60;i++){if(check())return;await new Promise(setImmediate);}
  assert.ok(check(),'market navigation feedback did not settle');
};
async function fixture(t,{installed=true,status='NAVIGATION_PENDING',storedStatus=null}={}){
  const {document,window}=parseHTML('<main id="market-root"></main>');
  const previous=Object.fromEntries(['document','window','location','fetch'].map(key=>[key,globalThis[key]]));
  const url='chrome-extension://'+EXT+'/ui/marketplace.html';
  Object.assign(globalThis,{document,window,location:{search:'',hash:'#/apps/'+release.id+'/versions/'+tool.version,href:url},
    fetch:async value=>new URL(value).protocol!=='chrome-extension:'?new Response('',{status:404}):
      new Response(new URL(value).pathname==='/official-tools/catalog.json'?
      JSON.stringify({schema:OFFICIAL_RELEASE_SCHEMA,sourceRepository:OFFICIAL_SOURCE_REPOSITORY,apps:[release]}):bytes)});
  const row=createMarketPanelNavigation({windowId:7,tabId:12,source:'built-in',action:installed?'open':'review',
    toolId:tool.id,marketId:release.id,version:tool.version,sha256,sourceDocumentId:'1'.repeat(32),sourceUrl:url});
  const key=marketPanelNavigationKey(7),sessions=storedStatus?{[key]:{...row,status:storedStatus}}:{};
  const values={[SIDEBAR_TOOL_STORE]:installed?[tool]:[],[MARKET_PROVENANCE_STORE]:installed?{[tool.id]:source}:{}};
  const listeners=new Set(),messages=[],writes=[],tabs=[];
  const api={runtime:{getURL:path=>'chrome-extension://'+EXT+'/'+path,async sendMessage(message){messages.push(message);
    return {ok:true,protocol:MARKET_PANEL_NAV_PROTOCOL,requestId:row.requestId,windowId:7,status};}},
    tabs:{create:async value=>tabs.push(value)},storage:{
      session:{get:async name=>({[name]:structuredClone(sessions[name])})},
      local:{get:async keys=>structuredClone(keys===null?values:Object.fromEntries(
        (typeof keys==='string'?[keys]:keys).map(name=>[name,values[name]]))),
      async set(value){writes.push(value);Object.assign(values,structuredClone(value));}},
      onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  const root=document.getElementById('market-root'),view=initMarketplace({api,root,lockManager:{request:async(_name,fn)=>fn()}});
  t.after(()=>{view.dispose();Object.assign(globalThis,previous);});
  const button=text=>[...root.querySelectorAll('button')].find(node=>node.textContent===text);
  await settle(()=>button(installed?'打开使用':'审阅并安装')).catch(error=>{
    throw new Error(root.textContent,{cause:error});
  });
  const emit=(value,eventKey=key)=>{sessions[eventKey]=value;for(const listener of listeners)
    listener({[eventKey]:{newValue:structuredClone(value)}},'session');};
  return {root,button,row,key,emit,messages,writes,tabs,window};
}
test('late completion updates only the matching window/request without installing or creating a tool tab',async t=>{
  const f=await fixture(t);f.button('打开使用').click();
  await settle(()=>f.root.textContent.includes('等待目标面板确认'));
  assert.deepEqual(f.messages,[{protocol:MARKET_PANEL_NAV_PROTOCOL,action:'NAVIGATE',target:'open',
    toolId:tool.id,version:tool.version,marketId:release.id,sha256}]);
  f.emit({...f.row,status:'APP_OPENED'},marketPanelNavigationKey(8));
  f.emit({...f.row,windowId:8,status:'APP_OPENED'});
  f.emit({...f.row,requestId:'22222222-2222-4222-8222-222222222222',status:'APP_OPENED'});
  f.emit({...f.row,sourceDocumentId:'invalid',status:'APP_OPENED'});
  assert.ok(f.root.textContent.includes('等待目标面板确认'));
  f.emit({...f.row,status:'APP_OPENED'});
  assert.ok(f.root.textContent.includes('已在侧边栏打开应用运行界面'));
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.tabs,[]);
});
test('completion arriving before the pending response is recovered by the exact session read',async t=>{
  const f=await fixture(t,{storedStatus:'APP_OPENED'});f.button('打开使用').click();
  await settle(()=>f.root.textContent.includes('已在侧边栏打开应用运行界面'));
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.tabs,[]);
});
test('changing market route invalidates late feedback for the previous route',async t=>{
  const f=await fixture(t);f.button('打开使用').click();
  await settle(()=>f.root.textContent.includes('等待目标面板确认'));
  location.hash='#/';f.window.dispatchEvent(new f.window.Event('hashchange'));
  f.emit({...f.row,status:'APP_OPENED'});
  assert.ok(!f.root.textContent.includes('已在侧边栏打开应用运行界面'));
  assert.deepEqual(f.writes,[]);
});
test('review handoff reports presentation and leaves durable installation to the Side Panel',async t=>{
  const f=await fixture(t,{installed:false,status:'REVIEW_REQUEST_ACCEPTED'});f.button('审阅并安装').click();
  await settle(()=>f.root.textContent.includes('请在侧边栏核对安装结果'));
  assert.ok(!f.root.textContent.includes('尚未安装'));
  assert.equal(f.messages[0].target,'review');
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.tabs,[]);
});
