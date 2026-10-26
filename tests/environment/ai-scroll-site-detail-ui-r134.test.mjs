import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';
import {createExtensionCenter} from '../../src/ui/extension-center.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,overrides={}){
  const {doc,adapter,state}=createExtensionCenterDOM(t);
  const installed={programId:'opendesk.ai-scroll-navigation',title:'AI Scroll',revision:3,
    manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64),enabled:true,nativeState:'registered',
    authorization:{status:'active',generation:1,installationId:'original'},
    pageRules:{matches:['https://chatgpt.com/*'],excludeMatches:[]},...overrides};
  const requests=[],reviews=[];let finish;
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path},
    storage:{local:{get:async()=>({[SIDEBAR_TOOL_STORE]:[],[SIDEBAR_TOOL_ENABLE_STORE]:{}})},onChanged:{addListener(){},removeListener(){}}}};
  const client={async request(method,payload){
    if(method==='listPagePrograms')return {installed:[structuredClone(installed)]};
    assert.equal(method,'prepareScrollSitePackage');requests.push(payload);
    return new Promise(resolve=>{finish=resolve;});
  }};
  const ui=createExtensionCenter({api,client,doc,extensionList:adapter,
    sidebarTools:{openPagePackageReview(...args){reviews.push(args);return true;}},taskWorkbench:{}});
  t.after(()=>ui.dispose());await ui.refresh();
  const key=state.rowsModel.rows.find(row=>row.id===installed.programId)?.key||'page:'+installed.programId;
  const button=[...doc.querySelectorAll('button[data-extension-key]')].find(node=>
    node.dataset.extensionKey===key&&node.dataset.extensionAction==='main');
  assert.ok(button);button.dispatch('click');
  assert.ok(state.detailModel?.siteUpgrade);
  return {state,doc,ui,installed,requests,reviews,finish:()=>finish({programId:installed.programId,revision:1_000_000_001})};
}

test('site candidate prepared after leaving detail cannot open an obsolete review',async t=>{
  const f=await fixture(t);
  f.state.detailModel.siteUpgrade.onSubmit({origin:'https://example.com',pathScope:'/chat/'},{isTrusted:true});
  assert.equal(f.requests.length,1);
  f.state.onBack();f.finish();await tick();await tick();
  assert.equal(f.reviews.length,0);
});

for(const overrides of [{enabled:false},{nativeState:'unknown'},{error:{message:'registration failed'}}])
  test(`unavailable site detail cannot prepare candidate: ${JSON.stringify(overrides)}`,async t=>{
    const f=await fixture(t,overrides);
    assert.ok(f.state.detailModel.siteUpgrade.disabledReason);
    f.state.detailModel.siteUpgrade.onSubmit({origin:'https://example.com',pathScope:'/chat/'},{isTrusted:true});
    await tick();assert.equal(f.requests.length,0);
  });

test('site detail hands a live candidate to original review without installing it',async t=>{
  const f=await fixture(t);
  f.state.detailModel.siteUpgrade.onSubmit({origin:' https://example.com ',pathScope:' /chat/ '},{isTrusted:true});
  assert.deepEqual(f.requests,[{programId:f.installed.programId,origin:'https://example.com',pathScope:'/chat/',
    expectedInstalledManifestHash:f.installed.manifestHash,expectedGeneration:1}]);
  assert.equal(f.reviews.length,0);f.finish();await tick();await tick();
  assert.equal(f.reviews.length,1);
});
