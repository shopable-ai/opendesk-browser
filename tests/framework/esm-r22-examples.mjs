// Example-specific assertions for the existing Native/CFT/MCP driver.
// No browser launcher, HTTP server, executor or bundler is defined here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';
import {lockProgramRemote} from '../../scripts/lock-program-remote.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {requestAgent} from '../../native-agent/cli.mjs';
import {decodeValue} from '../../src/platform/page-port/codec.js';
import {MAX_BYTES,requestShape} from '../../native-agent/wire.mjs';

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const REMOTE_ROOT='https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/add.js';
// Test-owned bytes served by an in-process controlled Mock. Never real CDN code.
const REMOTE_B='https://b.example.net/bridge.js',REMOTE_C='https://c.example.org/add.js';
const mockModules=new Map([
  [REMOTE_ROOT,`export {default} from '${REMOTE_B}';`],
  [REMOTE_B,`export {default} from '${REMOTE_C}';`],
  [REMOTE_C,'export default function add(a,b){return a+b;}']
]);

export async function lockMockRemoteExample(project){
  const requests=[],approvals=[];
  const fetchImpl=async url=>{
    assert.ok(mockModules.has(url),'no real network URL is allowed');requests.push(url);
    return new Response(mockModules.get(url),{status:200,headers:{'content-type':'text/javascript'}});
  };
  const review=await lockProgramRemote(project,{fetchImpl});
  assert.equal(review.noNetwork,true);assert.equal(review.noExecution,true);
  assert.deepEqual(review.remoteRoots.map(x=>x.url),[REMOTE_ROOT]);assert.deepEqual(requests,[]);
  await assert.rejects(buildProgramProjectInMemory(project),{code:'E_REMOTE_UNLOCKED'});
  await assert.rejects(lockProgramRemote(project,{approve:review.reviewToken,fetchImpl,
    allowURL:async url=>{approvals.push(url);return url===REMOTE_B;}}),{code:'E_REMOTE_APPROVAL_REQUIRED'});
  assert.deepEqual(approvals,[REMOTE_B,REMOTE_C]);
  assert.equal(fs.existsSync(path.join(project,'opendesk.remote-lock.json')),false);
  approvals.length=0;
  const locked=await lockProgramRemote(project,{approve:review.reviewToken,fetchImpl,
    allowURL:async url=>{approvals.push(url);return [REMOTE_B,REMOTE_C].includes(url);}});
  assert.equal(locked.status,'LOCKED_NOT_EXECUTED');assert.deepEqual(approvals,[REMOTE_B,REMOTE_C]);
  const lock=JSON.parse(fs.readFileSync(path.join(project,'opendesk.remote-lock.json')));
  const cache=Object.entries(lock.modules).map(([url,row])=>{
    const file=path.join(project,'.opendesk/remote-cache',row.sha256+'.mjs'),bytes=fs.readFileSync(file);
    assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);
    return {url,...row};
  });
  assert.equal(cache.length,3);
  return {review,locked,approvals,requests,cache,provenance:'CONTROLLED_MOCK; no CDN download or execution'};
}

export async function prepareEsmExamples({root,workspace,origin,record}){
  const result={};
  for(const name of ['sidebar-page-demo','sidebar-controller-demo','remote-esm-page','page-heading','controller-title','page-npm-lodash']){
    const dir=path.join(workspace,name);fs.cpSync(path.join(root,'examples/programs',name),dir,{recursive:true});
    const pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json'))),originalScope=pkg.opendesk.pageRules||pkg.opendesk.siteOrigins;
    if(pkg.opendesk.runtimeKind==='controller')pkg.opendesk.siteOrigins=[origin];
    if(['remote-esm-page','page-heading','page-npm-lodash'].includes(name))pkg.opendesk.pageRules.matches=[origin+'/*'];
    fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(pkg,null,2)+'\n');
    record('esm.test-copy',{name,path:dir,projectId:pkg.opendesk.id,originalScope,
      authorizedTestScope:pkg.opendesk.pageRules||pkg.opendesk.siteOrigins,source:'existing committed Example'});
    result[name]=dir;
  }
  assert.equal(new URL(origin).port,'43111','Page Example keeps its documented port guard');
  result.remoteProof=await lockMockRemoteExample(result['remote-esm-page']);
  record('esm.remote.mock-lock',result.remoteProof);
  return result;
}

