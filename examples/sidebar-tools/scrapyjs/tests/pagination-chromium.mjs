// Explicit opt-in: node examples/sidebar-tools/scrapyjs/tests/pagination-chromium.mjs
// Real browser component evidence only; Playwright is not OpenDesk Authority.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {runCapture} from '../controller/capture.js';
import {verifyTaskPackage} from '../../../../src/platform/tasks/contract.js';

const base='http://127.0.0.1:43111/scrapyjs-fixtures/';
const names=['1','2','empty'].map(id=>`pagination-batches-${id}.html`);
const urls=names.map(name=>base+name);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const config={url:urls[0],itemConfig:{_listContainer:'#rows',_listItem:'article',id:'.id::text',title:'h1::text'},
  nextPageSelector:'a.next',waitForSelector:'.page-ready',timeoutMs:3000,maxPages:5};
const expected=[{id:'A',title:'第一页'},{id:'B',title:'首批'},{id:'C',title:'第二批'}];
const report={evidenceLayer:'real-headless-Chromium component: runCapture + frozen Task VM; Playwright page adapter',
  NOT_TESTED:['OpenDesk Authority','OpenDesk Stop','native installation','real extension runtime'],
  browserVersion:null,task:null,fixtures:[],scenarios:[],passed:false};

async function execute(kind,page){
  if(kind==='source')return runCapture(config,page);
  const {url,itemConfig,waitForSelector,timeoutMs,...options}=config;
  const scope=vm.createContext({page,params:{url,configJson:JSON.stringify(itemConfig),waitForSelector,timeoutMs,
    optionsJson:JSON.stringify(options)},URL,setTimeout,clearTimeout,console,TextEncoder,TextDecoder,
    axiosx:undefined,AppStorage:undefined,AppLocal:undefined,storage:undefined});
  vm.runInContext(task.sourceUtf8,scope,{timeout:5000});
  return JSON.parse(JSON.stringify(await vm.runInContext('main()',scope,{timeout:5000})));
}

let task;
async function scenario(browser,kind,mode){
  const context=await browser.newContext({serviceWorkers:'block'});
  const page=await context.newPage();
  const entry={kind,scenario:mode,result:null,data:null,pages:[],navigation:{requests:0,documents:0,clicks:0,initialGotoExcluded:true},error:null};
  report.scenarios.push(entry);
  let measuring=false;
  page.on('request',request=>{
    if(measuring&&request.isNavigationRequest()&&request.frame()===page.mainFrame())entry.navigation.requests++;
  });
  page.on('framenavigated',frame=>{
    if(measuring&&frame===page.mainFrame())entry.navigation.documents++;
  });
  await page.exposeBinding('__paginationClick',()=>{if(measuring)entry.navigation.clicks++;});
  await page.addInitScript(()=>{
    window.__paginationBatches=[];
    let last='';
    const sample=()=>{
      const ids=[...document.querySelectorAll('#rows article .id')].map(node=>node.textContent);
      const key=JSON.stringify(ids);
      if(key!==last){last=key;window.__paginationBatches.push({ids,at:performance.now()});}
    };
    new MutationObserver(sample).observe(document,{childList:true,subtree:true});
    document.addEventListener('click',()=>{void window.__paginationClick();},true);
  });
  const snapshot=()=>page.evaluate(()=>({url:location.href,timeOrigin:performance.timeOrigin,
    ready:!!document.querySelector('.page-ready'),
    data:[...document.querySelectorAll('#rows article')].map(node=>({id:node.querySelector('.id').textContent,title:node.querySelector('h1').textContent})),
    batches:window.__paginationBatches}));
  try{
    await page.goto(urls[0],{waitUntil:'domcontentloaded',timeout:5000});
    if(mode!=='complete')await page.evaluate(mode=>{
      const next=document.querySelector('a.next');
      if(mode==='button')next.removeAttribute('href');
      else if(mode==='hash')next.setAttribute('href','#more');
      else if(mode==='duplicate')document.body.appendChild(next.cloneNode(true));
      else next.setAttribute('href','https://example.invalid/');
    },mode);
    measuring=true;
    // Explicit facade preserves Playwright method receivers and records outgoing documents.
    const adapter={url:async()=>page.url(),content:()=>page.content(),locator:selector=>page.locator(selector),
      // OpenDesk's page API accepts variadic JSON arguments; Playwright accepts
      // one. Serialize the same callback/arguments for this local test facade.
      evaluate:(callback,...args)=>page.evaluate('('+callback.toString()+')(...'+JSON.stringify(args)+')'),
      goto:async(target,options)=>{entry.pages.push(await snapshot());return page.goto(target,options);}};
    let result;
    try{result=await execute(kind,adapter);}
    catch(error){entry.error={code:error.code??null,message:error.message};}
    entry.pages.push(await snapshot());
    if(result){entry.result={engine:result.engine,stats:result.stats};entry.data=result.data;}
    if(mode==='complete'){
      assert.equal(entry.error,null);
      assert.deepEqual(result.data,expected);
      assert.equal(result.stats.pageCount,3);
      assert.equal(result.engine.status,'completed');
      assert.equal(result.engine.stopReason,'site_exhausted');
      assert.deepEqual(entry.pages.map(p=>p.url),urls);
      assert.equal(new Set(entry.pages.map(p=>p.timeOrigin)).size,3);
      assert.ok(entry.pages.every(p=>Number.isFinite(p.timeOrigin)&&p.ready));
      assert.deepEqual(entry.pages.map(p=>p.data),[[expected[0]],expected.slice(1),[]]);
      const batches=entry.pages[1].batches;
      const first=batches.find(batch=>JSON.stringify(batch.ids)==='["B"]');
      const second=batches.find(batch=>JSON.stringify(batch.ids)==='["B","C"]');
      assert.ok(first&&second&&second.at-first.at>=500,'second batch must follow first by at least 500ms');
      assert.equal(entry.navigation.documents,2);
      assert.equal(entry.navigation.requests,2);
    }else{
      assert.equal(entry.error?.code,mode==='duplicate'?'E_LOCATOR_STRICT':mode==='origin'?'E_CAPTURE_ORIGIN':'NOT_SUPPORTED');
      assert.equal(entry.navigation.documents,0);
      assert.equal(entry.navigation.requests,0);
      assert.deepEqual(entry.pages.map(p=>p.url),[urls[0]]);
    }
    assert.equal(entry.navigation.clicks,0);
    entry.passed=true;
  }catch(error){entry.assertion={message:error.message};entry.passed=false;throw error;}
  finally{await context.close();}
}

