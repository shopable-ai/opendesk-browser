import test from 'node:test';
import assert from 'node:assert/strict';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {KNOWLEDGE_DATA_KEY} from '../../src/knowledge/policy.js';
import {getInstalledSidebarTools} from '../../src/ui/sidebar-tools/installation.js';
import {readSidebarStorageUsage} from '../../src/ui/sidebar-tools/storage-usage.js';
import {writeVerifiedLocalValue} from '../../src/ui/sidebar-tools/storage-state.js';
import {initMarketplace} from '../../src/marketplace/page.js';
import {officialFixtures} from '../helpers/official-tools.mjs';

const tool={format:SIDEBAR_TOOL_FORMAT,id:'quick-notes',version:'1.0.0',title:'离线笔记',
  description:'保存本机的草稿',capabilities:['storage.local'],html:'<main>note</main>',css:'',js:'void 0;'};
function fixture(initial={}){
  const values=structuredClone(initial),calls=[];
  const byteCount=keys=>{
    const list=keys===null?Object.keys(values):Array.isArray(keys)?keys:[keys];
    return list.reduce((total,key)=>total+(!Object.hasOwn(values,key)?0:
      Buffer.byteLength(key,'utf8')+Buffer.byteLength(JSON.stringify(values[key]),'utf8')),0);
  };
  const local={
    async get(keys){
      const names=keys===null?Object.keys(values):Array.isArray(keys)?keys:[keys];
      return Object.fromEntries(names.map(key=>[key,structuredClone(values[key])]));
    },
    async set(rows){Object.assign(values,structuredClone(rows));calls.push(Object.keys(rows));},
    async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete values[k];},
    async getBytesInUse(keys){return byteCount(keys);}
  };
  const api={runtime:{getURL:name=>'chrome-extension://abcdefghijklmnop/'+name},
    storage:{local,onChanged:{addListener(){},removeListener(){}}},
    permissions:{contains:async()=>true},tabs:{create:async()=>({id:1})}};
  return {values,calls,api};
}

test('old installed v1 tool and private data remain readable with unlimitedStorage active',async()=>{
  const key=sidebarToolStorageKey(tool.id);
  const {api,values}=fixture({[SIDEBAR_TOOL_STORE]:[tool],[key]:{notes:'旧版本内容'}});
  assert.deepEqual(await getInstalledSidebarTools(api),[tool]);
  const size=await readSidebarStorageUsage(api,[tool]);
  assert.equal(size.unlimited,true);
  assert.equal(size.packageBytes>0,true);
  assert.equal(size.toolDataBytes>0,true);
  assert.deepEqual(values[key],{notes:'旧版本内容'});
});

test('readBytesInUse counts all local keys and includes knowledge 4 MiB namespace, not an invented capacity',async()=>{
  const ordinary=sidebarToolStorageKey(tool.id),large='opendesk.storage-capacity-test.v1:fixture';
  const {api}=fixture({[SIDEBAR_TOOL_STORE]:[tool],[ordinary]:{notes:'abc'},
    [KNOWLEDGE_DATA_KEY]:{version:1,records:['x'.repeat(2*1024*1024)]},
    [large]:'F'.repeat(11*1024*1024)});
  const result=await readSidebarStorageUsage(api,[tool]);
  assert(result.totalBytes>10*1024*1024);
  assert(result.packageBytes<320100);
  assert(result.toolDataBytes>2*1024*1024);
  assert(result.toolDataBytes<4*1024*1024);
  assert(result.totalBytes>result.toolDataBytes);
  assert.equal(result.unlimited,true);
  api.permissions.contains=async()=>false;
  assert.equal((await readSidebarStorageUsage(api,[tool])).unlimited,false);
  api.permissions.contains=async()=>{throw Error('denied');};
  assert.equal((await readSidebarStorageUsage(api,[tool])).unlimited,null);
  api.storage.local.getBytesInUse=async()=>{throw Error('counter unavailable');};
  await assert.rejects(readSidebarStorageUsage(api,[tool]),/counter unavailable/);
});
test('quota refusal leaves existing data intact and unknown response never lies about persistence',async()=>{
  const key=sidebarToolStorageKey(tool.id),prior={draft:'original'};
  const f=fixture({[SIDEBAR_TOOL_STORE]:[tool],[key]:prior});
  f.api.storage.local.set=async()=>{throw Error('QUOTA_BYTES quota exceeded');};
  await assert.rejects(writeVerifiedLocalValue(f.api,key,{draft:'new'},prior),{code:'E_HOST_STORAGE_QUOTA'});
  assert.deepEqual(f.values[key],prior);
  f.api.storage.local.set=async row=>{Object.assign(f.values,row);throw Error('acknowledgement lost');};
  f.api.storage.local.get=async()=>{throw Error('could not inspect write');};
  await assert.rejects(writeVerifiedLocalValue(f.api,key,{draft:'new'},prior),{code:'E_OUTCOME_UNKNOWN'});
  assert.deepEqual(f.values[key],{draft:'new'},'unknown state is not rolled back or overwritten');
});

