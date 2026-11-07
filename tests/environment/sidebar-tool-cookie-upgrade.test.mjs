import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installReviewedSidebarTool,MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';

const baseline={format:'opendesk.sidebar-tool.v2',id:'cookie-test',version:'1.0.0',title:'Cookie',
  description:'Test',capabilities:['browser.cookies.read','browser.cookies.write'],html:'<main></main>',css:'',js:'void 0;',
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}};
async function fixture(){
  const hash=await sidebarToolPackageHash(baseline),oldEpoch='previous-install';
  const grant={version:baseline.version,packageHash:hash,installEpoch:oldEpoch,
    cookieSites:{'https://example.com':{read:true,write:true,storeId:'0',grantEpoch:'user-grant'}},
    cookieAllSites:{read:false,write:false,storeId:'0',grantEpoch:'revoked'},
    unrelatedSensitiveGrant:true};
  const values={[SIDEBAR_TOOL_STORE]:[baseline],[TOOL_REVOCATION_EPOCHS_STORE]:{[baseline.id]:oldEpoch},
    [BROWSER_MENU_GRANTS_STORE]:{[baseline.id]:grant,peer:{version:'peer'}}};
  const writes=[];
  const api={storage:{local:{async get(key){return {[key]:structuredClone(values[key])};},
    async set(rows){writes.push(structuredClone(rows));Object.assign(values,structuredClone(rows));},async remove(key){delete values[key];}}}};
  return {api,values,writes,grant,lockManager:{request:async(_name,fn)=>fn()}};
}
const update=(f,candidate={...baseline,version:'1.0.1'},extra={})=>installReviewedSidebarTool({
  ...f,candidate,baseline,reviewApproved:true,...extra});

test('reviewed update retains exact Cookie grants with the new identity in the installation commit',async()=>{
  const f=await fixture(),candidate={...baseline,version:'1.0.1'};
  await update(f,candidate);
  const epoch=f.values[TOOL_REVOCATION_EPOCHS_STORE][baseline.id];
  assert.notEqual(epoch,f.grant.installEpoch);
  assert.deepEqual(f.values[BROWSER_MENU_GRANTS_STORE][baseline.id],{
    version:candidate.version,packageHash:await sidebarToolPackageHash(candidate),installEpoch:epoch,
    cookieSites:f.grant.cookieSites,cookieAllSites:f.grant.cookieAllSites});
  assert.deepEqual(f.values[BROWSER_MENU_GRANTS_STORE].peer,{version:'peer'});
  assert.ok(f.writes.some(row=>row[SIDEBAR_TOOL_STORE]&&row[TOOL_REVOCATION_EPOCHS_STORE]&&row[BROWSER_MENU_GRANTS_STORE]));
});
test('stale grants and newly requested Cookie capabilities never become valid during update',async()=>{
  for(const change of ['epoch','hash','version','new-capability']){
    const f=await fixture();
    if(change==='epoch')f.values[BROWSER_MENU_GRANTS_STORE][baseline.id].installEpoch='revoked';
    if(change==='hash')f.values[BROWSER_MENU_GRANTS_STORE][baseline.id].packageHash='0'.repeat(64);
    if(change==='version')f.values[BROWSER_MENU_GRANTS_STORE][baseline.id].version='0.9.0';
    const before=structuredClone(f.values[BROWSER_MENU_GRANTS_STORE][baseline.id]);
    const candidate={...baseline,version:'1.0.1',capabilities:change==='new-capability'?
      [...baseline.capabilities,'browser.cookies.values']:baseline.capabilities};
    await update(f,candidate);
    assert.deepEqual(f.values[BROWSER_MENU_GRANTS_STORE][baseline.id],before,change);
  }
});
test('reviewed source replacement does not carry the former source Cookie consent',async()=>{
  const f=await fixture(),hash=await sidebarToolPackageHash(baseline);
  f.values[MARKET_PROVENANCE_STORE]={[baseline.id]:{marketId:'opendesk/'+baseline.id,version:baseline.version,sha256:hash}};
  const before=structuredClone(f.values[BROWSER_MENU_GRANTS_STORE][baseline.id]);
  await update(f,undefined,{approveSourceChange:async()=>true});
  assert.deepEqual(f.values[BROWSER_MENU_GRANTS_STORE][baseline.id],before);
});
test('same-source reviewed market upgrade keeps the granted scope without requiring catalog freshness',async()=>{
  const f=await fixture(),candidate={...baseline,version:'1.0.1'};
  f.values[MARKET_PROVENANCE_STORE]={[baseline.id]:{marketId:'opendesk/'+baseline.id,version:'0.9.0',sha256:'0'.repeat(64)}};
  await update(f,candidate,{market:{marketId:'opendesk/'+baseline.id,sha256:await sidebarToolPackageHash(candidate),operationId:randomUUID()}});
  assert.equal(f.values[BROWSER_MENU_GRANTS_STORE][baseline.id].installEpoch,f.values[TOOL_REVOCATION_EPOCHS_STORE][baseline.id]);
});
