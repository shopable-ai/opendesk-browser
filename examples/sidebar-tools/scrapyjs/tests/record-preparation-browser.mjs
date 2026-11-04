// Bounded consumer probe. Own ephemeral browser only; no installed extension,
// Native/Authority evidence, model requests, or shared build output.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {runInspection} from '../controller/inspect-page.js';
import {runCapture} from '../controller/capture.js';
import {applyInlineField} from '../src/editor.js';

const output=resolve(process.argv[2]||'artifacts/scrapyjs/record-preparation-20261103');
const {chromium}=await import(process.env.SCRAPYJS_PLAYWRIGHT_MODULE||'playwright');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.SCRAPYJS_CHROMIUM||undefined});
const report={startedAt:new Date().toISOString(),runtime:process.version,browser:browser.version(),checks:[],boundary:'consumer code on real Chromium; not installed extension, Native or permission-chain verification'};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
report.inputs={};
for(const file of ['../engine/browser.js','../controller/inspect-page.js','../controller/capture.js','../src/editor.js'])report.inputs[file]=digest(await readFile(new URL(file,import.meta.url)));
const check=async(name,fn)=>{
 try{const details=await fn();report.checks.push({name,status:'PASS',details});}
 catch(error){report.checks.push({name,status:'FAIL',error:error.stack});process.exitCode=1;}
};
// Controller evaluate accepts variadic arguments; Playwright accepts one JSON
// argument. This transport adapter executes the unchanged product callback.
const consumerPage=page=>({url:()=>page.url(),goto:(...args)=>page.goto(...args),content:()=>page.content(),locator:selector=>page.locator(selector),
 evaluate:(fn,...args)=>page.evaluate(({source,args})=>(0,eval)('('+source+')')(...args),{source:fn.toString(),args})});
async function prepareAndSave(page,config,name){
 const result=await runInspection({kind:'records',mode:'snapshot',url:config.url,container:'',item:'',itemConfig:config.itemConfig,required:['url'],identity:['url']},page);
 assert.equal(result.status,'ready',JSON.stringify(result));
 const choice=result.choices[0];
 const next=applyInlineField(config,{scopeOnly:true,container:choice.itemConfig._listContainer||'',item:choice.itemConfig._listItem,
  preparedList:{base:JSON.stringify(config),itemConfig:choice.itemConfig,rowShape:choice.rowShape}});
 await writeFile(resolve(output,name+'-rule.json'),JSON.stringify(next,null,2));
 return {config:JSON.parse(await readFile(resolve(output,name+'-rule.json'),'utf8')),count:choice.count};
}
try{
 await check('live Books to Scrape: original Controller capture of two pages from one saved preparation',async()=>{
  const context=await browser.newContext(),page=await context.newPage();
  const url='https://books.toscrape.com/';
  const reference=()=>page.locator('article.product_pod').evaluateAll(rows=>rows.map(row=>({
   title:row.querySelector('h3 a').getAttribute('title'),url:row.querySelector('h3 a').getAttribute('href'),price:row.querySelector('.price_color').textContent.trim()
  })));
  assert.equal((await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000})).status(),200);
  const first=await reference();assert.equal(first.length,20);
  const secondUrl=new URL(await page.locator('li.next a').getAttribute('href'),url).href;
  assert.equal((await page.goto(secondUrl,{waitUntil:'domcontentloaded',timeout:25000})).status(),200);
  const second=await reference();assert.equal(second.length,20);
  await page.goto(url,{waitUntil:'domcontentloaded'});
  const controlled=consumerPage(page);
  const saved=await prepareAndSave(controlled,{url,itemConfig:{title:'.row .product_pod h3 a::title',url:'.row .product_pod h3 a::href',price:'.row .product_pod .price_color::text'},waitForSelector:'.row',nextPageSelector:'li.next a',maxPages:2,dedupeKey:'url'},'live');
  const expected=[...first,...second];
  const result=await runCapture(saved.config,controlled);
  assert.deepEqual(result.data,expected);assert.equal(result.data.length,40);
  assert.deepEqual(result.audit.listUrls,[url,secondUrl]);
  // Reopen the saved rule and run again without preparation or a model.
  const reopened=JSON.parse(await readFile(resolve(output,'live-rule.json'),'utf8'));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  const replay=await runCapture(reopened,controlled);assert.deepEqual(replay.data,expected);
  await writeFile(resolve(output,'live-values.json'),JSON.stringify({urls:[url,secondUrl],expected,actual:result.data,replay:replay.data,audit:result.audit,engine:result.engine},null,2));
  await context.close();
  return {urls:[url,secondUrl],preparedRows:saved.count,captured:40,fieldComparisons:240,identical:true,preparations:1,replays:2};
 });
 await check('original Controller: middle missing values, many fields and repeated titles on two fixture pages',async()=>{
  const context=await browser.newContext(),page=await context.newPage(),url='http://127.0.0.1:43111/record-flow-1.html';
  const first='<main class="catalog"><article class="book"><a href="/a">Same</a><b>10</b><i>x</i><i>y</i></article><article class="book"><a href="/b">Same</a></article><article class="book"><a href="/c">Third</a><b>30</b><i>z</i></article></main><a class="next" href="/record-flow-2.html">Next</a>';
  const second='<main class="catalog"><article class="book"><a href="/d">Fourth</a><b>40</b><i>u</i></article><article class="book"><a href="/e">Same</a><b>50</b></article></main>';
  await context.route('http://127.0.0.1:43111/**',route=>route.fulfill({status:200,contentType:'text/html',body:route.request().url()===url?first:second}));
  await page.goto(url);
  const controlled=consumerPage(page);
  const saved=await prepareAndSave(controlled,{url,itemConfig:{title:'.catalog article.book a::text',url:'.catalog article.book a::href',price:'.catalog article.book b::text',tags:{selector:'.catalog article.book i',read:'text',cardinality:'many'}},waitForSelector:'.catalog',nextPageSelector:'a.next',maxPages:2,dedupeKey:'url'},'fixture');
  const expected=[{title:'Same',url:'/a',price:'10',tags:['x','y']},{title:'Same',url:'/b',price:'',tags:[]},{title:'Third',url:'/c',price:'30',tags:['z']},{title:'Fourth',url:'/d',price:'40',tags:['u']},{title:'Same',url:'/e',price:'50',tags:[]}];
  const result=await runCapture(saved.config,controlled);assert.deepEqual(result.data,expected);
  await writeFile(resolve(output,'fixture-values.json'),JSON.stringify({expected,actual:result.data,audit:result.audit},null,2));
  await context.close();return {preparedRows:saved.count,records:5,fieldComparisons:20,identical:true};
 });
}finally{
 await browser.close();report.finishedAt=new Date().toISOString();
 for(const [file,hash] of Object.entries(report.inputs))assert.equal(digest(await readFile(new URL(file,import.meta.url))),hash,'Source changed during probe: '+file);
 await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
