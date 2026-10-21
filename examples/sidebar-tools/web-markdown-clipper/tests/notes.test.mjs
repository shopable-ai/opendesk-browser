import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {
 executeClipNotes,readClipLibrary,CLIP_NOTES_LIMITS,clipSource
} from '../trusted/notes-store.js';

const NS='opendesk.sidebar-tools.data.v1:web-markdown-clipper';
const bytes=value=>new TextEncoder().encode(value).length;
const sorted=value=>JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)
 ?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
const etagFor=async value=>createHash('sha256').update(sorted(value)).digest('hex');
const iso='2026-10-21T01:02:03.000Z';
function fixture({legacy=null}={}){
 let value={clips:legacy,unrelated:'keep-this-key'},mode='normal',allowed=true,writes=0,id=0;
 const api={
  storage:{local:{
   async get(key){if(key!==NS)throw Error('cross-tool access '+key);return {[key]:structuredClone(value)};},
   async set(input){
    if(mode==='quota')throw Error('QUOTA_BYTES error');
    if(mode==='write-fail')throw Error('Disk write failure');
    value=structuredClone(input[NS]);writes++;
    if(mode==='lost-ack'){mode='normal';throw Error('write response lost');}
    if(mode==='corrupt-after-write'){value.clips.items[0].body='CORRUPTED';throw Error('partial write');}
   }
  }},
  downloads:{async download(input){
   if(!input.url.startsWith('data:application/json'))throw Error('bad export URL');
   api.lastDownload=input;return 22;
  }}
 };
 const authorize=async()=>{if(!allowed)throw Object.assign(new Error('Tool disabled'),{code:'E_TOOL_CHANGED'});};
 const run=(op,payload={})=>executeClipNotes({api,operation:op,toolId:'web-markdown-clipper',
  payload,authorize,etagFor,now:()=>iso,newId:()=> 'clip-test-'+String(++id).padStart(8,'0')});
 return {run,api,read:()=>structuredClone(value),setMode:m=>mode=m,enable:b=>allowed=b,get writes(){return writes;}};
}
const makeBody=n=>'中'.repeat(Math.floor(n/3))+'a'.repeat(n%3);
const note=body=>({kind:'note',body});
const clip=body=>({kind:'clip',body,source:'https://example.com/article?token=secret&lang=zh#heading',title:'示例网页'});

test('formatted selection survives save, persisted read and edit without flattening Markdown',async()=>{
 const f=fixture();
 const body='## Selected heading\n\n- First\n  - Nested\n\n3. Ordered\n\n**Bold** and `code()`\n';
 const saved=await f.run('clipNotes.save',{kind:'clip',source:'https://example.com/post',body});
 const reopened=await f.run('clipNotes.get',{id:saved.id});
 assert.equal(reopened.item.body,body);assert.equal(reopened.item.id,saved.id);
 await f.run('clipNotes.edit',{id:saved.id,body:body+'\nMore text\n',ifMatch:reopened.etag});
 assert.equal((await f.run('clipNotes.get',{id:saved.id})).item.body,body+'\nMore text\n');
});

