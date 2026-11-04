import test from 'node:test';
import assert from 'node:assert/strict';
import {admitsInstalledSidebarTool} from '../../src/ui/sidebar-tools/installation.js';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';

const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'installed-runtime',
  version:'0.1.0',title:'Local reviewed tool',description:'Runtime installation admission',
  capabilities:['storage.local'],requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},
  html:'<main>Local UI</main>',css:'',js:'void 0;'});
const state=()=>({tool,installed:[structuredClone(tool)],id:tool.id,
  capabilities:['storage.local'],expectedEpoch:null});

test('reviewed local versions and edited packages use their actual installation without a release record',()=>{
  assert.equal(admitsInstalledSidebarTool(state()),true);
  for(const edit of [{version:'9.8.7'},{js:'void 1;'},{html:'<main>Custom UI</main>'}]){
    const current=validateSidebarToolPackage({...tool,...edit});
    assert.equal(admitsInstalledSidebarTool({...state(),tool:current,installed:[current]}),true);
  }
});

test('runtime admission rejects stale identities, duplicate owners, missing capabilities and invalid lifecycle',()=>{
  for(const change of [
    {tool:{...tool,js:'void 1;'}},{installed:[]},{installed:[tool,tool]},
    {id:'other-tool'},{capabilities:['browser.cookies.read']},
    {enableRecords:{[tool.id]:false}},{enableRecords:{[tool.id]:'true'}},
    {epochs:{[tool.id]:'rotated'}},{epochs:{[tool.id]:42},expectedEpoch:42},
    {epochs:{[tool.id]:''},expectedEpoch:''},{expectedEpoch:undefined}
  ])assert.equal(admitsInstalledSidebarTool({...state(),...change}),false,JSON.stringify(change));
  assert.equal(admitsInstalledSidebarTool(),false);
});

test('retained settings may be displayed while disabled; execution still follows the exact current epoch',()=>{
  const current={...state(),enableRecords:{[tool.id]:false},epochs:{[tool.id]:'current'},expectedEpoch:'current'};
  assert.equal(admitsInstalledSidebarTool(current),false);
  assert.equal(admitsInstalledSidebarTool({...current,requireEnabled:false}),true);
  assert.equal(admitsInstalledSidebarTool({...current,requireEnabled:false,expectedEpoch:null}),false);
  assert.equal(admitsInstalledSidebarTool({...current,enableRecords:{[tool.id]:true}}),true);
});