class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.listeners=new Map();this.textContent='';
    this.style={};this.dataset={};this.hidden=false;this.disabled=false;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  addEventListener(name,fn){this.listeners.set(name,fn);}
  removeEventListener(name){this.listeners.delete(name);}
  setAttribute(name,value){(this.attributes??=new Map()).set(name,value);}
}
const walk=(root)=>[root,...root.children.flatMap(node=>walk(node))];
const settle=async fn=>{for(let i=0;i<160;i++){if(fn())return;await new Promise(resolve=>setImmediate(resolve));}
  throw Error('marketplace did not settle');};

test('My Apps opens local installed package while official catalog is missing or offline',async t=>{
  const f=fixture({[SIDEBAR_TOOL_STORE]:[tool],[sidebarToolStorageKey(tool.id)]:{notes:'private draft'}});
  let opened='',active=0;
  f.api.tabs.create=async({url})=>{opened=url;return {id:7};};
  const previous={document:globalThis.document,window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch};
  const root=new Element('root');
  globalThis.document={createElement:tag=>new Element(tag),getElementById:()=>null};
  globalThis.window={addEventListener(){},removeEventListener(){}};
  globalThis.location={hash:'#/my'};
  globalThis.fetch=async()=>{throw Error('official catalog unavailable');};
  const market=initMarketplace({api:f.api,root,lockManager:{request:(_key,callback)=>callback()}});
  t.after(()=>{market.dispose();Object.assign(globalThis,previous);});
  await settle(()=>walk(root).some(n=>n.textContent.includes('离线笔记')));
  await settle(()=>walk(root).some(n=>n.textContent.includes('官方目录无法读取')));
  const labels=walk(root).map(n=>n.textContent).join(' ');
  assert.match(labels,/离线笔记/);
  assert.doesNotMatch(labels,/尚无已安装应用/);
  const open=walk(root).find(n=>n.textContent==='打开'&&n.listeners.has('click'));
  assert(open,'local Open control must not be guarded by catalog contents');
  await open.listeners.get('click')();
  assert.match(opened,/chrome-extension:\/\/abcdefghijklmnop\/ui\/tool.html/);
  assert.equal(f.values[sidebarToolStorageKey(tool.id)].notes,'private draft');
  assert.equal(active,0);
});

test('a corrupt local install registry reports a storage failure, not an empty My Apps view',async t=>{
  const f=fixture({[SIDEBAR_TOOL_STORE]:{broken:true}});
  const previous={document:globalThis.document,window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch};
  const root=new Element('root');
  globalThis.document={createElement:tag=>new Element(tag),getElementById:()=>null};
  globalThis.window={addEventListener(){},removeEventListener(){}};
  globalThis.location={hash:'#/my'};
  globalThis.fetch=async()=>{throw Error('offline');};
  const market=initMarketplace({api:f.api,root,lockManager:{request:(_key,callback)=>callback()}});
  t.after(()=>{market.dispose();Object.assign(globalThis,previous);});
  await settle(()=>walk(root).some(n=>n.textContent.includes('本机安装记录读取失败')));
  const rendered=walk(root).map(n=>n.textContent).join(' ');
  assert.match(rendered,/E_STORAGE_CORRUPT/);
  assert.doesNotMatch(rendered,/尚无已安装应用/);
  assert.deepEqual(f.values[SIDEBAR_TOOL_STORE],{broken:true});
});

test('capacity usage includes unfinished uninstall namespaces without loading their private note content',async()=>{
  const orphanId='older-notes',orphanKey=sidebarToolStorageKey(orphanId),oldData={notes:'旧记录仍在等待清理'};
  const f=fixture({[SIDEBAR_TOOL_STORE]:[tool],[orphanKey]:oldData});
  const baseline=await readSidebarStorageUsage(f.api,[tool]);
  const used=await readSidebarStorageUsage(f.api,[tool],[orphanId,'invalid/id']);
  const expected=Buffer.byteLength(orphanKey,'utf8')+Buffer.byteLength(JSON.stringify(oldData),'utf8');
  assert.equal(used.toolDataBytes-baseline.toolDataBytes,expected);
  assert.equal(used.totalBytes,baseline.totalBytes,'cleanup markers do not change real total bytes');
});

