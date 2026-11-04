import {settingsReactFixture} from '../helpers/trusted-settings-react-fixture.mjs';
import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import {createTimeReviewPermissionControls} from '../../projects/time-review/trusted/host-controls.js';
import {TIME_REVIEW_KEY} from '../../projects/time-review/trusted/model.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {admitsTrustedTimeReview,TRUSTED_TIME_REVIEW_VERSION} from '../../projects/time-review/trusted/trusted-admission.js';
import {serializeSidebarToolPackage,validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';

function fixture(){
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v1',
    id:'time-review',version:TRUSTED_TIME_REVIEW_VERSION,title:'Time Review',
    description:'Reviewed static UI',capabilities:['time.review','user.export'],
    html:'<main></main>',css:'.x{}',js:'void 0;'});
  const bytes=Buffer.from(serializeSidebarToolPackage(tool));
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const release={id:'opendesk/time-review',toolId:'time-review',
    version:tool.version,packagePath:'official-tools/time-review/time-review.opendesk-tool.json',
    bytes:bytes.length,sha256};
  const expectedEpoch='approved-epoch';
  const args={tool,installed:[tool],release,expectedEpoch,epochs:{'time-review':expectedEpoch},
    provenance:{'time-review':{marketId:release.id,version:tool.version,sha256}},
    enableRecords:{'time-review':true}};
  return args;
}
test('Time Review admission requires an actual unique install, time capability and valid lifecycle',async()=>{
  const good=fixture();
  assert.equal(await admitsTrustedTimeReview(good),true);
  const missing={...good.tool,capabilities:['user.export']};
  const malformed={...good.tool,extra:true};
  for(const change of [
    {tool:{...good.tool,id:'another-tool'}},
    {tool:{...good.tool,js:'different()'}},
    {tool:{...good.tool,version:'1.5.2'}},
    {tool:missing,installed:[missing]},
    {tool:malformed,installed:[malformed]},
    {enableRecords:{'time-review':false}},
    {enableRecords:{'time-review':'true'}},{enableRecords:[]},
    {installed:[]},{installed:undefined},{installed:{}},
    {installed:[{...good.tool,js:'different()'}]},
    {installed:[good.tool,good.tool]},
    {installed:[good.tool,{...good.tool,js:'different()'}]},
    {epochs:{'time-review':'other'}},{expectedEpoch:null},{expectedEpoch:undefined},
    {epochs:[]},{epochs:null},
    {epochs:{'time-review':7},expectedEpoch:7},
    {epochs:{'time-review':''},expectedEpoch:''}
  ])assert.equal(await admitsTrustedTimeReview({...good,...change}),false,JSON.stringify(change));
  assert.equal(await admitsTrustedTimeReview(),false);
});
test('Time Review admission accepts initial null epoch without a Catalog or source record',async()=>{
  const good={...fixture(),expectedEpoch:null,epochs:{},release:undefined,provenance:undefined};
  assert.equal(await admitsTrustedTimeReview(good),true);
  assert.equal(await admitsTrustedTimeReview({...good,epochs:undefined}),true);
  assert.equal(await admitsTrustedTimeReview({...good,tool:{...good.tool,js:'different()'}}),false);
  assert.equal(await admitsTrustedTimeReview({...good,enableRecords:{'time-review':false}}),false);
  assert.equal(await admitsTrustedTimeReview({...good,expectedEpoch:'stale-epoch'}),false);
});
test('Time Review admission ignores stale releases and provenance for installed old or local packages',async()=>{
  const good=fixture();
  const local={...good.tool,version:'1.5.2',html:'<main>Custom time review</main>',css:'',
    js:'throw new Error("installed JS must remain in the sandbox");'};
  for(const change of [
    {release:null,provenance:{}},
    {release:{...good.release,id:'other/time-review',version:'0.0.1',
      packagePath:'local.json',sha256:'invalid',bytes:1}},
    {provenance:{'time-review':{marketId:'local',version:'0.0.1',extra:true}}},
    {tool:local,installed:[local]}
  ])assert.equal(await admitsTrustedTimeReview({...good,...change}),true);
  const unreadable={...good};
  for(const key of ['release','provenance'])Object.defineProperty(unreadable,key,{
    get(){throw new Error('distribution metadata must not be read');}
  });
  assert.equal(await admitsTrustedTimeReview(unreadable),true);
});
test('R1.6 source uses one static first-party UI; other tools retain the opaque sandbox',async t=>{
  const host=await readFile('src/ui/sidebar-tools.js','utf8');
  const entry=await readFile('src/entrypoints/sidebar-tool-host.js','utf8');
  const native=await readFile('projects/time-review/trusted/trusted-native-ui.js','utf8');
  const main=await readFile('projects/time-review/src/main.js','utf8');
  const markup=await renderSidebarFixture();
  assert.match(host,/sidebar-tools\/sandbox\.html/);
  assert.match(host,/admitsTrustedTimeReview/);
  assert.match(host,/MARKET_PROVENANCE_STORE/);
  assert.match(host,/forceSandbox/);
  assert.match(entry,/trustedTimeReviewUI/);
  assert.match(native,/index\.html\?raw/);
  assert.match(native,/src\/main\.js/);
  assert.doesNotMatch(native.replace(/^\s*\/\/.*$/gm,''),/tool\.(?:html|css|js)/);
  assert.match(main,/__opendeskMountTrustedTimeReview/);
  assert.match(markup,/href="ui\/time-review\.css"/);
});