export async function runEsmExamples({projects,project,mcpClient,mcp,until,report,record,target,origin,out,browser,targetTabId,setUserScripts}){
  const proof='#opendesk-multifile-page-proof',message='多文件 Page 程序已运行',edited='多文件 Page R2.2 已运行';
  const readDOM=()=>target.read(`({count:document.querySelectorAll('${proof}').length,text:document.querySelector('${proof}')?.textContent,parent:document.querySelector('${proof}')?.parentElement.id,results:document.querySelector('#results').textContent,searchCount:document.querySelector('#search-count').textContent,title:document.title,heading:document.querySelector('h1').textContent})`);
  const current=async()=>{
    const state=await mcpClient.tool('status');assert.equal(state.connected,true);
    assert.ok(state.target?.registrationId);assert.ok(state.target.target.documentId);
    assert.equal(state.target.target.origin,origin);return state.target;
  };
  const inspectSource=async dir=>{
    const resolver=new LocalDevResolver({allowedPaths:[dir]});
    try{
      const {bindingId}=resolver.attach({path:dir}),first=await resolver.resolve(bindingId);
      assert.equal(sha(first.sourceUtf8),first.sourceHash);
      for(const row of first.files)assert.equal(sha(fs.readFileSync(path.join(dir,row.path))),row.sha256);
      record('esm.source',{projectId:first.projectId,sourceHash:first.sourceHash,inputHash:first.inputHash,
        sourceBytes:first.sourceBytes,files:first.files,cacheHit:first.cacheHit,timings:first.timings});
      return first;
    }finally{resolver.close();}
  };
  const run=async(bindingId,kind,params={},expectedError)=>{
    const selected=await until(current,'stable current Native document'),requestId='esm-r22-'+crypto.randomUUID(),began=performance.now();
    const started=await mcpClient.tool('run',{bindingId,requestId,...(kind==='controller'?{params}: {})});
    assert.equal(started.source.sourceHash,kind==='controller'?started.revision.sourceHash:started.sourceHash);
    assert.equal(started.target.documentId,selected.target.documentId);
    const selector=kind==='controller'?{runId:started.runId}:{previewId:started.previewId};
    const result=await until(async()=>{
      const row=await mcpClient.tool('result',selector);
      return kind==='controller'?row.run.retirementState==='released'&&row.results.length?row:null:
        row.state!=='preview-pending'?row:null;
    },'ESM Example real '+kind+' completion',30000);
    assert.equal(result.sourceHash,started.source.sourceHash);
    if(kind==='controller'){
      assert.equal(result.results.length,1);assert.equal(result.results[0].outcome.ok,!expectedError,JSON.stringify(result.error));
      if(expectedError)assert.equal(result.error.code,expectedError);
      assert.equal(result.results[0].revision.sourceHash,result.sourceHash);
      assert.equal(result.run.resultId,result.results[0].resultId);
    }else{
      assert.equal(result.state,'preview-evaluated',JSON.stringify(result));
      assert.equal(result.result.world,'USER_SCRIPT');assert.equal(result.result.documentId,started.target.documentId);
      assert.equal(result.result.sourceHash,result.sourceHash);
    }
    const elapsedMs=performance.now()-began;
    record('esm.actual-result',{requestId,started,result,elapsedMs});
    report.tests.push({name:'esm-'+started.source.projectId+'-'+requestId,status:'PASS',level:'L4',
      ...selector,requestId,sourceHash:result.sourceHash,inputHash:started.source.inputHash,
      documentId:started.target.documentId,cacheHit:started.source.cacheHit,sourceBytes:started.source.sourceBytes,
      buildTimings:started.source.timings,nativeAdmissionMs:started.timings?.nativeAdmissionMs,elapsedMs});
    return {started,result};
  };
  const assertIdle=async()=>{
    const before=await readDOM();await new Promise(resolve=>setTimeout(resolve,650));
    assert.deepEqual(await readDOM(),before,'saving or reading does not run webpage business');return before;
  };
  const pageDir=projects['sidebar-page-demo'],pageBinding=await mcpClient.tool('attach',{path:pageDir});
  const pageSource=await inspectSource(pageDir);assert.equal(pageSource.files.filter(x=>x.path.endsWith('.js')).length,3);
  const first=await run(pageBinding.bindingId,'page-userscript');
  assert.equal(JSON.parse(first.result.result.resultText).status,'PAGE_DEMO_OK');
  assert.equal(first.result.sourceHash,pageSource.sourceHash);
  assert.equal((await readDOM()).parent,'lab-text');assert.equal((await readDOM()).count,1);
  const repeat=await run(pageBinding.bindingId,'page-userscript');
  assert.notEqual(repeat.started.previewId,first.started.previewId);assert.equal(repeat.result.sourceHash,first.result.sourceHash);
  assert.equal((await readDOM()).count,1);
  const proofFile=path.join(pageDir,'src/proof.js');
  fs.writeFileSync(proofFile,fs.readFileSync(proofFile,'utf8').replace(message,edited));
  await assertIdle();assert.ok((await readDOM()).text.startsWith(message));
  const next=await run(pageBinding.bindingId,'page-userscript');
  assert.notEqual(next.result.sourceHash,first.result.sourceHash);assert.notEqual(next.started.previewId,first.started.previewId);
  const pageDOM=await readDOM();assert.equal(pageDOM.count,1);assert.ok(pageDOM.text.startsWith(edited));
  const original=await mcpClient.tool('result',{previewId:first.started.previewId});
  assert.equal(original.sourceHash,first.result.sourceHash);assert.equal(original.result.resultText,first.result.result.resultText);
  record('esm.page.dom',{pageDOM,originalPreview:first.started.previewId,newPreview:next.started.previewId});
  await target.screenshot('esm-page-proof.png');

  const localBinding=await mcpClient.tool('attach',{path:project});
  const localSource=await inspectSource(project),localFirst=await run(localBinding.bindingId,'controller');
  assert.equal(localFirst.result.sourceHash,localSource.sourceHash);
  assert.equal(localFirst.result.value.version,1);assert.equal(localFirst.result.value.heading,(await readDOM()).heading);
  const extract=path.join(project,'src/extract.js');fs.writeFileSync(extract,fs.readFileSync(extract,'utf8').replace('version:1','version:2'));
  await assertIdle();const localSecond=await run(localBinding.bindingId,'controller');
  assert.equal(localSecond.result.value.version,2);assert.notEqual(localSecond.result.sourceHash,localFirst.result.sourceHash);
  const oldLocal=await mcpClient.tool('result',{runId:localFirst.started.runId});assert.deepEqual(oldLocal.value,localFirst.result.value);
  assert.equal(oldLocal.results[0].resultId,localFirst.result.results[0].resultId);

  // Native input comes from the actual Controller Locator. CDP only prepares
  // the fixture viewport and observes DOM, never fills or submits this form.
  await target.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:500,y:500,deltaX:0,deltaY:1200});
  const controller=await mcpClient.tool('attach',{path:projects['sidebar-controller-demo']});
  const before=await readDOM(),count=Number(before.searchCount.match(/\d+/)[0]);
  const search=await run(controller.bindingId,'controller',{keyword:'OpenDesk R2.2'}),after=await readDOM();
  assert.equal(search.result.value.status,'CONTROLLER_DEMO_OK');assert.equal(search.result.value.keyword,'OpenDesk R2.2');
  assert.equal(after.results,'结果：OpenDesk R2.2');assert.equal(after.searchCount,'提交次数：'+(count+1));
  assert.equal(search.result.value.result,after.results);await assertIdle();
  record('esm.controller.dom',{before,after,result:search.result});await target.screenshot('esm-controller-result.png');

  const remoteBinding=await mcpClient.tool('attach',{path:projects['remote-esm-page']});
  const remote=await run(remoteBinding.bindingId,'page-userscript');
  assert.deepEqual(JSON.parse(remote.result.result.resultText),{value:42,pageTitle:(await readDOM()).title});
  record('esm.remote.chrome',{provenance:'CONTROLLED_MOCK',result:remote.result,lock:projects.remoteProof});

  // An actual lost transport ACK is recovered only with the original identity.
  const lost=mcp([projects['sidebar-controller-demo']],{lostAck:true});
  try{
    await lost.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'esm-lost-ack',version:'1'}});
    lost.notify('notifications/initialized');const binding=await lost.tool('attach',{path:projects['sidebar-controller-demo']});
    const requestId='esm-lost-'+crypto.randomUUID(),previous=await readDOM();
    await assert.rejects(lost.tool('run',{bindingId:binding.bindingId,requestId,params:{keyword:'Unknown ACK'}}),{code:'E_EFFECT_UNKNOWN'});
    const recovered=await until(async()=>{
      const value=await lost.tool('result',{admissionRequestId:requestId});return value.run.retirementState==='released'&&value.results.length?value:null;
    },'original search after actual ACK loss',30000);
    assert.equal(recovered.value.keyword,'Unknown ACK');assert.equal(recovered.results[0].outcome.ok,true);
    assert.equal((await readDOM()).searchCount,'提交次数：'+(Number(previous.searchCount.match(/\d+/)[0])+1));
    await assertIdle();
    assert.equal(fs.readFileSync(path.join(out,'mcp-stderr.log'),'utf8').split('FAULT_NATIVE_DISPATCH '+requestId).length-1,1);
    record('esm.unknown-effect.read-only-recovery',{requestId,recovered,dom:await readDOM(),dispatchCount:1});
    report.tests.push({name:'esm-search-unknown-ACK-no-replay',status:'PASS',level:'L4',requestId,runId:recovered.runId,resultId:recovered.results[0].resultId});
  }finally{lost.close();}

  const searchFile=path.join(projects['sidebar-controller-demo'],'src/search.js'),originalSearch=fs.readFileSync(searchFile,'utf8');
  try{
    fs.writeFileSync(searchFile,'export async function searchFixture(page){return {result:await page.getByLabel("esm-definitely-missing-label",{exact:true}).textContent()};}\n');
    const beforeMissing=await readDOM();
    const missing=await run(controller.bindingId,'controller',{keyword:'No side effect'},'E_SELECTOR_NOT_FOUND');
    assert.deepEqual(await readDOM(),beforeMissing);
    record('esm.controller.locator-error',{result:missing.result,dom:beforeMissing});
  }finally{fs.writeFileSync(searchFile,originalSearch);}
  // Native admission uses the real authenticated Node Host and Chrome RunHost.
  // Padding is inert; the business value proves the exact admitted source ran.
  const wireTarget=await current();
  const envelope=(source,requestId)=>({v:1,kind:'request',method:'run.start',requestId,params:{
    registrationId:wireTarget.registrationId,target:wireTarget.target,
    sourceHash:sha(source),sourceBytes:Buffer.byteLength(source),
    source:{kind:'draft',sourceUtf8:source},params:{proof:'capacity'},deadlineMs:30000}});
  for(const size of [MAX_BYTES-1,MAX_BYTES,MAX_BYTES+1]){
    const requestId='esm-capacity-'+size,base='async function main(){return {status:"WIRE_OK",size:'+size+'};}';
    let source=base+'/*'+'x'.repeat(59000)+'*/';
    const overhead=Buffer.byteLength(JSON.stringify(envelope(source,requestId)))-Buffer.byteLength(source);
    source=base+'/*'+'x'.repeat(size-overhead-Buffer.byteLength(base)-4)+'*/';
    const message=envelope(source,requestId),jsonBytes=Buffer.byteLength(JSON.stringify(message));assert.equal(jsonBytes,size);
    if(size>MAX_BYTES){
      await assert.rejects(requestAgent(message.method,message.params,requestId),error=>{
        assert.equal(error.code,'E_LIMIT');assert.ok(error.message.includes('jsonBytes='+size));return true;
      });
      record('esm.native.capacity',{jsonBytes,requestId,outcome:'NOT_DISPATCHED',transport:'preflight before socket dispatch'});
    }else{
      requestShape(message);const started=await requestAgent(message.method,message.params,requestId);assert.equal(started.error,undefined,JSON.stringify(started));
      const result=await until(async()=>{
        const row=await requestAgent('run.get',{registrationId:wireTarget.registrationId,runId:started.result.runId});
        return row.result?.run?.retirementState==='released'&&row.result.results?.length?row.result:null;
      },'exact-size Native request retirement',30000);
      assert.equal(result.results[0].outcome.ok,true,JSON.stringify(result.error));
      assert.deepEqual(decodeValue(result.results[0].outcome.valueWire),{status:'WIRE_OK',size});assert.equal(result.results[0].revision.sourceHash,message.params.sourceHash);
      record('esm.native.capacity',{jsonBytes,sourceBytes:message.params.sourceBytes,sourceHash:message.params.sourceHash,requestId,started,result,transport:'actual Node Host and Chrome'});
    }
  }
  const smallAfterLimit=await run(localBinding.bindingId,'controller');assert.equal(smallAfterLimit.result.value.version,2);
  report.tests.push({name:'esm-real-Native-run-start-61439-61440-overflow-preflight-and-small-recovery',status:'PASS',level:'L3/L4',limitBytes:MAX_BYTES});
  const previousTarget=await current();await target.call('Page.navigate',{url:origin+'/demo-form.html?esm-navigation=1'});
  await until(async()=>{const state=await current();return state.target.documentId!==previousTarget.target.documentId?state:null;},'fresh document after navigation');
  assert.equal((await readDOM()).count,0);await assertIdle();
  const stale=await requestAgent('page.preview',{registrationId:previousTarget.registrationId,target:previousTarget.target,
    sourceHash:pageSource.sourceHash,sourceBytes:pageSource.sourceBytes,sourceUtf8:pageSource.sourceUtf8,
    entryFormat:pageSource.entryFormat,pageRules:pageSource.pageRules,bindingId:pageBinding.bindingId},'esm-stale-'+crypto.randomUUID());
  assert.equal(stale.error?.code,'E_DOCUMENT_STALE');assert.equal(stale.error.outcome,'NOT_DISPATCHED');assert.equal((await readDOM()).count,0);
  record('esm.navigation.stale-document',{previousTarget,stale,dom:await readDOM()});
  // Reuse the registered, self-contained TOC fixture, including shared servers.
  await target.call('Page.navigate',{url:origin+'/reading-toc-article.html'});
  await until(()=>target.read('document.readyState==="complete"'),'non-target document');
  const skipped=await run(pageBinding.bindingId,'page-userscript');
  assert.equal(JSON.parse(skipped.result.result.resultText).status,'SKIPPED_OUT_OF_SCOPE');
  assert.equal(await target.read(`document.querySelectorAll('${proof}').length`),0);
  await target.call('Page.navigate',{url:origin+'/demo-form.html'});
  await until(()=>target.read('document.readyState==="complete"'),'restore fixture');await browser.call('Target.activateTarget',{targetId:targetTabId});
  await until(current,'restored Native fixture document');
  for(const name of ['page-heading','controller-title','page-npm-lodash']){
    const binding=await mcpClient.tool('attach',{path:projects[name]}),kind=name==='controller-title'?'controller':'page-userscript';
    await inspectSource(projects[name]);const value=await run(binding.bindingId,kind);
    const actual=kind==='controller'?value.result.value:JSON.parse(value.result.result.resultText),dom=await readDOM();
    if(name==='page-heading')assert.deepEqual(actual,{heading:dom.heading,found:true});
    if(name==='controller-title')assert.deepEqual(actual,{title:dom.title});
    if(name==='page-npm-lodash')assert.deepEqual(actual,{text:dom.heading,safeHtml:dom.heading});
    record('esm.additional-example',{name,actual,started:value.started,result:value.result});
  }
  await setUserScripts(false);
  const deniedId='esm-user-scripts-revoked-'+crypto.randomUUID();
  const denied=await mcpClient.tool('run',{bindingId:pageBinding.bindingId,requestId:deniedId});
  const deniedResult=await until(async()=>{
    const row=await mcpClient.tool('result',{previewId:denied.previewId});return row.state!=='preview-pending'?row:null;
  },'USER_SCRIPT revoked result');
  assert.equal(deniedResult.state,'preview-failed');assert.equal(deniedResult.error.code,'E_USER_SCRIPTS_UNAVAILABLE');
  assert.equal((await readDOM()).count,0);await assertIdle();
  record('esm.page.user-scripts-revoked',{requestId:deniedId,started:denied,result:deniedResult,dom:await readDOM()});
  await setUserScripts(true);await assertIdle();
  report.tests.push({name:'esm-USER_SCRIPT-permission-revocation-no-execution-or-replay',status:'PASS',level:'L4',previewId:denied.previewId});
  const detached=await mcpClient.tool('detach',{bindingId:pageBinding.bindingId});assert.equal(detached.connected,false);
  await assert.rejects(mcpClient.tool('run',{bindingId:pageBinding.bindingId,requestId:'esm-detached-'+crypto.randomUUID()}),{code:'E_DEV_DETACHED'});
  assert.equal((await readDOM()).count,0);
  report.tests.push({name:'esm-navigation-old-document-out-of-scope-and-detach',status:'PASS',level:'L4',documentId:previousTarget.target.documentId});
}
