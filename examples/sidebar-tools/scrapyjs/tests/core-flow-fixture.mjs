import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';

// Only the host transport and DOM are fixtures. Bundle the current Controller
// in memory so its global page/params use an isolated realm for every run.
const tool=new URL('../',import.meta.url);
const controller=await build({entryPoints:[fileURLToPath(new URL('controller/main.js',tool))],
  bundle:true,write:false,platform:'browser',format:'iife',globalName:'CoreController',logLevel:'silent'});
const modelSources=await Promise.all(['src/app-model.js','adapters/app-sdk.js'].map(path=>readFile(new URL(path,tool),'utf8')));
const config=JSON.parse(await readFile(new URL('tool.config.json',tool),'utf8'));
export const fixtureOrigin='http://127.0.0.1:43111';
export const fixtureBase=fixtureOrigin+'/scrapyjs-fixtures/';
export const plain=value=>JSON.parse(JSON.stringify(value));
export async function createCoreFlow({initialConfig}){
  let url=initialConfig.url,document,realm,documentId=0,storage={value:{schemaVersion:1,selectedId:'original',
    records:[{id:'original',name:'原配置',config:plain(initialConfig)}]},etag:'0'};
  const calls=[],downloads=[],runs=new Map();
  const page={url:async()=>url,content:async()=>document.toString(),goto:async target=>{
    const parsed=new URL(target),name=parsed.pathname.split('/').pop();
    assert.equal(parsed.origin,fixtureOrigin,'fixture must never access a remote origin');
    assert.equal(parsed.pathname,'/scrapyjs-fixtures/'+name);
    assert.equal(name,'core-records.html','fixture document must be explicitly owned');
    const html=await readFile(new URL('fixtures/'+name,tool),'utf8');
    ({document}=parseHTML(html));url=parsed.href;documentId++;
    Object.defineProperty(document,'baseURI',{value:url});
    realm=vm.createContext({document,location:{href:url},performance:{timeOrigin:documentId},
      getComputedStyle:node=>({display:node.style.display||'block',visibility:'visible',pointerEvents:'auto'})});
  },evaluate:async(callback,...args)=>{
    realm.args=plain(args);
    const result=await vm.runInContext('('+callback.toString()+')(...args)',realm);
    return result===undefined?undefined:plain(result);
  },locator:selector=>{
    const nodes=()=>[...document.querySelectorAll(selector)];
    const one=()=>{const found=nodes();assert.equal(found.length,1,'strict fixture locator: '+selector);return found[0];};
    return {count:async()=>nodes().length,getAttribute:async name=>one().getAttribute(name),
      click:async()=>{throw Error('Static core fixture has no button pagination');},
      first:()=>({waitFor:async({state})=>{assert.equal(state,'attached');assert.ok(nodes().length,'missing readiness selector: '+selector);}})};
  }};
  await page.goto(initialConfig.url);
  const task={...config.delegatedTasks[0],installationId:'00000000-0000-4000-8000-000000000001',generation:1};
  async function request(operation,payload){
    calls.push({operation,payload:structuredClone(payload)});
    if(operation==='storage.get'){
      if(['local-runner-state','ai-pending-request'].includes(payload.key))return {value:null,etag:'0'};
      assert.equal(payload.key,'capture-config');return structuredClone(storage);
    }
    if(operation==='storage.set'){
      assert.equal(payload.key,'capture-config');
      if(payload.ifMatch!==storage.etag)throw Object.assign(Error('E_STORAGE_CONFLICT'),{code:'E_STORAGE_CONFLICT'});
      storage={value:structuredClone(payload.value),etag:String(Number(storage.etag)+1)};return {saved:true};
    }
    if(operation==='currentPage.info')return {status:'available',url,title:'确定性核心链网页'};
    if(operation==='ai.info')throw Error('No Provider configured in UI core fixture');
    if(operation==='tasks.read'){
      if(payload.taskId){assert.equal(payload.taskId,task.taskId);return {task:structuredClone(task)};}
      assert.ok(runs.has(payload.clientRequestId),'read must retain the original request identity');
      return structuredClone(runs.get(payload.clientRequestId));
    }
    if(operation==='tasks.start'){
      assert.deepEqual(payload.task,task);
      assert.equal(runs.has(payload.clientRequestId),false,'an uncertain request cannot be replayed');
      const logs=[];
      const scope=vm.createContext({page,params:structuredClone(payload.params),URL,TextEncoder,TextDecoder,
        setTimeout,clearTimeout,console:Object.fromEntries(['log','warn','error','info','debug'].map(key=>[key,(...args)=>logs.push(args)]))});
      vm.runInContext(controller.outputFiles[0].text,scope);
      const value=plain(await vm.runInContext('CoreController.default()',scope));
      const receipt={clientRequestId:payload.clientRequestId,runId:'fixture-run-'+(runs.size+1),
        state:'completed',retirementState:'released',value};
      runs.set(payload.clientRequestId,receipt);
      return structuredClone(receipt);
    }
    if(operation==='browser.downloads.text'){
      downloads.push(structuredClone(payload));return {started:true,downloadId:downloads.length};
    }
    throw Error('No live AI, browser, Native or other transport allowed: '+operation);
  }
  const scope=vm.createContext({URL,TextEncoder,crypto:globalThis.crypto});
  for(const source of modelSources)vm.runInContext(source,scope);
  return {request,appModel:scope.ScrapyAppModel,appSdk:scope.ScrapyAppSdk,calls,downloads,runs,
    get storage(){return structuredClone(storage);}};
}