test('stalled official package lookup never blocks local My Apps or Open after catalog loads',async t=>{
  const catalog=(await officialFixtures()).catalog;
  const official=catalog.apps.find(row=>row.toolId===tool.id);
  assert(official);
  const installed={...tool,version:official.version};
  const f=fixture({[SIDEBAR_TOOL_STORE]:[installed],
    [sidebarToolStorageKey(tool.id)]:{notes:'离线内容仍然可用'}});
  const previous={document:globalThis.document,window:globalThis.window,
    location:globalThis.location,fetch:globalThis.fetch};
  let loadedPackages=0,opened='';
  const bytes=new TextEncoder().encode(JSON.stringify(catalog));
  globalThis.fetch=async url=>{
    if(String(url).endsWith('official-tools/catalog.json'))
      return {ok:true,arrayBuffer:async()=>bytes.buffer};
    loadedPackages++;
    return new Promise(()=>{}); // packaged release read stalls forever
  };
  f.api.tabs.create=async({url})=>{opened=url;return {id:7};};
  const root=new Element('root');
  globalThis.document={createElement:tag=>new Element(tag),getElementById:()=>null};
  globalThis.window={addEventListener(){},removeEventListener(){}};
  globalThis.location={hash:'#/my'};
  const market=initMarketplace({api:f.api,root,lockManager:{request:(_name,fn)=>fn()}});
  t.after(()=>{market.dispose();Object.assign(globalThis,previous);});
  await settle(()=>loadedPackages>0);
  await settle(()=>walk(root).some(node=>node.textContent.includes('离线笔记')));
  const open=walk(root).find(node=>node.textContent==='打开'&&node.listeners.has('click'));
  assert(open,'the local tool opens without waiting for a publisher package');
  await open.listeners.get('click')();
  assert.match(opened,/chrome-extension:\/\/abcdefghijklmnop\/ui\/tool\.html/);
  assert.deepEqual(f.values[sidebarToolStorageKey(tool.id)],{notes:'离线内容仍然可用'});
});

test('late local registry reads cannot replace a newer installed-app snapshot',async t=>{
  const older={...tool,title:'过期本机工具'},newer={...tool,title:'当前本机工具'};
  const f=fixture({[SIDEBAR_TOOL_STORE]:[older]});
  const originalRead=f.api.storage.local.get;
  let releaseOld,changeListener,first=true;
  f.api.storage.local.get=async keys=>{
    if(first&&Array.isArray(keys)&&keys.includes(SIDEBAR_TOOL_STORE)){
      first=false;
      const snapshot=await originalRead(keys);
      await new Promise(resolve=>{releaseOld=resolve;});
      return snapshot;
    }
    return originalRead(keys);
  };
  f.api.storage.onChanged.addListener=fn=>{changeListener=fn;};
  const previous={document:globalThis.document,window:globalThis.window,
    location:globalThis.location,fetch:globalThis.fetch};
  const root=new Element('root');
  globalThis.document={createElement:tag=>new Element(tag),getElementById:()=>null};
  globalThis.window={addEventListener(){},removeEventListener(){}};
  globalThis.location={hash:'#/my'};
  globalThis.fetch=async()=>{throw Error('catalog offline');};
  const market=initMarketplace({api:f.api,root,lockManager:{request:(_name,fn)=>fn()}});
  t.after(()=>{releaseOld?.();market.dispose();Object.assign(globalThis,previous);});
  await settle(()=>typeof releaseOld==='function'&&typeof changeListener==='function');
  f.values[SIDEBAR_TOOL_STORE]=[newer];
  changeListener({[SIDEBAR_TOOL_STORE]:{oldValue:[older],newValue:[newer]}},'local');
  await settle(()=>walk(root).some(node=>node.textContent.includes('当前本机工具')));
  releaseOld();
  for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
  const labels=walk(root).map(node=>node.textContent).join(' ');
  assert.match(labels,/当前本机工具/);
  assert.doesNotMatch(labels,/过期本机工具/);
  assert.deepEqual(f.values[SIDEBAR_TOOL_STORE],[newer]);
});
