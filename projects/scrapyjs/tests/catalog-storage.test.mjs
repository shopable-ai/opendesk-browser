import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';

const context=vm.createContext({TextEncoder,TextDecoder,URL,crypto,Blob,CompressionStream,DecompressionStream,btoa,atob});
for(const path of ['../adapters/app-sdk.js','../src/app-model.js'])
  vm.runInContext(await readFile(new URL(path,import.meta.url),'utf8'),context);
const plain=value=>JSON.parse(JSON.stringify(value));
const config={url:'https://books.toscrape.com/',itemConfig:{_listItem:'article.product_pod',title:'h3 a::title',price:'.price_color::text',url:'h3 a::href'},maxPages:1};
const catalog=()=>({schemaVersion:1,selectedId:'old-0',records:Array.from({length:10},(_,i)=>({id:'old-'+i,name:'历史配置'+i,
  config:{...plain(config),waitForSelector:'article.product_pod'+ ' '.repeat(500)}}))});
function store(value){
  let row={value:plain(value),etag:'old'},writes=0;
  const sdk=context.ScrapyAppSdk.createSdk(async(operation,payload)=>{
    assert.equal(payload.key,'capture-config');
    if(operation==='storage.get')return plain(row);
    assert.equal(operation,'storage.set');assert.equal(payload.ifMatch,row.etag);
    assert.ok(Buffer.byteLength(JSON.stringify(payload.value))<=8192);
    row={value:plain(payload.value),etag:'saved-'+(++writes)};
    return {saved:true};
  });
  return {sdk,get row(){return plain(row);},get writes(){return writes;},remote(){row.etag='concurrent';}};
}

test('full existing catalog saves a new profile through one bounded CAS and reopens without losing old records',async()=>{
  const original=catalog();assert.ok(Buffer.byteLength(JSON.stringify(original))<8192);
  const s=store(original),app=context.ScrapyAppModel.createApp(s.sdk);
  await app.load();await app.newProfile();app.edit({...plain(config),waitForSelector:'article'+ ' '.repeat(1500)});
  assert.equal(await app.save('三字段单页'),true,app.state.error);
  assert.equal(s.writes,1);assert.equal(s.row.value.format,'scrapyjs.config-catalog.gzip.v1');
  const reopened=context.ScrapyAppModel.createApp(s.sdk);await reopened.load();
  assert.deepEqual(plain(reopened.state.records).slice(0,10),original.records);
  assert.equal(reopened.state.records.length,11);
  assert.equal(reopened.state.records.at(-1).name,'三字段单页');
  assert.deepEqual(plain(reopened.state.config),plain(app.state.config));
});

test('packed catalogs keep ETag conflicts and reject corrupt, oversized or uncompressible values before writes',async()=>{
  const value=catalog();value.records[0].config.waitForSelector+=' '.repeat(1800);
  const s=store(null);await s.sdk.save(value,'old');
  assert.deepEqual(plain((await s.sdk.load()).value),value);
  s.remote();await assert.rejects(s.sdk.save(value,'old'),/concurrent|old/);
  assert.equal(s.writes,1);
  const bomb=await new Response(new Blob(['x'.repeat(32769)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  for(const packed of [
    {format:'scrapyjs.config-catalog.gzip.v1',data:'bad gzip'},
    {format:'scrapyjs.config-catalog.gzip.v1',data:Buffer.from(bomb).toString('base64')}
  ])await assert.rejects(store(packed).sdk.load());
  const large=catalog();large.records[0].config.waitForSelector+=' '.repeat(32768);
  await assert.rejects(s.sdk.save(large,'concurrent'),/32768/);
  await assert.rejects(s.sdk.save({schemaVersion:1,records:[randomBytes(12000).toString('hex')]},'concurrent'),/8192/);
  assert.equal(s.writes,1);
});
