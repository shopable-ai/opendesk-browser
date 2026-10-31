import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {fakeBuiltinSource} from './builtin-support.mjs';
import {createCloudService} from '../../src/cloud-control/service.js';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {createStorageMethods} from '../../src/platform/storage/repository.js';
import {CONTRACT_VERSION,CONTRACT_HASH,digestUtf8} from '../../src/platform/protocol.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {encodeValue as controlEncode} from '../../src/framework/control/value.js';
import {createTaskPackage,TASK_MANIFEST_FORMAT} from '../../src/platform/tasks/contract.js';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';

test('public Controller project schema admits explicit network while rejecting duplicate or unrelated permissions',async()=>{
  const schema=JSON.parse(await readFile(new URL('../../schemas/opendesk-program-project.v1.schema.json',import.meta.url),'utf8'));
  const validate=new Ajv2020({strict:false}).compile(schema);
  const project=JSON.parse(await readFile('examples/programs/controller-title/package.json','utf8'));
  for(const permissions of [['page.automation'],['page.automation','network'],
    ['page.automation','network','storage.persistent'],['page.automation','storage.persistent','network']]){
    project.opendesk.permissions=permissions;assert.equal(validate(project),true,JSON.stringify(validate.errors));
  }
  for(const permissions of [[],['network'],['network','page.automation'],['page.automation','network','network'],
    ['page.automation','cookies'],['page.automation','storage.persistent','network','cookies']]){
    project.opendesk.permissions=permissions;assert.equal(validate(project),false,JSON.stringify(permissions));
  }
});

// Node component fixture adapted from k3-controller-authority; Chrome callbacks are doubles.
function serialStore() {
  let rows = new Map(), tail = Promise.resolve(); const writes = [];
  return {writes, transaction(names, mode, body) {
    const next = tail.then(async () => {
      const copy = structuredClone(rows), changes = [];
      const store = name => { assert.ok(names.includes(name)); if (!copy.has(name)) copy.set(name, new Map()); return copy.get(name); };
      const cursor = (n,{prefix,offset=0,limit=50,direction='next'},keysOnly=false) => {
        const keys=[...store(n).keys()].filter(key=>typeof key==='string'&&key.startsWith(prefix)).sort();
        if(direction==='prev')keys.reverse();
        return keys.slice(offset,offset+limit).map(key=>keysOnly?key:structuredClone(store(n).get(key)));
      };
      const tx = {get: async (n,k) => structuredClone(store(n).get(k)), all: async n => [...store(n).values()].map(v => structuredClone(v)),
        put: async (n,v,k) => { store(n).set(k, structuredClone(v)); changes.push({store:n, key:k, value:structuredClone(v)}); },
        delete: async (n,k) => store(n).delete(k),
        keys: async (n,options) => cursor(n,options,true),
        scan: async (n,options) => cursor(n,options,false)};
      const result = await body(tx); if (mode === 'readwrite') { rows = copy; writes.push(...changes); } return result;
    }); tail = next.catch(() => {}); return next;
  }};
}
const event = () => ({addListener() {}, removeListener() {}});