test('10 KB, 50 KB, 100 KB and 150,000-byte markdown save and re-open exactly',async()=>{
 const f=fixture();
 for(const [i,n] of [10000,50000,100000,149999,150000].entries()){
  const body=makeBody(n);assert.equal(bytes(body),n);
  const written=await f.run('clipNotes.save',note(body));
  const read=await f.run('clipNotes.get',{id:written.id});
  assert.equal(read.item.body,body);
  assert.equal(bytes(read.item.body),n);
  assert.equal(read.item.createdAt,iso);
  assert.equal(read.item.updatedAt,iso);
 }
 const library=await f.run('clipNotes.list',{query:'中',offset:0});
 assert.equal(library.total,5);
 assert.equal(library.limits.bodyBytes,160000);
 assert.equal(library.limits.totalBytes,4194304);
 assert.ok(library.items.every(row=>!('body' in row)&&row.excerpt.length<=180));
 assert.equal(f.read().unrelated,'keep-this-key');
});
test('160,001 UTF-8 byte input or edit never overwrites valid old data',async()=>{
 const f=fixture();
 const base=await f.run('clipNotes.save',note('原有内容'));
 await assert.rejects(f.run('clipNotes.save',note(makeBody(160001))),e=>e.code==='E_BODY_LIMIT');
 const read=await f.run('clipNotes.get',{id:base.id});
 await assert.rejects(f.run('clipNotes.edit',{id:base.id,body:makeBody(160001),ifMatch:read.etag}),
  e=>e.code==='E_BODY_LIMIT');
 assert.equal((await f.run('clipNotes.get',{id:base.id})).item.body,'原有内容');
});
test('4 MiB whole library limit is real; failed 29th large document leaves 28 readable',async()=>{
 const f=fixture();
 const saved=[];
 for(let i=0;i<28;i++){
  const body=String(i).padStart(2,'0')+makeBody(149000);
  saved.push(await f.run('clipNotes.save',note(body)));
 }
 const before=await f.run('clipNotes.list',{query:'',offset:0});
 assert.equal(before.total,28);
 assert.ok(before.usedBytes<CLIP_NOTES_LIMITS.totalBytes);
 await assert.rejects(f.run('clipNotes.save',note(makeBody(149000)+'MORE')),e=>e.code==='E_QUOTA');
 const after=await f.run('clipNotes.list');
 assert.equal(after.total,28);
 assert.equal(after.usedBytes,before.usedBytes);
 assert.equal((await f.run('clipNotes.get',{id:saved[0].id})).item.body, '00'+makeBody(149000));
});
test('fresh installation starts empty and exports every original Markdown field',async()=>{
 const f=fixture();
 assert.equal((await f.run('clipNotes.list')).total,0);
 const body='# 新建文章\n\n'+'中文段落'.repeat(8000)+'\n结尾';
 const saved=await f.run('clipNotes.save',clip(body));
 assert.equal((await f.run('clipNotes.get',{id:saved.id})).item.body,body);
 const exported=await f.run('clipNotes.backup');
 assert.equal(exported.started,true);
 const backup=JSON.parse(decodeURIComponent(f.api.lastDownload.url.split(',').slice(1).join(',')));
 assert.equal(backup.format,'opendesk.clipper-notes.backup.v1');
 assert.equal(backup.items[0].id,saved.id);
 assert.equal(backup.items[0].body,body);
 assert.equal(backup.items[0].title,'示例网页');
 assert.equal(backup.items[0].source,'https://example.com/article?lang=zh');
 assert.equal(f.read().unrelated,'keep-this-key');
});
test('deduplication and sensitive source stripping never truncate Markdown',async()=>{
 const f=fixture(),body=makeBody(50000),first=await f.run('clipNotes.save',clip(body));
 const second=await f.run('clipNotes.save',clip(body));
 assert.equal(first.id,second.id);
 assert.equal(second.duplicate,true);
 assert.equal((await f.run('clipNotes.get',{id:first.id})).item.source,
  'https://example.com/article?lang=zh');
 assert.equal((await f.run('clipNotes.get',{id:first.id})).item.body,body);
 assert.equal(clipSource('https://example.com?p=1&password=two#frag'),'https://example.com/?p=1');
});
test('optimistic ETag protects concurrent edit and delete; successful remove is durable',async()=>{
 const f=fixture(),first=await f.run('clipNotes.save',note('稿 A'));
 const snapshot=await f.run('clipNotes.get',{id:first.id});
 const edited=await f.run('clipNotes.edit',{id:first.id,ifMatch:snapshot.etag,body:'稿 B'});
 assert.equal(edited.unchanged,false);
 await assert.rejects(f.run('clipNotes.edit',{id:first.id,ifMatch:snapshot.etag,body:'旧窗口覆写'}),
  e=>e.code==='E_STORAGE_CONFLICT');
 await assert.rejects(f.run('clipNotes.remove',{id:first.id,ifMatch:snapshot.etag}),
  e=>e.code==='E_STORAGE_CONFLICT');
 assert.equal((await f.run('clipNotes.get',{id:first.id})).item.body,'稿 B');
 const fresh=await f.run('clipNotes.get',{id:first.id});
 const deleted=await f.run('clipNotes.remove',{id:first.id,ifMatch:fresh.etag});
 assert.equal(deleted.removed,true);
 await assert.rejects(f.run('clipNotes.get',{id:first.id}),e=>e.code==='E_NOT_FOUND');
});
test('quota and verified failed writes preserve existing saved records; lost reply read-back succeeds',async()=>{
 const f=fixture(),first=await f.run('clipNotes.save',note('保留资料'));
 f.setMode('quota');
 await assert.rejects(f.run('clipNotes.save',note('不能保存')),e=>e.code==='E_HOST_STORAGE_QUOTA');
 assert.equal((await f.run('clipNotes.get',{id:first.id})).item.body,'保留资料');
 f.setMode('write-fail');
 await assert.rejects(f.run('clipNotes.save',note('不能保存 2')),e=>e.code==='E_HOST_STORAGE_WRITE');
 assert.equal((await f.run('clipNotes.list')).total,1);
 f.setMode('lost-ack');
 const second=await f.run('clipNotes.save',note('回执丢失但真正写入'));
 assert.equal((await f.run('clipNotes.get',{id:second.id})).item.body,'回执丢失但真正写入');
});
test('corrupt previous data stops operations, and cross-tool attempts cannot reach namespace',async()=>{
 const corrupt=fixture({legacy:{version:1,items:[{id:'invalid'}]}});
 await assert.rejects(corrupt.run('clipNotes.save',note('Do not overwrite')),e=>e.code==='E_STORAGE_CORRUPT');
 assert.equal(corrupt.read().clips.items[0].id,'invalid');
 const good=fixture();
 await assert.rejects(executeClipNotes({api:good.api,toolId:'knowledge-inbox',operation:'clipNotes.list',
  authorize:async()=>{},etagFor}),e=>e.code==='E_TOOL_CONTEXT');
 assert.equal(good.writes,0);
});
test('JS UI uses approved full-text Host operations and reopens after new store instance',async()=>{
 const source=await readFile(new URL('../src/notes.js',import.meta.url),'utf8');
 const ctx={};runInNewContext(source,{globalThis:ctx,TextEncoder,URL,Date,Math});
 const f=fixture(),request=(operation,payload)=>f.run(operation,payload);
 const first=ctx.OpenDeskClipNotes.createStore({request});
 const body=makeBody(100000),saved=await first.save(note(body));
 assert.equal(saved.item.body,body);
 const reopened=ctx.OpenDeskClipNotes.createStore({request});
 const listed=await reopened.list();
 assert.equal(listed.total,1);
 const original=await reopened.get(saved.item.id);
 assert.equal(original.item.body,body);
 const updated=await reopened.edit(saved.item.id,original.etag,body+'更多');
 assert.equal((await reopened.get(saved.item.id)).item.body,body+'更多');
 await reopened.remove(saved.item.id,updated.etag);
 assert.equal((await reopened.list()).total,0);
});
test('formal preview stage contains exact official interactive HTML, not a second UI',async()=>{
 const official=(await readFile(new URL('../src/index.html',import.meta.url),'utf8')).trim();
 const stage=await readFile(new URL('../preview/stage.html',import.meta.url),'utf8');
 assert.ok(stage.includes(official));
 for(const id of ['clip-my-notes','clip-note-reader','clip-note-read-body','clip-note-save','clip-note-backup','clip-note-more'])
  assert.ok(official.includes('id="'+id+'"'));
 assert.doesNotMatch(official,/clip-view-saved/);
});

