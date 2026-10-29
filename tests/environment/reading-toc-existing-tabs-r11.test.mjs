import test from 'node:test';
import assert from 'node:assert/strict';
import {officialToolFixture} from '../helpers/official-tools.mjs';
import {repairReadingTocOpenTabs,chromeSitePattern,READING_TOC_REPAIR_SCRIPT}
  from '../../projects/reading-toc/trusted/existing-tabs.js';
import {OFFICIAL_READING_TOC_RELEASE,MARKET_PROVENANCE_STORE}
  from '../../src/sidebar-tools/official-reading-toc.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {READING_TOC_SITE_STORE,changeTocSiteAllowed}
  from '../../projects/reading-toc/trusted/policy.js';
const pin=OFFICIAL_READING_TOC_RELEASE;
function fixture(pkg,provenance=true){
 const state=new Map([[SIDEBAR_TOOL_STORE,[pkg]],...(provenance?
   [[MARKET_PROVENANCE_STORE,{[pin.id]:{marketId:pin.marketId,version:pin.version,sha256:pin.sha256}}]]:[])]);
 const called=[],permissions=[];
 const api={
   storage:{local:{async get(keys){return Object.fromEntries(keys.map(key=>[key,state.get(key)]));}}},
   tabs:{async query(){return [{id:1,url:'https://example.com/a'},{id:2,url:'https://example.org/b'},
     {id:3,url:'chrome://settings'},{id:4,url:'http://localhost:3000/a'}];}},
   scripting:{async executeScript(options){called.push(options);}},
   permissions:{async contains(request){permissions.push(request);return true;}}
 };
 return {api,state,called,permissions};
}
test('R1.1 trusted repair checks package identity, invokes only built-in code and respects URL restrictions',async()=>{
 const f=fixture(await officialToolFixture(pin.id));
 const result=await repairReadingTocOpenTabs({api:f.api});
 assert.deepEqual(result,{state:'complete',injected:3,skipped:1,denied:0,failed:0});
 assert.deepEqual(f.called.map(row=>row.target.tabId),[1,2,4]);
 for(const row of f.called){
   assert.deepEqual(row.files,[READING_TOC_REPAIR_SCRIPT]);
   assert.equal(row.target.allFrames,false);
 }
 assert.deepEqual(f.permissions.at(-1),{origins:['http://localhost/*']});
 assert.equal(chromeSitePattern('chrome://settings'),null);
 assert.equal(chromeSitePattern('https://example.com:443/a'),'https://example.com/*');
});
test('prelaunch existing-tab repair accepts older/local readers without release provenance',async()=>{
 const tool=await officialToolFixture(pin.id);
 for(const pkg of [{...tool,version:'1.0.7'},{...tool,js:tool.js+'\nspoof()'}]){
   const f=fixture(pkg);
   assert.equal((await repairReadingTocOpenTabs({api:f.api})).injected,3);
   for(const call of f.called)assert.deepEqual(call.files,[READING_TOC_REPAIR_SCRIPT]);
 }
 const missing=fixture(tool,false);
 assert.equal((await repairReadingTocOpenTabs({api:missing.api})).injected,3);
});
test('prelaunch existing-tab repair still rejects absent, malformed and duplicate installations',async()=>{
 const tool=await officialToolFixture(pin.id);
 for(const installed of [[],[{...tool,capabilities:[]}],[tool,tool],[{...tool,id:'other-toc'}]]){
   const f=fixture(tool,false);f.state.set(SIDEBAR_TOOL_STORE,installed);
   assert.equal((await repairReadingTocOpenTabs({api:f.api})).state,'not-official');
   assert.equal(f.called.length,0);
 }
});
test('R1.1 repaired tabs honor user disable, per-site stop and Chrome access refusal',async()=>{
 const tool=await officialToolFixture(pin.id);
 const stopped=fixture(tool);
 stopped.state.set(SIDEBAR_TOOL_ENABLE_STORE,{[pin.id]:false});
 assert.equal((await repairReadingTocOpenTabs({api:stopped.api})).injected,0);
 stopped.state.delete(SIDEBAR_TOOL_ENABLE_STORE);
 stopped.state.set(READING_TOC_SITE_STORE,
   changeTocSiteAllowed({},pin.id,'https://example.org/b',false));
 stopped.api.permissions.contains=async req=>!req.origins.includes('http://localhost/*');
 const result=await repairReadingTocOpenTabs({api:stopped.api});
 assert.deepEqual([result.injected,result.skipped,result.denied],[1,2,1]);
});
