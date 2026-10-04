import {createHostClient} from '../../src/platform/host/client.js';
import {createRunHost} from '../../src/run-host.js';
import {createControlController} from '../../src/scripting/sandbox/controller.js';
import {decodeValue} from '../../src/platform/page-port/codec.js';

const events=[],cases=[];
globalThis.__controllerProgress={events,cases};
const base=globalThis.__controllerFixtureBase;
const foundationClient=createHostClient(chrome);
const host=createRunHost({client:foundationClient,controllerFactory:options=>createControlController({...options,
  onEvent:event=>events.push({...event,hostObservedMonoMs:performance.now()})})});
globalThis.__controllerHost=host;
const expect=(condition,message)=>{if(!condition)throw new Error(message);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hold=name=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Observer barrier '+name)),10000);
  globalThis[name]=()=>{clearTimeout(timer);delete globalThis[name];resolve();};});
async function documentTarget(tabId,frameId=0) {
  for(let i=0;i<200;i++) {
    const frames=await chrome.webNavigation.getAllFrames({tabId});const frame=frames?.find(f=>f.frameId===frameId);
    if(frame?.documentId&&frame.url.startsWith(base))return {mode:'borrowed',tabId,frameId,documentId:frame.documentId};
    await sleep(25);
  } throw new Error('No exact native fixture document');
}
let count=0;
async function revision(sourceUtf8,scriptId='native-'+(++count),expectedRevision=0) {
  return host.controller.commitControllerScript({scriptId,expectedRevision,sourceUtf8});
}
async function run(row,{params={},target,deadlineAt=Date.now()+15000}={}) {
  const admission=await host.start({scriptId:row.scriptId,revision:row.revision,contentHash:row.contentHash,params,target,deadlineAt});
  const result=await host.completion;expect(result.result,'No durable result: '+JSON.stringify(result));
  expect(result.retirement.state==='released','Target retirement incomplete');return {admission,result};
}
async function check(id,body) {
  try {const actual=await body();cases.push({id,status:'PASS',actual});}
  catch(error){cases.push({id,status:'FAIL',error:{code:error.code,message:error.message,stack:error.stack}});}
}
(async()=>{
  await host.ready;const tab=await chrome.tabs.create({url:base+'/page',active:false});let target=await documentTarget(tab.id);
  await check('ordinary-js-typed-dom',async()=>{
    const row=await revision('return {title:await page.title(), no:params.no, zero:params.zero, absent:params.absent, list:params.list};');
    const {admission,result}=await run(row,{target,params:{no:false,zero:0,absent:undefined,list:[undefined,null]}});
    const value=decodeValue(result.result.outcome.valueWire);
    expect(value.title==='Top fixture'&&value.no===false&&value.zero===0&&Object.hasOwn(value,'absent')&&value.absent===undefined&&value.list[0]===undefined,'Typed value changed');
    expect(!Object.hasOwn(admission.identity,'templateHash'),'Generic identity has template hash');
    return {runId:admission.runId,state:result.result.state,valueWire:result.result.outcome.valueWire,target:admission.target};
  });
  await check('borrowed-child-exact-document',async()=>{
    let frame;for(let i=0;i<200;i++){frame=(await chrome.webNavigation.getAllFrames({tabId:tab.id}))?.find(f=>f.frameId>0&&f.url===base+'/child');if(frame)break;await sleep(25);}
    expect(frame?.documentId,'Child document missing');
    const child={mode:'borrowed',tabId:tab.id,frameId:frame.frameId,documentId:frame.documentId};
    const {admission,result}=await run(await revision('await page.type("#input",params.text); return {title:await page.title(),text:await page.$eval("#input",e=>e.value)};'),{target:child,params:{text:'子页'}});
    if(!result.result.outcome.ok) {
      expect(result.result.outcome.error.code==='E_USER_SCRIPTS_UNAVAILABLE','Unexpected child failure '+JSON.stringify(result));
      const dom=await run(await revision('return await page.title();'),{target:child});expect(decodeValue(dom.result.result.outcome.valueWire)==='Child fixture','Wrong child selected');
      return {target:admission.target,userScripts:result.result.outcome.error.code,domRun:dom.admission.runId};
    }
    const value=decodeValue(result.result.outcome.valueWire);expect(value.title==='Child fixture'&&value.text==='子页','Cross-frame dispatch');return {target:admission.target,value};
  });
  await check('headcas-r1-pinned-during-r2-save',async()=>{
    const row=await revision('await page.waitForTimeout(300); return params;','pin-race');
    const admission=await host.start({scriptId:row.scriptId,revision:row.revision,contentHash:row.contentHash,params:false,target});
    const next=await revision('return "r2";',row.scriptId,1),result=await host.completion;
    expect(result.result.outcome.ok&&decodeValue(result.result.outcome.valueWire)===false,'Pinned r1 changed');
    expect(admission.revision.sourceHash===row.contentHash&&next.revision===2,'Pin/head wrong');
    let conflict;try{await revision('return 0;',row.scriptId,1);}catch(error){conflict=error.code;}expect(conflict==='E_REVISION','Missing head CAS');
    return {runId:admission.runId,pin:admission.revision,head:next.revision,conflict};
  });
  await check('owned-navigation-handoff-old-element-fenced',async()=>{
    const row=await revision('const old=await page.waitForSelector("#button"); await page.goto(params.url,{timeout:5000,waitUntil:"complete"}); let code;try{await old.click();}catch(error){code=error.code;}return {title:await page.title(),code};');
    const {admission,result}=await run(row,{target:{mode:'owned',url:base+'/page'},params:{url:base+'/next'}});
    expect(result.result.outcome.ok,'Navigation failed '+JSON.stringify(result.result.outcome));
    const value=decodeValue(result.result.outcome.valueWire);expect(value.title==='Next fixture'&&value.code==='E_DOCUMENT_REPLACED','Root/old element differs');
    let absent=false;try{await chrome.tabs.get(admission.target.tabId);}catch{absent=true;}expect(absent,'Owned tab remains');
    return {runId:admission.runId,originalTarget:admission.target,value,ownedAbsent:absent};
  });
  await check('throw-durable-once',async()=>{
    const {admission,result}=await run(await revision('throw new Error("native boom");'),{target});
    expect(result.result.state==='failed'&&result.result.outcome.error.message==='native boom','Throw changed');
    const snapshot=await host.controller.snapshotControllerRun({runId:admission.runId});expect(snapshot.results.length===1&&snapshot.slotAvailable,'Throw settle duplicated');
    return {runId:admission.runId,result:result.result};
  });
  await check('busy-worker-stop-durable-then-retire',async()=>{
    globalThis.__controllerProbe={stage:'armbusy'};await hold('__controllerArm');
    const row=await revision('while(true) {}');
    const admission=await host.start({scriptId:row.scriptId,revision:row.revision,contentHash:row.contentHash,params:{},target,deadlineAt:Date.now()+20000});
    for(let i=0;i<200&&!events.some(e=>e.kind==='bound'&&e.runId===admission.runId);i++)await sleep(25);
    const bound=events.find(e=>e.kind==='bound'&&e.runId===admission.runId);expect(bound,'Worker never bound');await sleep(100);
    globalThis.__controllerProbe={stage:'busy',runId:admission.runId,bound,hostMonoMs:performance.now()};
    for(let i=0;i<600&&!globalThis.__controllerStop;i++)await sleep(25);expect(globalThis.__controllerStop,'External observation did not request stop');
    const trigger={at:Date.now(),monoMs:performance.now()};await host.stop({runId:admission.runId});
    const result=await host.completion;expect(result.result.state==='stopped'&&result.retirement.state==='released','Busy result not durable/released');
    const retired=events.find(e=>e.kind==='retired'&&e.runId===admission.runId);expect(retired,'Physical Worker cleanup acknowledgement missing');
    const snapshot=await host.controller.snapshotControllerRun({runId:admission.runId});expect(snapshot.results.length===1&&snapshot.slotAvailable,'Busy settled more than once');
    globalThis.__controllerProbe={...globalThis.__controllerProbe,stage:'stopped',trigger,result,retired,hostMonoMs:performance.now()};
    await hold('__controllerContinueRun');
    return {runId:admission.runId,trigger,retired,result};
  });
  await check('deadline-forces-worker-stop',async()=>{
    const {admission,result}=await run(await revision('while(true) {}'),{target,deadlineAt:Date.now()+1200});
    expect(result.result.state==='stopped'&&result.result.outcome.error.code==='E_TIMEOUT','Deadline result differs');
    expect(events.some(e=>e.kind==='retired'&&e.runId===admission.runId),'Deadline Worker not retired');return {runId:admission.runId,result};
  });
  await check('borrowed-tab-survives-all-retirements',async()=>{const borrowed=await chrome.tabs.get(tab.id);expect(borrowed.id===tab.id,'Borrowed closed');return {tabId:tab.id};});
  await chrome.tabs.remove(tab.id);host.dispose();foundationClient.dispose();
  globalThis.__k3ControllerReport={cases,events,summary:{PASS:cases.filter(c=>c.status==='PASS').length,FAIL:cases.filter(c=>c.status==='FAIL').length},finalProductPassed:false};
})().catch(error=>{globalThis.__k3ControllerReport={cases,events,error:{code:error.code,message:error.message,stack:error.stack},summary:{PASS:0,FAIL:1},finalProductPassed:false};});
