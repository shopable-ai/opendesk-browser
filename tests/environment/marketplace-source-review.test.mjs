import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {initMarketplace} from '../../src/marketplace/page.js';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_PROVENANCE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {OFFICIAL_RELEASE_SCHEMA,OFFICIAL_SOURCE_REPOSITORY,officialPackagePath} from '../../src/sidebar-tools/official-catalog.js';

const bytes=await readFile('examples/sidebar-tools/bookmark-manager/bookmark-manager.opendesk-tool.json');
const tool=JSON.parse(bytes),sha256=createHash('sha256').update(bytes).digest('hex');
const release={id:'opendesk/'+tool.id,toolId:tool.id,kind:'sidebar-tool',installationPolicy:'optional',
  version:tool.version,packageTitle:tool.title,description:tool.description,capabilities:tool.capabilities,
  packagePath:officialPackagePath(tool.id),bytes:bytes.length,sha256};
const source={marketId:release.id,version:tool.version,sha256};
const settle=async check=>{
  for(let i=0;i<60;i++){if(check())return;await new Promise(setImmediate);}
  assert.ok(check(),'market UI did not reach the expected state');
};
async function fixture(t,{installed=tool,provenance={}}={}){
  const {document,window}=parseHTML('<main id="market-root"></main>');
  const previous=Object.fromEntries(['document','window','location','fetch'].map(key=>[key,globalThis[key]]));
  Object.assign(globalThis,{document,window,location:{search:'',hash:'#/apps/opendesk/bookmark-manager/versions/'+tool.version,
    href:'chrome-extension://'+'a'.repeat(32)+'/ui/marketplace.html'},
    fetch:async url=>new URL(url).protocol!=='chrome-extension:'?new Response('',{status:404}):
      new Response(new URL(url).pathname==='/official-tools/catalog.json'?
        JSON.stringify({schema:OFFICIAL_RELEASE_SCHEMA,sourceRepository:OFFICIAL_SOURCE_REPOSITORY,apps:[release]}):bytes)});
  const dataKey=sidebarToolStorageKey(tool.id);
  const values={[SIDEBAR_TOOL_STORE]:[structuredClone(installed)],[MARKET_PROVENANCE_STORE]:provenance,
    [TOOL_REVOCATION_EPOCHS_STORE]:{[tool.id]:'existing-installation'},[dataKey]:{draft:'保留原数据'}};
  const writes=[],listeners=new Set();
  const api={runtime:{getURL:path=>'chrome-extension://'+'a'.repeat(32)+'/'+path},
    tabs:{create:async()=>{}},storage:{local:{
      async get(keys){return structuredClone(keys===null?values:Object.fromEntries((typeof keys==='string'?[keys]:keys).map(key=>[key,values[key]])));},
      async set(rows){writes.push(Object.keys(rows));Object.assign(values,structuredClone(rows));}
    },onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  const view=initMarketplace({api,root:document.getElementById('market-root'),
    lockManager:{request:async(_name,fn)=>fn()}});
  t.after(()=>{view.dispose();Object.assign(globalThis,previous);});
  const buttons=()=>[...document.querySelectorAll('button')];
  const button=text=>buttons().find(node=>node.textContent===text);
  await settle(()=>button('打开使用')||button('审阅版本更新')).catch(error=>{
    throw new Error(document.getElementById('market-root').textContent,{cause:error});
  });
  return {document,values,writes,button,dataKey,listeners};
}

test('same official bytes without provenance offer explicit review and preserve installation/data',async t=>{
  const f=await fixture(t),before=structuredClone(f.values);
  await settle(()=>f.button('审阅官方来源'));
  assert.deepEqual(f.writes,[],'matching package bytes cannot silently create provenance');
  f.button('审阅官方来源').click();
  await settle(()=>f.document.querySelector('[data-market-action="confirm-install"]'));
  assert.equal(f.document.querySelector('[data-market-action="confirm-install"]').disabled,false);
  f.document.querySelector('[data-market-action="cancel-install"]').click();
  assert.deepEqual(f.values,before,'cancel leaves provenance, grants and data intact');
  f.button('审阅官方来源').click();
  await settle(()=>f.document.querySelector('[data-market-action="confirm-install"]'));
  f.document.querySelector('[data-market-action="confirm-install"]').click();
  await settle(()=>f.values[MARKET_PROVENANCE_STORE][tool.id]?.sha256===sha256&&!f.button('审阅官方来源'));
  assert.deepEqual(f.values[MARKET_PROVENANCE_STORE][tool.id],source);
  assert.deepEqual(f.values[SIDEBAR_TOOL_STORE],before[SIDEBAR_TOOL_STORE]);
  assert.deepEqual(f.values[TOOL_REVOCATION_EPOCHS_STORE],before[TOOL_REVOCATION_EPOCHS_STORE]);
  assert.deepEqual(f.values[f.dataKey],before[f.dataKey]);
  assert.ok(f.writes.every(keys=>keys.every(key=>key===MARKET_PROVENANCE_STORE)));
});

test('recorded official source opens directly and provenance removal restores review',async t=>{
  const f=await fixture(t,{provenance:{[tool.id]:source}});
  assert.equal(f.button('审阅官方来源'),undefined);
  delete f.values[MARKET_PROVENANCE_STORE][tool.id];
  for(const listener of f.listeners)listener({[MARKET_PROVENANCE_STORE]:{newValue:{}}},'local');
  await settle(()=>f.button('审阅官方来源'));
  assert.deepEqual(f.writes,[]);
});

test('same version with different bytes cannot use source review to overwrite the package',async t=>{
  const f=await fixture(t,{installed:{...tool,css:tool.css+'\n/* local edit */'}});
  assert.equal(f.button('审阅官方来源'),undefined);
  f.button('审阅版本更新').click();
  await settle(()=>f.document.querySelector('[data-market-action="confirm-install"]'));
  assert.equal(f.document.querySelector('[data-market-action="confirm-install"]').disabled,true);
  assert.deepEqual(f.writes,[]);
});

test('mismatched or malformed provenance cannot hide the source review',async t=>{
  for(const record of [{...source,sha256:'0'.repeat(64)},{...source,marketId:'opendesk/another-tool'},
    {...source,extra:true}])await t.test(JSON.stringify(record),async t=>{
    const f=await fixture(t,{provenance:{[tool.id]:record}});
    await settle(()=>f.button('审阅官方来源'));
    assert.deepEqual(f.writes,[]);
  });
});

test('an installation changed after review cannot receive stale official provenance',async t=>{
  const f=await fixture(t);
  await settle(()=>f.button('审阅官方来源'));
  f.button('审阅官方来源').click();
  await settle(()=>f.document.querySelector('[data-market-action="confirm-install"]'));
  f.values[SIDEBAR_TOOL_STORE][0].css+='\n/* changed after review */';
  f.document.querySelector('[data-market-action="confirm-install"]').click();
  await settle(()=>f.document.querySelector('[data-market-action="review-again"]'));
  assert.match(f.document.getElementById('market-root').textContent,/E_TOOL_CHANGED/);
  assert.deepEqual(f.writes,[]);
});

test('a newer installed version still rejects downgrade to the catalog release',async t=>{
  const f=await fixture(t,{installed:{...tool,version:'0.3.12'}});
  assert.equal(f.button('审阅官方来源'),undefined);
  f.button('审阅版本更新').click();
  await settle(()=>f.document.querySelector('[data-market-action="confirm-install"]'));
  assert.equal(f.document.querySelector('[data-market-action="confirm-install"]').disabled,true);
  assert.deepEqual(f.writes,[]);
});