test('150,000 UTF-8 bytes plus YAML and long valid source are saved without truncation',async()=>{
 const f=fixture();
 const markdown='---\ntitle: "一篇文章"\n---\n\n'+makeBody(150000)+'\n来源尾注';
 const source='https://example.com/article?keep='+('x'.repeat(2300))+'&token=secret#heading';
 const stored=await f.run('clipNotes.save',{kind:'clip',body:markdown,title:'一篇文章',source});
 const read=await f.run('clipNotes.get',{id:stored.id});
 assert.equal(read.item.body,markdown);
 assert.equal(read.item.title,'一篇文章');
 assert.equal(read.item.source.includes('token='),false);
 assert.equal(read.item.source.includes('#'),false);
 assert.ok(read.item.source.includes('keep='));
 const hits=await f.run('clipNotes.list',{query:'来源尾注'});
 assert.equal(hits.matched,1);
 assert.equal(hits.items[0].id,stored.id);
});
test('replaying a note after a lost acknowledgement cannot create a second note',async()=>{
 const f=fixture();
 f.setMode('lost-ack');
 const first=await f.run('clipNotes.save',note('结果待确认的便签'));
 const replay=await f.run('clipNotes.save',note('结果待确认的便签'));
 assert.equal(replay.duplicate,true);
 assert.equal(replay.id,first.id);
 assert.equal((await f.run('clipNotes.list')).total,1);
});
test('Host request budget admits 150 KB escaped Markdown only for the clipper',async()=>{
 const host=await readFile(new URL('../../../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
 const begin=host.indexOf('export function checkSidebarToolRequestBudget(message)');
 const end=host.indexOf('\n}\n\n// Trusted Side Panel',begin);
 assert.ok(begin>=0&&end>begin,'Host budget function must remain testable');
 const definition=host.slice(begin,end+2).replace(/^export /,'');
 const check=runInNewContext(definition+'\ncheckSidebarToolRequestBudget',
  {TextEncoder,browserOperation:()=>null});
 const make=(operation,body,toolId='web-markdown-clipper')=>({operation,toolId,payload:{body}});
 for(const body of ['\n'.repeat(150000),'\u0000'.repeat(150000),'中'.repeat(50000)])
  assert.equal(check(make('clipNotes.save',body))?.ok,true,'full article should pass');
 assert.equal(check(make('clipNotes.save','x'.repeat(160001)))?.ok,false);
 assert.equal(check(make('clipNotes.save','x'.repeat(30000),'another-tool'))?.ok,false);
 assert.equal(check(make('storage.get','x'.repeat(30000),'another-tool'))?.ok,false);
 assert.equal(check(make('clipNotes.list','x'.repeat(30000)))?.ok,false);
});

test('UI freezes an in-flight save snapshot, blocks double save, and keeps unsaved editor text',async()=>{
 const source=await readFile(new URL('../src/notes.js',import.meta.url),'utf8');
 class Element{
  constructor(id){this.id=id;this.value='';this.textContent='';this.dataset={};this.events={};this.children=[];this.hidden=false;this.disabled=false;}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
  async fire(type){await Promise.all((this.events[type]||[]).map(fn=>fn()));}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(key,value){this[key]=value;}
  focus(){this.focused=true;}
 }
 const ids=[...source.matchAll(/q\('([^']+)'\)/g)].map(match=>match[1]);
 const elements=Object.fromEntries([...new Set(ids)].map(id=>[id,new Element(id)]));
 const doc={createElement:tag=>new Element(tag)};
 const root={ownerDocument:doc,querySelector:key=>elements[key.slice(1)]};
 let resolveSave,saveCalls=0,writeInput=null;
 const pending=new Promise(resolve=>{resolveSave=resolve;});
 const request=(operation,payload={})=>{
  if(operation==='clipNotes.list')return Promise.resolve({
   items:[],total:0,usedBytes:0,etag:'e',nextOffset:null
  });
  if(operation==='clipNotes.save'){
   saveCalls++;writeInput={...payload};return pending;
  }
  if(operation==='clipNotes.get')return Promise.resolve({
   item:{id:'clip-1',kind:'clip',body:writeInput.body,
    title:writeInput.title,source:writeInput.source},etag:'e'
  });
  throw Error('unexpected operation: '+operation);
 };
 const ctx={OpenDeskTool:{setState(){}}};
 runInNewContext(source,{globalThis:ctx,document:doc,TextEncoder,URL,Date,Math,setTimeout,clearTimeout});
 const changes=[];
 const notes=ctx.OpenDeskClipNotes.create({root,request,sdk:{},
  onStatus:()=>{},renderMarkdown:()=>{},
  onSaveBusy:active=>changes.push(active)});
 notes.setClip({body:'旧网页敏感正文',title:'原文',source:'https://old.example/a'});
 await elements['clip-save'].fire('click');
 assert.equal(saveCalls,1);
 assert.deepEqual(changes,[true]);
 notes.setClip(null); // Simulated navigation while Host storage is pending.
 await elements['clip-save'].fire('click');
 assert.equal(saveCalls,1,'must not duplicate an uncertain write');
 assert.equal(writeInput.body,'旧网页敏感正文');
 assert.equal(writeInput.source,'https://old.example/a');
 resolveSave({id:'clip-1',duplicate:false});
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.deepEqual(changes,[true,false]);
 assert.equal(elements['clip-save'].disabled,true,'old page must not become savable again');
 await elements['clip-note-new'].fire('click');
 elements['clip-note-body'].value='未保存的手动便签草稿';
 await elements['clip-note-body'].fire('input');
 notes.setClip(null);
 assert.equal(elements['clip-note-body'].value,'未保存的手动便签草稿');
 assert.equal(await notes.showLibrary(),undefined,'dirty editor blocks navigation');
 assert.equal(elements['clip-note-body'].value,'未保存的手动便签草稿');
});
