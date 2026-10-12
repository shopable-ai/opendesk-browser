import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTimeReviewDownload,registerTimeReviewFilenameResolver,TIME_REVIEW_DOWNLOAD_HINTS} from '../../src/time-review/download-naming.js';
function fixture(){
  const entries={},listeners=new Set();
  const event={addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)};
  const api={runtime:{id:'our-extension'},downloads:{onDeterminingFilename:event},storage:{session:{
    async get(key){return {[key]:structuredClone(entries[key])};},
    async set(value){Object.assign(entries,structuredClone(value));}
  }}};
  const suggest=async item=>{
    const listener=[...listeners][0],calls=[];
    const asyncResult=listener(item,value=>calls.push(value));
    if(asyncResult===true)await new Promise(resolve=>setImmediate(resolve));
    return {asyncResult,calls};
  };
  return {api,entries,listeners,suggest};
}
test('Time Review JSON/CSV filename is decided from a scoped session intent',async()=>{
  const f=fixture(),dispose=registerTimeReviewFilenameResolver(f.api,{now:()=>1000});
  for(const [name,text] of [['time-review.json','{"format":"opendesk.time-review.export.v1"}'],['time-review.csv','date,website,milliseconds,seconds,category\r\n']]){
    const options=await prepareTimeReviewDownload(f.api,{name,text},{at:1000});
    assert.equal(options.filename,name);assert.equal(options.saveAs,false);assert.equal(options.conflictAction,'uniquify');
    assert.match(options.url,/;od-export-id=[0-9a-f-]{36};charset=utf-8,/);
    const result=await f.suggest({byExtensionId:'our-extension',url:options.url});
    assert.equal(result.asyncResult,true);
    assert.deepEqual(result.calls,[{filename:name,conflictAction:'uniquify'}]);
  }
  dispose();assert.equal(f.listeners.size,0);
});
test('other tools, browser downloads, other extensions and forged intent never change names',async()=>{
  const f=fixture();registerTimeReviewFilenameResolver(f.api,{now:()=>1000});
  const options=await prepareTimeReviewDownload(f.api,{name:'time-review.json',text:'{}'},{at:1000});
  for(const item of [
    {byExtensionId:'other-extension',url:options.url},
    {byExtensionId:'our-extension',url:'data:application/json;name=knowledge-inbox.json,abc'},
    {byExtensionId:'our-extension',url:options.url.replace('application/json','text/csv')},
    {byExtensionId:'our-extension',url:options.url.replace(/od-export-id=[0-9a-f-]{36}/,'od-export-id=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')},
    {url:options.url}
  ]){
    const result=await f.suggest(item);assert.equal(result.asyncResult,false);assert.deepEqual(result.calls,[]);
  }
  const missing=await prepareTimeReviewDownload(f.api,{name:'time-review.csv',text:'a,b\r\n'},{at:1000});
  delete f.entries[TIME_REVIEW_DOWNLOAD_HINTS][missing.url.match(/od-export-id=([0-9a-f-]{36})/)[1]];
  const invalid=await f.suggest({byExtensionId:'our-extension',url:missing.url});
  assert.equal(invalid.asyncResult,true);assert.deepEqual(invalid.calls,[undefined]);
});
test('two outstanding exports survive worker re-registration without losing their names',async()=>{
  const f=fixture(),first=registerTimeReviewFilenameResolver(f.api,{now:()=>1234});
  const [json,csv]=await Promise.all([
    prepareTimeReviewDownload(f.api,{name:'time-review.json',text:'{}'},{at:1234,id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'}),
    prepareTimeReviewDownload(f.api,{name:'time-review.csv',text:'header\r\n'},{at:1234,id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'})
  ]);
  // Concurrent staging is serialized by Time Review's existing dispatch lock.
  // Re-stage after both to model that serial contract deterministically.
  await prepareTimeReviewDownload(f.api,{name:'time-review.json',text:'{}'},{at:1234,id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'});
  await prepareTimeReviewDownload(f.api,{name:'time-review.csv',text:'header\r\n'},{at:1234,id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'});
  first();registerTimeReviewFilenameResolver(f.api,{now:()=>1234});
  assert.deepEqual((await f.suggest({byExtensionId:'our-extension',url:csv.url})).calls,[{filename:'time-review.csv',conflictAction:'uniquify'}]);
  assert.deepEqual((await f.suggest({byExtensionId:'our-extension',url:json.url})).calls,[{filename:'time-review.json',conflictAction:'uniquify'}]);
});
test('expired intent and session I/O failure use Chrome default filename without hanging',async()=>{
  const f=fixture();registerTimeReviewFilenameResolver(f.api,{now:()=>121001});
  const options=await prepareTimeReviewDownload(f.api,{name:'time-review.json',text:'{}'},{at:1000});
  assert.deepEqual((await f.suggest({byExtensionId:'our-extension',url:options.url})).calls,[undefined]);
  f.api.storage.session.get=async()=>{throw Error('session unavailable');};
  assert.deepEqual((await f.suggest({byExtensionId:'our-extension',url:options.url})).calls,[undefined]);
  await assert.rejects(prepareTimeReviewDownload(f.api,{name:'time-review.json',text:'{}'}));
});