async function fixture() {
  const storage = serialStore(), calls = [], frames = new Map([[2, [{frameId:0, documentId:'doc-top', documentLifecycle:'active', errorOccurred:false, url:'https://a.example/page'},
    {frameId:7, documentId:'doc-child', url:'https://b.example/frame', parentFrameId:0}]]]);
  const tabs = new Map([[2, {id:2, incognito:false, url:'https://a.example/page'}]]), clock = {now:() => Date.now()};
  let authority, serial = 0, allowed = true, beforeReply;
  const api = {runtime:{id:'extension', getURL:p => `chrome-extension://extension/${p}`,
    getContexts:async(query={})=>[...frames].flatMap(([tabId,values])=>values.filter(f=>f.url.startsWith('chrome-extension:')).map(f=>({tabId,frameId:f.frameId,documentId:f.documentId,documentUrl:f.url})))
      .filter(context => !query.documentIds || query.documentIds.includes(context.documentId))},
    permissions:{contains:async () => allowed},
    tabs:{get:async tabId => { const tab = tabs.get(tabId); if (!tab) throw new Error('No tab with id'); return tab; },
      create:async options => { const id = ++serial + 20; calls.push({method:'create', id}); tabs.set(id,{id,incognito:false,...options});
        frames.set(id,[{frameId:0,documentId:'bootstrap-'+id,url:options.url}]); return tabs.get(id); },
      update:async (id, options) => { calls.push({method:'update',id}); tabs.get(id).url=options.url;
        frames.set(id,[{frameId:0,documentId:'owned-'+id,url:options.url}]); return tabs.get(id); },
      remove:async id => { calls.push({method:'remove',id}); tabs.delete(id); frames.delete(id); },
      sendMessage(id, message, options, callback) {
        calls.push({method:message.action, id, options}); let reply;
        if (message.action === 'ping') reply = {type:message.type, ready:true};
        else if (message.action === 'execute') { const e = message.envelope; beforeReply?.(e); reply = {requestId:e.requestId,
          runId:e.identity.runId, ownerEpoch:e.identity.ownerEpoch, value:controlEncode(e.target.frameId === 7 ? 'Child' : 'Top')}; }
        else reply = {type:message.type, cancelled:true};
        queueMicrotask(() => callback(reply));
      }, onRemoved:event()},
    webNavigation:{getAllFrames({tabId}, callback) { const value=(frames.get(tabId) || []).filter(f=>!f.url.startsWith('chrome-extension:')); if (callback) queueMicrotask(() => callback(value)); return Promise.resolve(value); },
      onCommitted:event(),onCompleted:event(),onDOMContentLoaded:event(),onErrorOccurred:event()},
    userScripts:{getScripts:async()=>[], execute:async options=>{
      calls.push({method:'userScripts.execute',options});
      const frame=frames.get(options.target.tabId).find(f=>options.target.documentIds.includes(f.documentId));
      return [{frameId:frame.frameId,documentId:frame.documentId,
        // Native Chrome serializes page-realm results before broker delivery.
        // Keep the generated wire unchanged while crossing that JSON boundary.
        result:JSON.parse(JSON.stringify(await runInNewContext(options.js[0].code,{TextEncoder,performance,crypto})))}];
    }}, scripting:{executeScript:(_p,cb)=>cb([])}};
  Object.assign(storage,createStorageMethods(storage,{clock}));
  let builtinSource=fakeBuiltinSource;
  authority = createRunAuthority({cloudFactory:createCloudService,loadBuiltin:async()=>builtinSource,storage,api,session:'browser-session',clock});
  const sender = {id:'extension',url:api.runtime.getURL('sidepanel.html'),documentId:'host-doc',frameId:0,
    documentLifecycle:'active',tab:{id:1,incognito:false}};
  const register = async (actual=sender, instance='host-one') => authority.registerHost({hostInstanceId:instance,
    claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},actual);
  frames.set(1,[{frameId:0,documentId:sender.documentId,url:sender.url}]);
  const registration = await register();
  const rows = name => storage.transaction([name],'readonly',tx=>tx.all(name));
  const commit = (sourceUtf8='return params;',expectedRevision=0) => authority.commitControllerScript({scriptId:'script',sourceUtf8,expectedRevision},sender);
  const start = (revision,target={mode:'borrowed',tabId:2,frameId:0,documentId:'doc-top'},extra={}) => authority.startControllerRun({requestId:crypto.randomUUID(),
    scriptId:'script',revision:revision.revision,contentHash:revision.contentHash,paramsWire:encodeValue({no:false,zero:0}),target,deadlineAt:Date.now()+30000,...extra},sender);
  const finish = (run,status='succeeded',extra={}) => authority.finishControllerRun({runId:run.runId,requestId:crypto.randomUUID(),status,
    valueWire:encodeValue(false),workerRetired:true,...extra},sender);
  return {storage,api,authority,sender,registration,register,rows,commit,start,finish,calls,frames,tabs,clock,
    setBuiltin:value=>{builtinSource=value;},setAllowed:value=>{allowed=value;},beforeReply:fn=>{beforeReply=fn;}};
}

// Build the proof through the real component Authority and immutable package
// pipeline. The browser callbacks above are doubles, not native acceptance.
async function installedTaskFixture({permissions=['page.automation'],deadlineMs=60000}={}){
  const f=await fixture(),source='async function main(){return await page.title();}';
  const revision=await f.commit(source),proof=await f.start(revision);
  const operation=(run,kind,method,args=[])=>({requestId:crypto.randomUUID(),identity:run.identity,
    revision:run.revision,target:run.target,operation:{kind,method,args:controlEncode(args)}});
  await f.authority.controllerOperation({envelope:operation(proof,'packaged','title')},f.sender);
  await f.finish(proof);await f.authority.retireControllerTarget({runId:proof.runId},f.sender);
  const manifest={format:TASK_MANIFEST_FORMAT,taskId:'authorization.demo',version:'1.0.0',...(deadlineMs===null?{}:{deadlineMs}),title:'Authorization fixture',
    description:'Program authorization component regression',author:'OpenDesk',source:'fixture',siteOrigins:['https://a.example'],
    permissions,entryFormat:'async-main',program:{revision:1,sourceHash:await digestUtf8(source)},
    paramsSchema:{type:'object',properties:{no:{type:'boolean',title:'No'},zero:{type:'number',title:'Zero'}},required:[],additionalProperties:false}};
  async function installPackage(input,expected){
    const pkg=await createTaskPackage(input,source),base={taskId:input.taskId,version:input.version};
    await f.authority.importTaskPackage({package:pkg},f.sender);
    await f.authority.verifyTaskCandidate({...base,runId:proof.runId},f.sender);
    await f.authority.makeTaskAvailable({...base,manifestHash:pkg.manifestHash},f.sender);
    await f.authority.installTask({...base,manifestHash:pkg.manifestHash,expectedInstalledVersion:expected?.version??null,
      expectedGeneration:expected?.generation??null,expectedInstallationId:expected?.installationId??null},f.sender);
    return f.authority.resolveInstalledTask({taskId:input.taskId},f.sender);
  }
  const resolved=await installPackage(manifest),base={taskId:manifest.taskId,version:manifest.version};
  const startTask=(row=resolved,extra={})=>f.start(row,undefined,{scriptId:row.scriptId,
    expectedTaskGeneration:row.generation,expectedTaskInstallationId:row.installationId,...extra});
  const installClaim=row=>({taskId:row.taskId,version:row.version,expectedGeneration:row.generation,expectedInstallationId:row.installationId});
  return {...f,operation,base,resolved,manifest,installPackage,startTask,installClaim};
}


