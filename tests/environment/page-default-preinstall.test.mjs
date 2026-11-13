import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedPageFixtureResources} from '../helpers/official-pages.mjs';
import {resumeDefaultPagePreinstall} from '../../src/scripting/user-scripts/default-preinstall.js';
import {registerDefaultPreinstall,DEFAULT_PREINSTALL_STORE} from '../../src/sidebar-tools/preinstall-intent.js';

const resources=(await approvedPageFixtureResources()).resources;
const id='opendesk.ai-scroll-navigation';
function fixture(){
  let marker={schema:DEFAULT_PREINSTALL_STORE,state:'complete',extensionVersion:'1.0.0',
    plan:[],completed:[],pageState:'pending'};
  const calls=[],installed=[],catalog=[];
  let granted=true,native=true,failImport=false,failReadback=false;
  const api={runtime:{getManifest:()=>({version:'1.0.0'}),getURL:path=>'chrome-extension://fixture/'+path},
    storage:{local:{get:async()=>({[DEFAULT_PREINSTALL_STORE]:structuredClone(marker)}),
      set:async value=>{marker=structuredClone(value[DEFAULT_PREINSTALL_STORE]);}}},
    permissions:{contains:async()=>granted},
    userScripts:{getScripts:async()=>{if(!native)throw Error('unavailable');return [];},execute(){}}};
  let tail=Promise.resolve();
  const lockManager={request(_name,work){const next=tail.then(work);tail=next.catch(()=>{});return next;}};
  const fetcher=async url=>{
    const bytes=resources.get(url.slice(api.runtime.getURL('').length));
    assert.ok(bytes,'only bundled official resources are requested');
    return {ok:true,url,redirected:false,headers:{get:()=>String(bytes.length)},
      arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  };
  const client={async request(method,args){
    calls.push(method);
    if(method==='listPagePrograms'){
      if(failReadback&&installed.length)throw Error('readback unavailable');
      return {installed:structuredClone(installed),catalog:structuredClone(catalog)};
    }
    assert.equal(method,'importPageInstallPackage');
    assert.equal(marker.pageState,'attention','durable fence precedes Authority mutation');
    assert.equal(args.package.programId,id);
    assert.equal(args.expectedInstalledManifestHash,null);
    assert.equal(args.expectedGeneration,null);
    if(failImport)throw Object.assign(Error('lost reply'),{code:'E_OUTCOME_UNKNOWN'});
    const row={programId:id,manifestHash:'authority-manifest',sourceHash:args.package.sourceHash,
      revision:args.package.revision,enabled:true,nativeState:'registered',
      authorization:{installationId:'authority-install',status:'active'}};
    installed.push(row);return structuredClone(row);
  }};
  return {options:{api,lockManager,client,fetcher},calls,installed,catalog,
    get marker(){return marker;},set marker(value){marker=value;},
    set granted(value){granted=value;},set native(value){native=value;},
    set failImport(value){failImport=value;},set failReadback(value){failReadback=value;}};
}

test('fresh intent installs bundled Scroll once through Page Authority, then never recreates an uninstall',async()=>{
  const f=fixture();
  const results=await Promise.all([resumeDefaultPagePreinstall(f.options),resumeDefaultPagePreinstall(f.options)]);
  assert.equal(results[0].installed,1);
  assert.equal(f.marker.pageState,'complete');
  assert.equal(f.installed[0].programId,id);
  f.installed.length=0;
  await resumeDefaultPagePreinstall(f.options);
  assert.equal(f.calls.filter(m=>m==='importPageInstallPackage').length,1);
});

test('a blocked bundled release is not offered to the default installer or reported as a permission failure',async()=>{
  const f=fixture();
  const catalog=JSON.parse(resources.get('official-pages/catalog.json').toString());
  catalog.apps=catalog.apps.map(row=>{
    if(row.installationPolicy!=='preinstalled')return row;
    const {packagePath,bytes,sha256,sourceHash,packageHash,...descriptor}=row;
    return {...descriptor,status:'blocked',blockedReason:'Test release is awaiting approval'};
  });
  const options={...f.options,fetcher:async url=>{
    assert.equal(new URL(url).pathname,'/official-pages/catalog.json','blocked packages are never downloaded');
    return new Response(JSON.stringify(catalog));
  }};
  f.native=false;f.granted=false;
  assert.deepEqual(await resumeDefaultPagePreinstall(options),{state:'complete',installed:0});
  assert.equal(f.marker.pageState,'complete');
  assert.deepEqual(f.calls,['listPagePrograms']);
});

test('old profiles, skipped history and changed extension versions cannot create Page intent',async()=>{
  for(const change of [f=>{f.marker=undefined;},f=>{delete f.marker.pageState;},
    f=>{f.marker.state='skipped-existing';f.marker.pageState='complete';},
    f=>{f.marker.extensionVersion='0.9.0';},f=>{f.marker.state='attention';}]){
    const f=fixture();change(f);await resumeDefaultPagePreinstall(f.options);
    assert.deepEqual(f.calls,[]);
  }
});

test('existing older/local/disabled/unknown installations and uninstalled candidates win over catalog',async()=>{
  for(const row of [{programId:id,revision:1,enabled:false},
    {programId:id,managedCleanup:{state:'unknown'}},
    {programId:id,authorization:{status:'suspended'}}]){
    const f=fixture();f.installed.push(row);
    await resumeDefaultPagePreinstall(f.options);
    assert.deepEqual(f.installed,[row]);
    assert.deepEqual(f.calls,['listPagePrograms']);
  }
  const f=fixture();f.catalog.push({programId:id,installed:null});
  await resumeDefaultPagePreinstall(f.options);
  assert.deepEqual(f.calls,['listPagePrograms']);
});

test('missing website permission or userScripts opt-in never submits installation',async()=>{
  const f=fixture();f.granted=false;
  assert.equal((await resumeDefaultPagePreinstall(f.options)).state,'permission-required');
  assert.equal(f.marker.pageState,'pending');
  f.granted=true;f.native=false;
  await assert.rejects(resumeDefaultPagePreinstall(f.options));
  assert.deepEqual(f.calls,['listPagePrograms','listPagePrograms']);
  assert.equal(f.marker.pageState,'pending');
});

test('unknown import or readback outcome keeps durable fence across later resumes',async()=>{
  for(const key of ['failImport','failReadback']){
    const f=fixture();f[key]=true;
    await assert.rejects(resumeDefaultPagePreinstall(f.options));
    assert.equal(f.marker.pageState,'attention');
    assert.equal((await resumeDefaultPagePreinstall(f.options)).state,'attention');
    assert.equal(f.calls.filter(m=>m==='importPageInstallPackage').length,1);
  }
});


test('only a new trusted install records Page intent, existing profiles keep their choices',async()=>{
  const f=fixture();f.marker=undefined;
  assert.equal((await registerDefaultPreinstall({...f.options,reason:'update'})).state,'not-new-install');
  assert.equal(f.marker,undefined);
  assert.equal((await registerDefaultPreinstall({...f.options,reason:'install'})).state,'pending');
  assert.equal(f.marker.pageState,'pending');
  f.marker.pageState='attention';
  await registerDefaultPreinstall({...f.options,reason:'install'});
  assert.equal(f.marker.pageState,'attention');
});
