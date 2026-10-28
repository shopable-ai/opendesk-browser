import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Scrapy,ChromeSpider,ChromeDownloaderMiddleware,Request,Item,normalizeConfig,ItemLoader} from '../engine/browser.js';
const json=value=>JSON.parse(JSON.stringify(value));
const origin='http://127.0.0.1:43111/demo-form.html';

test('actual scheduler retains Request/callback/Item, array return and memory delivery (component only)',async()=>{
  const engine=new Scrapy({RETRY_TIMES:0,middlewares:[new ChromeDownloaderMiddleware({resolvePage:()=>null})]});
  const spider=new ChromeSpider({start_urls:[origin],output:null,itemConfig:{title:'h1::text'}});
  spider.start_requests=()=>[new Request(origin,async()=>[new Item({title:'from callback'}),new Item({title:'second'})])];
  engine.scheduler.downloaderMiddlewareManager.process_request=async request=>({url:request.url,request});
  engine.spider=spider;
  const rows=await engine.start();
  assert.deepEqual(json(rows),[{title:'from callback'},{title:'second'}]);
  assert.equal(engine.runResult.status,'completed');
  assert.equal(engine.runResult.counts.accepted,2);
  assert.equal(engine.runResult.delivery.committed,2);
  assert.equal(engine.runResult.delivery.ackLevel,'memory');
});

test('profile rejects deferred processing and malformed extraction explicitly',()=>{
  assert.throws(()=>new ChromeSpider({processing:{}}),{code:'E_SCRAPY_PROFILE'});
  assert.throws(()=>new ChromeSpider({rules:[{}]}),{code:'E_SCRAPY_PROFILE'});
  assert.throws(()=>normalizeConfig({_listItem:'li',title:'h1::text'}),{code:'E_ITEMLOADER_CONFIG'});
});

test('minified extraction callback executes outside the Worker/Webpack closure',async()=>{
  let source;
  await ItemLoader.parse({evaluate:async callback=>{source=callback.toString();return {records:[]};}}, {_listContainer:'#sample-list',_listItem:'li',title:':scope::text'});
  assert.ok(source);
  const scope=vm.createContext({document:{querySelectorAll(){return [];}}});
  const output=vm.runInContext('('+source+')',scope)(normalizeConfig({_listContainer:'#sample-list',_listItem:'li',title:':scope::text'}));
  assert.deepEqual(json(output),{records:[]});
});

test('retained source snapshots match the recorded hashes',async()=>{
  const pin=JSON.parse(await readFile(new URL('../vendor/scrapyjs/provenance.json',import.meta.url)));
  for(const row of pin.inputs){const data=await readFile(new URL('../vendor/scrapyjs/'+row.file,import.meta.url));assert.equal(createHash('sha256').update(data).digest('hex'),row.sha256,row.file);}
});

test('consumption artifact is bound to its build inputs, with no bundled third-party runtime',async()=>{
  const receipt=JSON.parse(await readFile(new URL('../engine/browser.build.json',import.meta.url)));
  const hash=data=>createHash('sha256').update(data).digest('hex');
  for(const [file,expected] of Object.entries(receipt.inputs))
    assert.equal(hash(await readFile(new URL('../engine/'+file,import.meta.url))),expected,file);
  assert.equal(hash(await readFile(new URL('../engine/browser.js',import.meta.url))),receipt.sourceSha256);
  assert.deepEqual(receipt.thirdPartyRuntimeModules,[]);
  assert(receipt.modules.every(file=>!file.includes('node_modules')&&!file.startsWith('../')));
});