async function main(){
  // Verify all three mappings before importing Playwright or launching a browser.
  for(const [index,name] of names.entries()){
    const response=await fetch(urls[index],{redirect:'error',signal:AbortSignal.timeout(5000)});
    assert.equal(response.status,200,`fixture HTTP status: ${name}`);
    const served=sha(Buffer.from(await response.arrayBuffer()));
    const local=sha(await readFile(new URL('../fixtures/'+name,import.meta.url)));
    report.fixtures.push({url:urls[index],localSha256:local,servedSha256:served});
    assert.equal(served,local,`fixture mapping SHA mismatch: ${name}`);
  }
  task=JSON.parse(await readFile(new URL('../controller/scrapyjs.opendesk-task.json',import.meta.url),'utf8'));
  await verifyTaskPackage(task);
  report.task={sourceHash:task.manifest.program.sourceHash,manifestHash:task.manifestHash,verified:true};
  const modulePath=process.env.SCRAPYJS_PLAYWRIGHT_MODULE;
  const executablePath=process.env.SCRAPYJS_CHROMIUM;
  assert.ok(modulePath&&executablePath,'Set SCRAPYJS_PLAYWRIGHT_MODULE and SCRAPYJS_CHROMIUM to explicitly opt in');
  const {chromium}=await import(pathToFileURL(modulePath).href);
  // launch() creates its own disposable profile; never attach to CDP/user profiles.
  const browser=await chromium.launch({headless:true,executablePath});
  try{
    report.browserVersion=browser.version();
    const failures=[];
    for(const kind of ['source','frozen'])for(const mode of ['complete','button','hash','duplicate','origin']){
      try{await scenario(browser,kind,mode);}
      catch(error){failures.push(`${kind}/${mode}: ${error.message}`);}
    }
    assert.equal(failures.length,0,failures.join('; '));
    report.passed=true;
  }finally{await browser.close();}
}

// Engine progress logs are intentionally suppressed so stdout is one compact JSON record.
const saved={log:console.log,info:console.info,debug:console.debug,warn:console.warn};
for(const name of Object.keys(saved))console[name]=()=>{};
try{await main();}
catch(error){report.error={code:error.code??null,message:error.message};process.exitCode=1;}
finally{Object.assign(console,saved);process.stdout.write(JSON.stringify(report)+'\n');}
