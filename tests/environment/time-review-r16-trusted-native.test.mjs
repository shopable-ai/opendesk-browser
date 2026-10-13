import test from 'node:test';
import {createTimeReviewPermissionControls} from '../../src/time-review/host-controls.js';
import {TIME_REVIEW_KEY} from '../../src/time-review/model.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {admitsTrustedTimeReview,TRUSTED_TIME_REVIEW_VERSION} from '../../src/time-review/trusted-admission.js';
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
test('R1.6 native admission needs exact built-in version, release hash, provenance and epoch',async()=>{
  const good=fixture();
  assert.equal(await admitsTrustedTimeReview(good),true);
  for(const change of [
    {tool:{...good.tool,js:'malicious()'}},
    {tool:{...good.tool,version:'1.5.2'}},
    {tool:{...good.tool,capabilities:['time.review']}},
    {release:{...good.release,sha256:'0'.repeat(64)}},
    {release:{...good.release,packagePath:'third-party/tool.json'}},
    {release:{...good.release,version:'1.5.2'}},
    {provenance:{}},{provenance:{'time-review':{marketId:'other/time-review',
      version:good.tool.version,sha256:good.release.sha256}}},
    {enableRecords:{'time-review':false}},
    {enableRecords:{'time-review':'true'}},
    {installed:[]},{installed:[{...good.tool,js:'tampered()'}]},
    {epochs:{'time-review':'other'}},{expectedEpoch:null}
  ])assert.equal(await admitsTrustedTimeReview({...good,...change}),false,JSON.stringify(change));
});
test('R1.6 first install with null epoch is admitted only for the exact reviewed release',async()=>{
  const good=fixture();
  good.expectedEpoch=null;
  good.epochs={};
  assert.equal(await admitsTrustedTimeReview(good),true);
  assert.equal(await admitsTrustedTimeReview({...good,tool:{...good.tool,js:'tampered()'}}),false);
  assert.equal(await admitsTrustedTimeReview({...good,provenance:{}}),false);
  assert.equal(await admitsTrustedTimeReview({...good,enableRecords:{'time-review':false}}),false);
  assert.equal(await admitsTrustedTimeReview({...good,expectedEpoch:'stale-epoch'}),false);
});
test('R1.6 source uses one static first-party UI; other tools retain the opaque sandbox',async()=>{
  const host=await readFile('src/ui/sidebar-tools.js','utf8');
  const entry=await readFile('src/entrypoints/sidebar-tool-host.js','utf8');
  const native=await readFile('src/time-review/trusted-native-ui.js','utf8');
  const main=await readFile('examples/sidebar-tools/time-review/src/main.js','utf8');
  const markup=await readFile('src/ui/tool.html','utf8');
  assert.match(host,/sidebar-tools\/sandbox\.html/);
  assert.match(host,/admitsTrustedTimeReview/);
  assert.match(host,/MARKET_PROVENANCE_STORE/);
  assert.match(host,/forceSandbox/);
  assert.match(entry,/trustedTimeReviewUI/);
  assert.match(native,/index\.html\?raw/);
  assert.match(native,/src\/main\.js/);
  assert.doesNotMatch(native,/tool\.(?:html|css|js)/);
  assert.match(main,/__opendeskMountTrustedTimeReview/);
  assert.match(markup,/href="time-review\.css"/);
});


// R1.7: exercise real trusted-control callbacks with a small DOM/API mock.
// These checks do not claim macOS Chrome permission-dialog acceptance.
function r17PermissionFixture(){
  const nodes=new Map();
  function node(id=''){
    const item={id,hidden:false,disabled:false,dataset:{},children:[],handlers:new Map(),
      addEventListener(type,fn){this.handlers.set(type,fn);},
      querySelectorAll(){return [...nodes.values()];},
      replaceChildren(...children){this.children=children;},
      append(...children){this.children.push(...children);},
      setAttribute(){},scrollIntoView(){},focus(){}};
    return item;
  }
  const get=id=>{
    if(!nodes.has(id))nodes.set(id,node(id));
    return nodes.get(id);
  };
  let siteGrants={allSites:false,origins:[]},idlePermission=false,requests=0,removals=0;
  const api={
    storage:{local:{async get(){return {[TIME_REVIEW_KEY]:{siteGrants}};}}},
    permissions:{
      async contains(){return idlePermission;},
      request(){requests++;idlePermission=true;return Promise.resolve(true);},
      async remove(){removals++;idlePermission=false;return true;}
    },
    windows:{async getLastFocused(){return {focused:true,incognito:false,type:'normal',id:1};}},
    tabs:{async query(){return [{url:'https://example.com/path',incognito:false}];}}
  };
  const doc={getElementById:get,createElement:tag=>node(tag)};
  const controls=createTimeReviewPermissionControls({api,doc,notice(){},
    async runOperation(){return {siteGrants};}});
  const installed={id:'time-review',capabilities:['time.review']};
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
  const click=(id,isTrusted=true)=>get(id).handlers.get('click')({isTrusted});
  return {get,controls,installed,click,flush,
    setIdle:value=>{idlePermission=value;},
    setGrants:value=>{siteGrants=value;},
    counters:()=>({requests,removals})};
}

test('R1.7 first-party native controls have one start and only relevant Chrome idle actions',async()=>{
  const f=r17PermissionFixture();
  f.get('sidebar-tool-frame').dataset.timeReviewNative='true';
  f.controls.render(f.installed);await f.flush();
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
  f.get('sidebar-tool-frame').dataset.timeReviewNative='';
  f.controls.render(f.installed);await f.flush();
  assert.equal(f.get('time-review-trusted-start').hidden,false,'sandbox fallback still has its trusted start');
  f.controls.render(null);await f.flush();
  assert.equal(f.get('time-review-permission-settings').hidden,true);
});

test('R1.7 whole-site grant cannot show redundant or ineffective per-origin enrollment',async()=>{
  const f=r17PermissionFixture();
  f.setGrants({allSites:true,origins:[]});
  f.controls.render(f.installed);await f.flush();
  assert.equal(f.get('time-review-site-all-open').hidden,true);
  assert.equal(f.get('time-review-site-current-open').hidden,true);
  assert.equal(f.get('time-review-site-all-revoke').hidden,false);
  f.setGrants({allSites:false,origins:['https://example.com']});
  f.controls.render(f.installed);await f.flush();
  assert.equal(f.get('time-review-site-current-open').hidden,false);
  assert.equal(f.get('time-review-site-all-open').hidden,false);
  assert.equal(f.get('time-review-site-all-revoke').hidden,false);
  assert.equal(f.get('time-review-site-grants-list').children.length,1);
  f.setGrants({allSites:false,origins:[]});
  f.controls.render(f.installed);await f.flush();
  assert.equal(f.get('time-review-site-all-revoke').hidden,true);
});
