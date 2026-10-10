import {createHostClient} from '../../src/platform/host/client.js';
import {createRunHost} from '../../src/run-host.js';
import {decodeValue} from '../../src/platform/page-port/codec.js';

// Runs in a real MV3 extension page, not a mock DOM or remote Node.js process.
const base=globalThis.__pageContentFixtureBase,expectedChars=globalThis.__pageContentExpectedChars;
const networkOrigin=globalThis.__pageContentNetworkOrigin;
const pageProof=globalThis.__pageContentPageProof===true;
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
async function run(source,target,options={}){
  const revision=await host.controller.commitControllerScript({scriptId:'native-content-'+(++sequence),expectedRevision:0,sourceUtf8:source});
  const admitted=await host.start({scriptId:revision.scriptId,revision:revision.revision,contentHash:revision.contentHash,
    params:{},target,deadlineAt:Date.now()+30000,...options});
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
    await check('r13-real-chrome-staged-locator-form',async()=>{
      const source=`async function main(){
        const scope=page.locator('#r13-form');
        const observation=await page.observe({root:'#r13-form',maxDepth:4,maxNodes:25,maxChars:3500});
        const keyword=scope.getByPlaceholder('输入关键词',{exact:true});
        await keyword.fill('OpenDesk',{timeout:3000});
        const typed=await keyword.inputValue();
        const checkbox=scope.locator('#r13-consent');
        await checkbox.check({timeout:3000});
        const checked=await checkbox.isChecked();
        await checkbox.uncheck({timeout:3000});
        const unchecked=await checkbox.isChecked();
        await scope.locator('#r13-region').selectOption('b',{timeout:3000});
        const region=await scope.locator('#r13-region').inputValue();
        const buttons=scope.getByRole('button',{name:'搜索',exact:true});
        const count=await buttons.count();
        await buttons.first().click({timeout:3000});
        return {typed,checked,unchecked,region,count,answer:await scope.locator('#r13-out').innerText(),
          clicks:await scope.locator('#r13-out').getAttribute('data-clicks'),
          icon:await page.getByAltText('R13图标',{exact:true}).count(),
          observed:observation.nodes.length,version:page.modernCapabilities.version};
      }`;
      const result=await run(source,target);
      assert(result.outcome?.ok===true,'R13 form failed '+JSON.stringify(result.outcome?.error));
      const value=decodeValue(result.outcome.valueWire);
      assert(value.typed==='OpenDesk'&&value.checked===true&&value.unchecked===false&&
        value.region==='b'&&value.count===2&&value.answer==='RESULT:OpenDesk'&&
        value.clicks==='1'&&value.icon===1&&value.observed>0&&value.version==='1.1.0-r13',
        'R13 real DOM data mismatch '+JSON.stringify(value));
      return {...value,runId:result.runId};
    });
    await check('r13-real-chrome-duplicate-refusal',async()=>{
      const source=`async function main(){
        try {await page.locator('#r13-form').getByRole('button',{name:'搜索',exact:true}).click({timeout:300});return 'INCORRECT_CLICK';}
        catch(e){return e.code;}
      }`;
      const result=await run(source,target);
      assert(result.outcome?.ok===true,'R13 strict rejection did not settle '+JSON.stringify(result.outcome?.error));
      const code=decodeValue(result.outcome.valueWire);
      assert(code==='E_STRICT_MODE_VIOLATION','R13 duplicate target not rejected: '+code);
      return {code,runId:result.runId};
    });
    await check('reject-nonstandard-page-content-options',async()=>{
      const result=await run('async function main(){try{await page.content({maxChars:100});return "unexpected";}catch(e){return e.code;}}',target);
      assert(result.outcome?.ok===true,'Invalid options verification failed');
      const value=decodeValue(result.outcome.valueWire);
      assert(value==='E_OPTION_UNSUPPORTED','Invalid options not rejected: '+value);
      return value;
    });
    await check('controller-default-builtins-without-import',async()=>{
      const script="async function main(){return {words:_.words('OpenDesk Browser'),today:dayjs('2026-10-10').format('YYYY-MM-DD'),catalog:typeof OpenDeskLibs,abi:OpenDeskLibs.abi};}";
      const result=await run(script,target);
      assert(result.outcome?.ok===true,'Controller builtin run failed '+JSON.stringify(result.outcome?.error));
      const value=decodeValue(result.outcome.valueWire);
      assert(value.words?.join(' ')==='Open Desk Browser'&&value.today==='2026-10-10'&&
        value.catalog==='object'&&value.abi?.startsWith('opendesk-builtins.v1'),
        'Controller builtin globals absent in real opaque Worker '+JSON.stringify(value));
      return {...value,runId:result.runId,resultId:result.resultId};
    });
    await check('controller-denies-undeclared-cross-origin',async()=>{
      const source="async function main(){await axiosx.get("+JSON.stringify(networkOrigin+'/api/get?source=blocked')+");}";
      const result=await run(source,target);
      assert(result.outcome?.ok===false&&result.outcome.error?.code==='E_PERMISSION',
        'Controller must fail closed before cross-origin HTTP '+JSON.stringify(result.outcome));
      return {errorCode:result.outcome.error.code,runId:result.runId};
    });
    await check('controller-authorized-axiosx-real-cross-origin-get',async()=>{
      const source="async function main(){const r=await axiosx.get("+JSON.stringify(networkOrigin+'/api/get?source=opendesk')+
        ",{timeout:8000,responseType:'json'});return {status:r.status,data:r.data};}";
      const result=await run(source,target,{networkOrigins:[networkOrigin]});
      assert(result.outcome?.ok===true,'Authorized GET failed '+JSON.stringify(result.outcome?.error));
      const value=decodeValue(result.outcome.valueWire);
      assert(value.status===200&&value.data?.path==='/api/get'&&value.data?.source==='opendesk'&&
        value.data?.cookie===null,'GET must be a real typed network response '+JSON.stringify(value));
      return {...value,runId:result.runId,resultId:result.resultId};
    });
    await check('controller-authorized-axiosx-real-cross-origin-post',async()=>{
      const source="async function main(){const r=await axiosx.post("+JSON.stringify(networkOrigin+'/api/post')+
        ",{marker:'OpenDesk',n:1},{timeout:8000,responseType:'json'});return {status:r.status,data:r.data};}";
      const result=await run(source,target,{networkOrigins:[networkOrigin]});
      assert(result.outcome?.ok===true,'Authorized POST failed '+JSON.stringify(result.outcome?.error));
      const value=decodeValue(result.outcome.valueWire);
      assert(value.status===200&&value.data?.method==='POST'&&value.data?.data?.marker==='OpenDesk'&&
        value.data?.data?.n===1&&value.data?.cookie===null,'POST did not reach real second HTTP listener '+JSON.stringify(value));
      return {...value,runId:result.runId,resultId:result.resultId};
    });
    await check('controller-cross-origin-429-500-preserve-real-HTTP-cause',async()=>{
      const source="async function main(){const out=[];for(const status of [429,500]){try{await axiosx.get("+
        JSON.stringify(networkOrigin)+
        "+'/api/status/'+status,{timeout:8000,responseType:'json'});out.push({unexpectedSuccess:status});}catch(e){out.push({code:e.code,status:e.cause?.status,bodyStatus:e.cause?.response?.data?.status});}}return out;}";
      const result=await run(source,target,{networkOrigins:[networkOrigin]});
      assert(result.outcome?.ok===true,'HTTP error projection failed '+JSON.stringify(result.outcome?.error));
      const value=decodeValue(result.outcome.valueWire);
      assert(value.length===2&&value[0].code==='E_HTTP'&&value[0].status===429&&value[0].bodyStatus===429&&
        value[1].code==='E_HTTP'&&value[1].status===500&&value[1].bodyStatus===500,
        'Native HTTP negative status/cause was lost '+JSON.stringify(value));
      return {errors:value,runId:result.runId,resultId:result.resultId};
    });
    if(pageProof)await check('page-user-script-native-builtins-and-main-isolation',async()=>{
      // Preview runs through the public installed extension host/Broker and
      // exact document-bound Chrome userScripts.execute, not a synthetic vm.
      await chrome.tabs.update(tab.id,{active:true});
      const current=await chrome.tabs.get(tab.id);
      const source="async function main(){return {title:document.title,words:_.words('hello world'),date:dayjs('2026-10-10').format('YYYY-MM-DD'),catalog:OpenDeskLibs.abi};}";
      const result=await client.request('previewPageScript',{sourceUtf8:source,entryFormat:'async-main',
        target:{tabId:tab.id,frameId:0,documentId:target.documentId,
          expectedUrl:base+'/large',expectedWindowId:current.windowId}});
      assert(result?.state==='preview-evaluated'&&result.world==='USER_SCRIPT'&&
        result.documentId===target.documentId,'Native Page broker receipt mismatch '+JSON.stringify(result));
      const value=JSON.parse(result.resultText);
      assert(value.title==='Native HTML content'&&value.words?.join(' ')==='hello world'&&
        value.date==='2026-10-10'&&value.catalog?.startsWith('opendesk-builtins.v1'),
        'Page default libraries did not execute in USER_SCRIPT '+JSON.stringify(value));
      const [main]=await chrome.scripting.executeScript({
        target:{tabId:tab.id,documentIds:[target.documentId]},world:'MAIN',
        func:()=>({lodash:window._?.siteValue,dayjs:window.dayjs?.siteValue})});
      assert(main?.documentId===target.documentId&&main.result?.lodash==='original'&&
        main.result?.dayjs==='original','USER_SCRIPT builtins modified website MAIN');
      return {world:result.world,worldId:result.worldId,documentId:result.documentId,
        sourceHash:result.sourceHash,builtinAbi:result.builtinAbi,builtinBundleSha256:result.builtinBundleSha256,
        returned:value,websiteGlobalsUntouched:main.result};
    });
  }finally{await chrome.tabs.remove(tab.id);host.dispose();client.dispose();}
  globalThis.__pageContentNativeReport={state:'finished',cases,passed:cases.length===(pageProof?13:12)&&cases.every(row=>row.ok)};
})().catch(e=>{host.dispose();client.dispose();globalThis.__pageContentNativeReport={state:'finished',cases,passed:false,
  fatal:{code:e.code,message:e.message,stack:e.stack?.slice(0,1000)}};});