// R1.7: exercise real trusted-control callbacks with a small DOM/API mock.
// These checks do not claim macOS Chrome permission-dialog acceptance.
function r17PermissionFixture(t){
  const f=settingsReactFixture('timeReview',t),get=f.find;
  let siteGrants={allSites:false,origins:[]},idlePermission=false,requests=0,removals=0;
  let pendingRead=null,currentUrl='https://example.com/path';
  const api={
    storage:{local:{async get(){
      const pending=pendingRead;pendingRead=null;
      return pending||{[TIME_REVIEW_KEY]:{siteGrants}};
    }}},
    permissions:{
      async contains(){return idlePermission;},
      request(){requests++;idlePermission=true;return Promise.resolve(true);},
      async remove(){removals++;idlePermission=false;return true;}
    },
    windows:{async getLastFocused(){return {focused:true,incognito:false,type:'normal',id:1};}},
    tabs:{async query(){return [{url:currentUrl,incognito:false}];}}
  };
  const controls=createTimeReviewPermissionControls({api,ui:f.ui,notice(){},
    async runOperation(name,payload){
      if(name==='time.siteGrant'&&payload.mode==='all')
        siteGrants={allSites:payload.enabled,origins:[]};
      return {siteGrants};
    }});
  const installed={id:'time-review',capabilities:['time.review']};
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
  const click=(id,isTrusted=true)=>f.invoke(id,{isTrusted});
  return {api,get,controls,installed,click,flush,
    setIdle:value=>{idlePermission=value;},
    setGrants:value=>{siteGrants=value;},
    setCurrentUrl:value=>{currentUrl=value;},
    deferNextRead(){
      let resolve;
      pendingRead=new Promise(done=>{resolve=done;});
      return oldSiteGrants=>resolve({[TIME_REVIEW_KEY]:{siteGrants:oldSiteGrants}});
    },
    counters:()=>({requests,removals})};
}