const axiosMethods=['AXIOS_GET','AXIOS_POST','AXIOS_PUT','AXIOS_DELETE'];
const storageMethods=[['APPSTORAGE_GETITEM',{key:'journal'}],
  ['APPSTORAGE_SETITEM',{key:'journal',value:'saved'}],
  ['APPSTORAGE_REMOVEITEM',{key:'journal'}],['APPSTORAGE_CLEAR',{}]];
const call=(f,run,method,args={url:'https://a.example/api'})=>
  f.authority.controllerOperation({envelope:f.operation(run,'service',method,[args])},f.sender);

// Validate both entry points with real manifests/projects rather than source assertions.
test('Task manifest and local project allow only unique bounded permissions with page.automation first',async t=>{
  const f=await installedTaskFixture(),root=await mkdtemp(join(tmpdir(),'task-network-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  await writeFile(join(root,'src/main.js'),'export default async function main(){return await page.title();}');
  const pkg={name:'task-network',version:'1.0.0',private:true,type:'module',description:'Task network test',
    opendesk:{format:'opendesk.project.v1',id:'task.network-test',runtimeKind:'controller',sourceFormat:'esm',
      entry:'src/main.js',siteOrigins:['https://a.example'],paramsSchema:f.manifest.paramsSchema}};
  for(const permissions of [
    ['page.automation'],['page.automation','storage.persistent'],['page.automation','network'],
    ['page.automation','storage.persistent','network'],['page.automation','network','storage.persistent']
  ]){
    const task=await createTaskPackage({...f.manifest,permissions},'async function main(){return await page.title();}');
    assert.deepEqual(task.manifest.permissions,permissions);
    pkg.opendesk.permissions=permissions;await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    assert.equal((await validateProgramProject(root)).status,'AUTHORING_VALID_NOT_PACKAGED');
  }
  for(const permissions of [[],['network'],['storage.persistent','page.automation'],
    ['network','page.automation'],['page.automation','page.automation'],
    ['page.automation','network','network'],['page.automation','storage.persistent','storage.persistent'],
    ['page.automation','network','storage.persistent','network'],
    ...['cookies','storage.session','tabs','all_sites','network.info'].map(p=>['page.automation',p])]){
    await assert.rejects(createTaskPackage({...f.manifest,permissions},'async function main(){}'),{code:'E_PERMISSION'});
    pkg.opendesk.permissions=permissions;await writeFile(join(root,'package.json'),JSON.stringify(pkg));
    await assert.rejects(validateProgramProject(root),{code:'E_PROJECT_PERMISSION'});
  }
});

test('Tasks without explicit network deny every AXIOS verb before transport',async t=>{
  let fetched=0;t.mock.method(globalThis,'fetch',async()=>{fetched++;return new Response('ok');});
  for(const permissions of [['page.automation'],['page.automation','storage.persistent']]){
    const f=await installedTaskFixture({permissions}),run=await f.startTask();
    for(const method of axiosMethods)await assert.rejects(call(f,run,method),{code:'E_CAPABILITY'});
    assert.equal((await f.rows('commandJournal')).filter(r=>r.tag==='controller-operation'&&r.envelope?.operation.kind==='service').length,0);
  }
  assert.equal(fetched,0);
});

test('explicit network permits all four same-origin verbs while retaining empty networkOrigins and replay deduplication',async t=>{
  const requests=[];t.mock.method(globalThis,'fetch',async(url,options)=>{
    requests.push({url,options});return new Response('{"ok":true}',{headers:{'content-type':'application/json'}});
  });
  const f=await installedTaskFixture({permissions:['page.automation','network']}),run=await f.startTask();
  assert.deepEqual((await f.rows('runs')).find(r=>r.runId===run.runId).networkOrigins,[]);
  assert.deepEqual((await f.rows('runs')).find(r=>r.runId===run.runId).installedTaskAuthorization.authorization.scope.networkOrigins,[]);
  for(const method of axiosMethods){
    const envelope=f.operation(run,'service',method,[{url:'https://a.example/api',...(['AXIOS_POST','AXIOS_PUT'].includes(method)?{data:{value:1}}:{})}]);
    const reply=await f.authority.controllerOperation({envelope},f.sender);
    assert.deepEqual(reply.value,controlEncode({data:{ok:true},status:200,statusText:'',headers:{'content-type':'application/json'},
      config:{method:method.slice(6).toLowerCase(),url:'https://a.example/api'}}));
    assert.deepEqual(await f.authority.controllerOperation({envelope},f.sender),reply);
  }
  assert.deepEqual(requests.map(r=>r.options.method),['GET','POST','PUT','DELETE']);
  assert.ok(requests.every(r=>r.options.credentials==='omit'&&r.options.redirect==='manual'));
});

test('network Task rejects cross-origin requests and additional networkOrigins even with Chrome permission',async t=>{
  let fetched=0;t.mock.method(globalThis,'fetch',async()=>{fetched++;return new Response('ok');});
  for(const method of axiosMethods){
    // A denied dispatched operation fences the run; each verb needs its own admission.
    const f=await installedTaskFixture({permissions:['page.automation','network']}),run=await f.startTask();
    await assert.rejects(call(f,run,method,{url:'https://other.example/api'}),{code:'E_PERMISSION'});
  }
  assert.equal(fetched,0);
  const f=await installedTaskFixture({permissions:['page.automation','network']});
  await assert.rejects(f.startTask(undefined,{networkOrigins:['https://other.example']}),{code:'E_PERMISSION'});
});

test('network does not grant AppStorage, other services or Cookie/browser upload operations',async()=>{
  for(const permissions of [['page.automation','network'],['page.automation','network','storage.persistent']]){
    const f=await installedTaskFixture({permissions}),run=await f.startTask();
    if(!permissions.includes('storage.persistent')){
      for(const [method,args]of storageMethods)await assert.rejects(call(f,run,method,args),{code:'E_CAPABILITY'});
    }else{
      await call(f,run,'APPSTORAGE_SETITEM',{key:'journal',value:'saved'});
      assert.deepEqual((await call(f,run,'APPSTORAGE_GETITEM',{key:'journal'})).value,controlEncode('saved'));
      await call(f,run,'APPSTORAGE_REMOVEITEM',{key:'journal'});await call(f,run,'APPSTORAGE_CLEAR',{});
    }
    for(const [method,args]of [['APPLOCAL_GETITEM',{key:'journal'}],['CHROME_LOCAL_GET',{key:'journal'}]])
      await assert.rejects(call(f,run,method,args),{code:'E_CAPABILITY'});
    for(const [method,args]of [['cookies',[]],['setCookie',[{name:'sid',value:'blocked'}]],['deleteCookie',['sid']],['uploadFromUrl',['https://a.example/file']]])
      await assert.rejects(f.authority.controllerOperation({envelope:f.operation(run,'browser',method,args)},f.sender),{code:'E_CAPABILITY'});
  }
});

test('network rechecks original Authority after site revocation, disable and Stop, including durable replay',async t=>{
  let fetched=0;t.mock.method(globalThis,'fetch',async()=>{fetched++;return new Response('ok');});
  for(const fence of ['site','disable','stop']){
    const f=await installedTaskFixture({permissions:['page.automation','network']}),run=await f.startTask();
    const envelope=f.operation(run,'service','AXIOS_GET',[{url:'https://a.example/api'}]);
    await f.authority.controllerOperation({envelope},f.sender);
    const before=fetched;
    if(fence==='site')f.setAllowed(false);
    else if(fence==='disable')await f.authority.setInstalledTaskEnabled({...f.installClaim(f.resolved),enabled:false},f.sender);
    else await f.authority.stopControllerRun({runId:run.runId,requestId:crypto.randomUUID()},f.sender);
    await assert.rejects(f.authority.controllerOperation({envelope},f.sender));
    for(const method of axiosMethods)await assert.rejects(call(f,run,method));
    assert.equal(fetched,before);
  }
});

test('site revocation during network transport blocks result delivery through original post Authority check',async t=>{
  const f=await installedTaskFixture({permissions:['page.automation','network']}),run=await f.startTask();
  let fetched=0;t.mock.method(globalThis,'fetch',async()=>{fetched++;f.setAllowed(false);return new Response('ok');});
  await assert.rejects(call(f,run,'AXIOS_GET'));
  assert.equal(fetched,1);
});
