import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContextMenuHost,formatBrowserMenuTitle} from '../../src/platform/chrome/context-menus.js';
import {sidebarToolPackageHash,validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {BROWSER_MENU_ROOT,BROWSER_MENU_GRANTS_STORE,BROWSER_MENU_MATERIALIZED_STORE}
  from '../../src/framework/sdk/browser-contract.js';

const LEGACY_OPEN='opendesk.browser.open';
const toolId='opendesk.tool.selection-notes.capture-selection';
const linkId='opendesk.tool.selection-notes.capture-link';
const locks={request:(_name,work)=>work()};
const sourceFile=new URL('../../examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json',import.meta.url);

async function fixture({actions=1,approved=true,chromeAllowed=true,brand={name:'OpenDesk Browser',short_name:'OD'}}={}){
  const tool=JSON.parse(await readFile(sourceFile,'utf8'));
  if(actions>1)tool.contributes.contextMenus.push({
    actionId:'capture-link',title:'OD · 保存链接',contexts:['link'],
    documentUrlPatterns:['https://example.com/*'],handler:'open-self'
  });
  validateSidebarToolPackage(tool);
  const grant={version:tool.version,packageHash:await sidebarToolPackageHash(tool),
    installEpoch:null,origins:['https://example.com'],
    activeActions:tool.contributes.contextMenus.map(row=>row.actionId)};
  const local=new Map([[SIDEBAR_TOOL_STORE,[tool]],
    [BROWSER_MENU_GRANTS_STORE,approved?{[tool.id]:grant}:{}]]);
  const session=new Map(),menus=new Map(),events=[],log=[];
  const write=(map)=>({
    get:async key=>Object.fromEntries((Array.isArray(key)?key:[key])
      .map(name=>[name,map.get(name)])),
    set:async rows=>{for(const [name,value] of Object.entries(rows))map.set(name,structuredClone(value));}
  });
  let permission=chromeAllowed,site=true,failCreate=null;
  let manifest=brand;
  const api={
    runtime:{id:'menu-test',lastError:null,
      getManifest:()=>manifest,getURL:path=>'chrome-extension://menu-test/'+path},
    storage:{local:write(local),session:write(session),
      onChanged:{addListener(){}}},
    permissions:{contains:async request=>
      request.permissions?permission:request.origins?site:false},
    contextMenus:{
      onClicked:{addListener(fn){events.push(fn);}},
      create(item,cb){
        log.push(['create',item.id]);
        if(failCreate===item.id){
          failCreate=null;return chromeError('simulated create error',cb);
        }
        if(menus.has(item.id))return chromeError('duplicate id',cb);
        menus.set(item.id,structuredClone(item));cb();
      },
      update(id,properties,cb){
        log.push(['update',id]);
        if(!menus.has(id))return chromeError('Cannot find menu item',cb);
        menus.set(id,{...menus.get(id),...properties});cb();
      },
      remove(id,cb){
        log.push(['remove',id]);
        if(!menus.has(id))return chromeError('Cannot find menu item',cb);
        const deleteTree=key=>{
          for(const [child,value] of menus)
            if(value.parentId===key)deleteTree(child);
          menus.delete(key);
        };
        deleteTree(id);cb();
      },
      removeAll(){throw Error('removeAll() is forbidden');}
    },
    sidePanel:{open(){return Promise.resolve();}},
    webNavigation:{getFrame:async()=>null}
  };
  function chromeError(message,callback){
    api.runtime.lastError={message};
    callback();
    api.runtime.lastError=null;
  }
  function host(){return createContextMenuHost({api,lockManager:locks,logger:{warn(){}}});}
  return {api,host,tool,grant,local,session,menus,events,log,
    setPermission(value){permission=value;},
    setSite(value){site=value;},
    failNextCreate(id){failCreate=id;},
    setManifest(value){manifest=value;}};
}

test('R1.1 zero/one native entries: no permanent root, optional permission and top-level branding',async()=>{
  const f=await fixture({approved:false}),host=f.host();
  assert.equal((await host.synchronize()).enabled,true);
  assert.equal(f.menus.size,0);
  assert.deepEqual(f.local.get(BROWSER_MENU_MATERIALIZED_STORE),[]);
  f.local.set(BROWSER_MENU_GRANTS_STORE,{[f.tool.id]:f.grant});
  await host.synchronize();
  assert.equal(f.menus.size,1);
  const item=f.menus.get(toolId);
  assert(item);
  assert(!Object.hasOwn(item,'parentId'));
  assert.equal(item.title,'OD · 保存到选区笔记');
  assert.deepEqual(item.contexts,['selection']);
  assert.deepEqual(item.documentUrlPatterns,['https://example.com/*']);
  assert(!f.menus.has(BROWSER_MENU_ROOT));
  assert(!f.menus.has(LEGACY_OPEN));
  assert.equal((await host.synchronize()).count,1);
  assert.equal(f.menus.size,1);
  await f.host().synchronize(); // New MV3 worker sees existing IDs.
  assert.equal(f.menus.size,1);
  const denied=await fixture({chromeAllowed:false});
  assert.equal((await denied.host().synchronize()).enabled,false);
  assert.equal(denied.menus.size,0);
});

test('R1.1 multiple matching actions are flat and preserve distinct Chrome contexts',async()=>{
  const f=await fixture({actions:2});
  await f.host().synchronize();
  assert.equal(f.menus.size,2);
  assert.deepEqual([...f.menus.values()].map(item=>item.contexts),[['selection'],['link']]);
  assert([...f.menus.values()].every(item=>!Object.hasOwn(item,'parentId')));
  assert.equal(f.menus.get(linkId).title,'OD · 保存链接');
  // The actual native collapse/uncollapse is Chromium UI behavior,
  // deliberately NOT inferred from this Map fixture.
});

test('R1.1 upgrades old explicit root by cascading children before recreating flat IDs',async()=>{
  const f=await fixture();
  f.menus.set(BROWSER_MENU_ROOT,{id:BROWSER_MENU_ROOT,title:'Old OpenDesk',contexts:['page']});
  f.menus.set(LEGACY_OPEN,{id:LEGACY_OPEN,parentId:BROWSER_MENU_ROOT,title:'Open'});
  f.menus.set(toolId,{id:toolId,parentId:BROWSER_MENU_ROOT,title:'legacy action'});
  f.menus.set('trusted.unrelated',{id:'trusted.unrelated',title:'Keep me'});
  f.local.set(BROWSER_MENU_MATERIALIZED_STORE,[BROWSER_MENU_ROOT,LEGACY_OPEN,toolId]);
  await f.host().synchronize();
  assert(!f.menus.has(BROWSER_MENU_ROOT));
  assert(!f.menus.has(LEGACY_OPEN));
  assert(!Object.hasOwn(f.menus.get(toolId),'parentId'));
  assert(f.menus.has('trusted.unrelated'),'foreign trusted menu must not be deleted');
  assert(f.log.findIndex(([op,id])=>op==='remove'&&id===BROWSER_MENU_ROOT)<
    f.log.findIndex(([op,id])=>op==='create'&&id===toolId));
  assert.deepEqual(f.local.get(BROWSER_MENU_MATERIALIZED_STORE),[toolId]);
  await f.host().synchronize();
  assert(!Object.hasOwn(f.menus.get(toolId),'parentId'));
  assert(f.menus.has('trusted.unrelated'));
});

test('R1.1 failed partial create journals native IDs; uninstall and SW restart clean orphan',async()=>{
  const f=await fixture({actions:2}),host=f.host();
  f.failNextCreate(linkId);
  await assert.rejects(host.synchronize(),{code:'E_CHROME'});
  const journal=f.local.get(BROWSER_MENU_MATERIALIZED_STORE);
  assert.deepEqual(journal,{phase:'reconciling',ids:[toolId,linkId]});
  assert(f.menus.has(toolId));
  assert(!f.menus.has(linkId));
  f.local.set(SIDEBAR_TOOL_STORE,[]);
  f.local.set(BROWSER_MENU_GRANTS_STORE,{});
  const restarted=f.host();
  assert.deepEqual(await restarted.synchronize(),{enabled:true,count:0});
  assert.equal(f.menus.size,0,'orphan must not persist after uninstall');
  assert.deepEqual(f.local.get(BROWSER_MENU_MATERIALIZED_STORE),[]);
  await restarted.synchronize();
  assert.equal(f.menus.size,0);
});

test('R1.1 revocation, missing site permission and package/epoch change remove owned menus',async()=>{
  const f=await fixture(),host=f.host();
  await host.synchronize();
  f.setSite(false);
  await host.synchronize();
  assert.equal(f.menus.size,0);
  f.setSite(true);
  await host.synchronize();
  assert.equal(f.menus.size,1);
  f.local.set('opendesk.sidebar-tools.revocation-epochs.v1',{[f.tool.id]:'epoch-2'});
  await host.synchronize();
  assert.equal(f.menus.size,0);
  f.local.delete('opendesk.sidebar-tools.revocation-epochs.v1');
  f.local.set(BROWSER_MENU_GRANTS_STORE,{[f.tool.id]:{...f.grant,activeActions:[]}});
  await host.synchronize();
  assert.equal(f.menus.size,0);
});

test('R1.1 manifest short_name is display-only, sanitized and never changes native IDs',async()=>{
  assert.equal(formatBrowserMenuTitle('OD · OD · 保存',{name:'Full Product',short_name:'OD'}),'OD · 保存');
  assert.equal(formatBrowserMenuTitle('保存',{name:'Full Product'}),'Full Product · 保存');
  assert.equal(formatBrowserMenuTitle('OD · \u202e恶意\n文字',{name:'OpenDesk Browser',short_name:'OD'}),'OD · 恶意 文字');
  assert.equal(formatBrowserMenuTitle('保存',{name:'New Product',short_name:'\u202eBAD'}),'New Product · 保存');
  assert.equal(formatBrowserMenuTitle('保存',{short_name:'A'.repeat(40)}),'保存');
  assert([...formatBrowserMenuTitle('X'.repeat(300),{short_name:'OD'})].length<=85);
  const f=await fixture(),host=f.host();
  await host.synchronize();
  f.setManifest({name:'New Product',short_name:'NP'});
  await host.synchronize();
  assert.equal(f.menus.get(toolId).title,'NP · 保存到选区笔记');
  assert.deepEqual([...f.menus.keys()],[toolId]);
});


test('R1.1 different tools share native grouping only when they have independent grants',async()=>{
  const f=await fixture(),first=f.tool;
  const second=structuredClone(first);
  second.id='second-notes';
  second.title='另一工具';
  second.contributes.contextMenus[0].title='保存到另一工具';
  validateSidebarToolPackage(second);
  const secondGrant={...f.grant,packageHash:await sidebarToolPackageHash(second)};
  f.local.set(SIDEBAR_TOOL_STORE,[first,second]);
  f.local.set(BROWSER_MENU_GRANTS_STORE,{
    [first.id]:f.grant,[second.id]:secondGrant
  });
  const secondId='opendesk.tool.second-notes.capture-selection';
  const host=f.host();
  assert.equal((await host.synchronize()).count,2);
  assert.deepEqual([...f.menus.keys()].sort(),[toolId,secondId].sort());
  assert([...f.menus.values()].every(item=>!item.parentId));
  // Only revoke one tool's action grant: neither the other tool's grant nor
  // its native menu may be deleted.
  f.local.set(BROWSER_MENU_GRANTS_STORE,{
    [first.id]:{...f.grant,activeActions:[]},[second.id]:secondGrant
  });
  assert.equal((await host.synchronize()).count,1);
  assert.deepEqual([...f.menus.keys()],[secondId]);
});

test('R1.1 native hostname match cannot express port, but grants retain exact origin',async()=>{
  const f=await fixture();
  const grant={...f.grant,origins:['http://127.0.0.1:43111']};
  f.local.set(BROWSER_MENU_GRANTS_STORE,{[f.tool.id]:grant});
  const host=f.host();
  await host.synchronize();
  const row=f.menus.get(toolId);
  assert(row);
  assert.deepEqual(row.documentUrlPatterns,['http://127.0.0.1/*']);
  assert.deepEqual(f.local.get(BROWSER_MENU_GRANTS_STORE)[f.tool.id].origins,
    ['http://127.0.0.1:43111']);
  // A second port may still SHOW this native entry; it must not be treated
  // as an approved Origin or permission by the Host click verifier.
  const f2=await fixture({approved:false});
  const h2=f2.host();
  await h2.synchronize();
  assert.equal(f2.menus.size,0,'without site consent no native entry may be built');
});