test('R1.7 first-party native controls have one start and only relevant Chrome idle actions',async t=>{
  const f=r17PermissionFixture(t);
  f.controls.render(f.installed,false,true);await f.flush();
  assert.equal(f.get('time-review-trusted-start').hidden,true);
  assert.equal(f.get('time-review-grant-idle').hidden,false);
  assert.equal(f.get('time-review-revoke-idle').hidden,true);
  assert.equal(f.get('time-review-site-all-revoke').hidden,true);
  f.click('time-review-grant-idle',false);
  assert.equal(f.counters().requests,0,'synthetic clicks cannot request Chrome permissions');
  f.click('time-review-grant-idle');
  assert.equal(f.counters().requests,1,'native Chrome permission request starts in real click handler');
  await f.flush();await f.flush();
  assert.equal(f.get('time-review-grant-idle').hidden,true);
  assert.equal(f.get('time-review-revoke-idle').hidden,false);
  f.click('time-review-revoke-idle');
  await f.flush();await f.flush();
  assert.equal(f.counters().removals,1);
  assert.equal(f.get('time-review-grant-idle').hidden,false);
  assert.equal(f.get('time-review-revoke-idle').hidden,true);
  f.controls.render(f.installed,false,false);await f.flush();
  assert.equal(f.get('time-review-trusted-start').hidden,false,'sandbox fallback still has its trusted start');
  f.controls.render(null);await f.flush();
  assert.equal(f.get('time-review-permission-settings').hidden,true);
});

test('R1.7 whole-site grant cannot show redundant or ineffective per-origin enrollment',async t=>{
  const f=r17PermissionFixture(t);
  f.setGrants({allSites:true,origins:[]});
  f.controls.render(f.installed,false,true);await f.flush();
  assert.equal(f.get('time-review-site-all-open').hidden,true);
  assert.equal(f.get('time-review-site-current-open').hidden,true);
  assert.equal(f.get('time-review-site-all-revoke').hidden,false);
  f.setGrants({allSites:false,origins:['https://example.com']});
  f.controls.render(f.installed,false,true);await f.flush();
  assert.equal(f.get('time-review-site-current-open').hidden,true,
    'an already authorized exact Origin should not offer duplicate enrollment');
  assert.equal(f.get('time-review-site-all-open').hidden,false);
  f.setCurrentUrl('https://another.example/path');
  f.controls.render(f.installed,false,true);await f.flush();
  assert.equal(f.get('time-review-site-current-open').hidden,false,
    'a different Origin must remain individually authorizable');
  assert.equal(f.get('time-review-site-all-revoke').hidden,false);
  assert.equal(f.get('time-review-site-grants-list').children.length,1);
  f.setGrants({allSites:false,origins:[]});
  f.controls.render(f.installed,false,true);await f.flush();
  assert.equal(f.get('time-review-site-all-revoke').hidden,true);
});


test('R1.7 late site-grant storage read never repaints revoked/obsolete consent',async t=>{
  const f=r17PermissionFixture(t);
  const resolveOldRead=f.deferNextRead();
  f.controls.render(f.installed,false,true); // old read deliberately stays in flight
  f.click('time-review-site-all-open');
  f.click('time-review-site-all-approve');
  await f.flush();await f.flush();
  assert.equal(f.get('time-review-site-all-open').hidden,true);
  assert.equal(f.get('time-review-site-all-revoke').hidden,false);
  resolveOldRead({allSites:false,origins:[]});
  await f.flush();await f.flush();
  assert.equal(f.get('time-review-site-all-open').hidden,true,
    'stale response must not re-enable a duplicate grant');
  assert.equal(f.get('time-review-site-all-revoke').hidden,false,
    'latest durable all-site grant must remain displayed');
});


test('R1.8 unavailable Chrome permission and storage APIs fail closed without async rejection',async t=>{
  const f=r17PermissionFixture(t);
  delete f.api.permissions.contains;
  delete f.api.storage.local.get;
  f.controls.render(f.installed,false,true);
  await f.flush();await f.flush();
  assert.equal(f.get('time-review-grant-idle').hidden,false,
    'unknown idle permission must never be treated as authorized');
  assert.equal(f.get('time-review-revoke-idle').hidden,true);
  assert.match(f.get('time-review-site-grants-status').textContent,/授权状态不可读/);
});
