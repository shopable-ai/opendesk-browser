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
    await check('playwright-standard-content',async()=>{
      const source='async function main(){const html=await page.content();return {title:await page.title(),url:await page.url(),length:html.length,hasDoctype:html.startsWith("<!DOCTYPE html>"),hasHtml:html.includes("<html"),containsBody:html.includes("<div>中😀</div>")};}';
      const result=await run(source,target);
      assert(result.outcome?.ok===true,'HTML read failed '+JSON.stringify(result.outcome?.error));
      const value=decodeValue(result.outcome.valueWire);
      assert(value.hasDoctype&&value.hasHtml&&value.containsBody&&value.length>expectedChars,
        'Full Playwright HTML document missing');
      return value;
    });
    await check('playwright-user-code-can-process-large-content',async()=>{
      const source='async function main(){const html=await page.content();return {first:html.slice(0,15),last:html.slice(-13),size:html.length,divs:html.split("<div>").length-1};}';
      const result=await run(source,target);
      assert(result.outcome?.ok===true,'Processing large HTML failed '+JSON.stringify(result.outcome?.error));
      const value=decodeValue(result.outcome.valueWire);
      assert(value.size>expectedChars&&value.divs===9000,'DOM markup changed');
      return value;
    });
    await check('complete-HTML-is-ordinary-return-value-when-under-result-budget',async()=>{
      const source='async function main(){return {html:await page.content(),value:0};}';
      const result=await run(source,target);
      assert(result.outcome?.ok===true,'Large returned HTML failed: '+JSON.stringify(result.outcome?.error));
      const value=decodeValue(result.outcome.valueWire);
      assert(value.html.startsWith('<!DOCTYPE html>')&&value.html.includes('<div>中😀</div>')&&value.value===0,
        'Returned HTML was clipped or had a different type');
      return {htmlLength:value.html.length,preserved:true};
    });
    await check('oversized-business-result-fails-clearly-not-as-unknown',async()=>{
      const result=await run('async function main(){return "X".repeat(400000);}',target);
      assert(result.state==='failed'&&result.outcome?.error?.code==='E_RESULT_TOO_LARGE',
        'Expected durable size error: '+JSON.stringify(result.outcome));
      return {code:result.outcome.error.code};
    });
    await check('reject-nonstandard-page-content-options',async()=>{
      const result=await run('async function main(){try{await page.content({maxChars:100});return "unexpected";}catch(e){return e.code;}}',target);
      assert(result.outcome?.ok===true,'Invalid options verification failed');
      const value=decodeValue(result.outcome.valueWire);
      assert(value==='E_OPTION_UNSUPPORTED','Invalid options not rejected: '+value);
      return value;
    });
  }finally{await chrome.tabs.remove(tab.id);host.dispose();client.dispose();}
  globalThis.__pageContentNativeReport={state:'finished',cases,passed:cases.length===5&&cases.every(row=>row.ok)};
})().catch(e=>{host.dispose();client.dispose();globalThis.__pageContentNativeReport={state:'finished',cases,passed:false,
  fatal:{code:e.code,message:e.message,stack:e.stack?.slice(0,1000)}};});
