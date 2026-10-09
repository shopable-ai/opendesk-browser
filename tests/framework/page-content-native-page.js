import {createHostClient} from '../../src/platform/host/client.js';
import {createRunHost} from '../../src/run-host.js';
import {decodeValue} from '../../src/platform/page-port/codec.js';

// Runs in a real MV3 extension page, not a mock DOM or remote Node.js process.
const base=globalThis.__pageContentFixtureBase,expectedChars=globalThis.__pageContentExpectedChars;
const cases=[];globalThis.__pageContentNativeReport={state:'running',cases};
const client=createHostClient(chrome),host=createRunHost({client});
const assert=(yes,message)=>{if(!yes)throw new Error(message);};
let sequence=0;
async function targetFor(tabId){
  for(let n=0;n<250;n++){
    const frames=await chrome.webNavigation.getAllFrames({tabId});
    const frame=frames?.find(row=>row.frameId===0&&row.url===base+'/large');
    if(frame?.documentId)return {mode:'borrowed',tabId,frameId:0,documentId:frame.documentId};
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  throw new Error('No exact document');
}
async function run(source,target){
  const revision=await host.controller.commitControllerScript({scriptId:'native-content-'+(++sequence),expectedRevision:0,sourceUtf8:source});
  const admitted=await host.start({scriptId:revision.scriptId,revision:revision.revision,contentHash:revision.contentHash,
    params:{},target,deadlineAt:Date.now()+30000});
  const finished=await host.completion;
  assert(finished.result?.runId===admitted.runId,'Durable result identity mismatch');
  assert(finished.retirement?.state==='released','Worker not retired');
  return finished.result;
}
async function check(name,fn){try{cases.push({name,ok:true,value:await fn()});}
  catch(e){cases.push({name,ok:false,error:{code:e.code,message:e.message}});}}
(async()=>{
  await host.ready;
  const tab=await chrome.tabs.create({url:base+'/large',active:false});
  try{
    const target=await targetFor(tab.id);
    await check('oversized-legacy-content',async()=>{
      const result=await run('async function main(){return await page.content();}',target);
      assert(result.state==='failed'&&result.outcome?.error?.code==='E_PAGE_CONTENT_TOO_LARGE',
        'Unexpected legacy result '+JSON.stringify(result.outcome));
      return {errorCode:result.outcome.error.code};
    });
    await check('bounded-preview',async()=>{
      const result=await run('async function main(){const html=await page.content({maxChars:4000});return {size:html.length,first:html.slice(0,5)};}',target);
      assert(result.outcome?.ok===true,'Preview failed '+JSON.stringify(result.outcome?.error));
      const value=decodeValue(result.outcome.valueWire);
      assert(value.size>=3999&&value.size<=4000&&value.first==='<div>','Bounded HTML changed');
      return value;
    });
    await check('complete-snapshot-chunks',async()=>{
      const source='async function main(){let chunks=0,chars=0,first="",last="";for await(const html of page.contentChunks()){chunks++;chars+=html.length;if(chunks===1)first=html.slice(0,5);last=html.slice(-6);}return {chunks,chars,first,last};}';
      const result=await run(source,target);
      assert(result.outcome?.ok===true,'Streaming failed '+JSON.stringify(result.outcome?.error));
      const value=decodeValue(result.outcome.valueWire);
      assert(value.chunks>1&&value.chars===expectedChars&&value.first==='<div>'&&value.last==='</div>',
        'Snapshot integrity changed: '+JSON.stringify(value));
      return value;
    });
  }finally{await chrome.tabs.remove(tab.id);host.dispose();client.dispose();}
  globalThis.__pageContentNativeReport={state:'finished',cases,passed:cases.length===3&&cases.every(row=>row.ok)};
})().catch(e=>{host.dispose();client.dispose();globalThis.__pageContentNativeReport={state:'finished',cases,passed:false,
  fatal:{code:e.code,message:e.message,stack:e.stack?.slice(0,1000)}};});
