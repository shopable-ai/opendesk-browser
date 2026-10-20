import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {TextEncoder} from 'node:util';
import {parseHTML} from 'linkedom';

const source=await readFile(new URL('../src/notes.js',import.meta.url),'utf8');
const isolated={};
runInNewContext(source,{globalThis:isolated,TextEncoder,URL,Date,Math});
const {createStore,bytes,normalize}=isolated.OpenDeskClipNotes;
const error=code=>Object.assign(new Error(code),{code});
function fixture(){
 let value=null,mode='normal',writes=0;
 const token=()=>{let s=JSON.stringify(value),n=2166136261;for(const ch of s)n=Math.imul(n^ch.charCodeAt(0),16777619)>>>0;
  return n.toString(16).padStart(8,'0').repeat(8);};
 const request=async(op,args)=>{
  assert.equal(args.key,'clips','must use one tool-private storage key');
  if(op==='storage.get')return {value,etag:token()};
  assert.equal(op,'storage.set');
  if(args.ifMatch!==token())throw error('E_STORAGE_CONFLICT');
  if(mode==='quota')throw error('E_TOOL_DATA_LIMIT');
  if(mode==='host-failure')throw error('E_HOST_STORAGE_WRITE');
  if(mode==='lost-before')throw error('E_TOOL_TIMEOUT');
  value=structuredClone(args.value);writes++;
  if(mode==='lost-after'){mode='normal';throw error('E_TOOL_TIMEOUT');}
  return {saved:true,etag:token()};
 };
 const create=(tag)=>createStore({request,
  newId:()=>tag,
  now:()=> '2026-10-20T02:30:00.000Z'});
 return {create,request,read:()=>value,setMode:m=>mode=m,get writes(){return writes;}};
}
test('short selection persists after fresh store instance and deduplicates exact source and body',async()=>{
 const f=fixture(),a=f.create('clip-example-111111');
 const first=await a.save({kind:'clip',source:'https://example.com/page',body:'一句 **引用**'});
 assert.equal(first.duplicate,false);
 assert.equal(f.read().items.length,1);
 const restart=f.create('clip-example-222222');
 assert.equal((await restart.read()).data.items[0].body,'一句 **引用**');
 const again=await restart.save({kind:'clip',source:'https://example.com/page',body:'一句 **引用**'});
 assert.equal(again.duplicate,true);
 assert.equal(f.read().items.length,1);
 assert.equal(f.writes,1);
});
test('manual note needs body only and has no synthetic source; editing and deleting are persistent',async()=>{
 const f=fixture(),a=f.create('clip-manual-111111');
 const r=await a.save({kind:'note',body:'临时想法'});
 assert.equal(r.item.kind,'note');
 assert.equal(r.item.source,'');
 assert.equal(r.item.title,'临时想法');
 const b=f.create('clip-manual-222222');
 const changed=await b.edit(r.item.id,r.item,'修改后的便签');
 assert.equal(changed.item.body,'修改后的便签');
 assert.equal((await f.create('clip-manual-333333').read()).data.items[0].body,'修改后的便签');
 assert.equal((await b.remove(r.item.id)).removed,true);
 assert.equal((await a.read()).data.items.length,0);
});
test('UTF-8 size and aggregate JSON quota reject without truncating or corrupting earlier saves',async()=>{
 const f=fixture(),a=f.create('clip-size-111111');
 await assert.rejects(a.save({kind:'note',body:'中'.repeat(700)}),e=>e.code==='E_BODY_LIMIT');
 assert.equal(f.read(),null);
 const x=await a.save({kind:'clip',source:'https://example.com/first',body:'中'.repeat(670)});
 assert.equal(bytes(x.item.body),2010);
 const b=f.create('clip-size-222222');
 const y=await b.save({kind:'clip',source:'https://example.com/second',body:'中'.repeat(670)});
 assert.equal(y.item.body.length,670);
 const c=f.create('clip-size-333333');
 await c.save({kind:'clip',source:'https://example.com/third',body:'中'.repeat(670)});
 const d=f.create('clip-size-444444');
 await assert.rejects(d.save({kind:'clip',source:'https://example.com/fourth',body:'中'.repeat(670)}),
  e=>e.code==='E_QUOTA');
 assert.equal(f.read().items.length,3);
 assert.equal(f.read().items[0].body,'中'.repeat(670));
});
test('2048 UTF-8 bytes save intact and 2049-byte save or edit preserves the existing record',async()=>{
 const f=fixture(),store=f.create('clip-body-111111'),body='中'.repeat(682)+'ab';
 assert.equal(bytes(body),2048);
 const {item}=await store.save({kind:'note',body});
 assert.equal(f.read().items[0].body,body);
 await assert.rejects(store.edit(item.id,item,body+'c'),e=>e.code==='E_BODY_LIMIT');
 await assert.rejects(store.save({kind:'note',body:body+'c'}),e=>e.code==='E_BODY_LIMIT');
 assert.equal(f.writes,1);assert.equal(f.read().items[0].body,body);
});

test('the complete clips value accepts exactly 8192 bytes and rejects the next byte without writing',async()=>{
 const f=fixture(),at='2026-10-20T02:30:00.000Z';
 for(let i=1;i<=3;i++)await f.create('clip-limit-'+String(i).repeat(6)).save({kind:'note',body:'x'.repeat(2048)});
 const id='clip-limit-444444',title='边界',base={id,kind:'note',body:'',title,source:'',createdAt:at,updatedAt:at};
 const available=8192-bytes({version:1,items:[...f.read().items,base]});
 assert.ok(available>0&&available<=2048);
 const store=f.create(id),body='y'.repeat(available),{item}=await store.save({kind:'note',body,title});
 assert.equal(bytes(f.read()),8192);
 const before=JSON.stringify(f.read());
 await assert.rejects(store.edit(id,item,body+'z'),e=>e.code==='E_QUOTA');
 assert.equal(JSON.stringify(f.read()),before);assert.equal(f.writes,4);
});

test('simultaneous writers retry a stale ETag and preserve both records',async()=>{
 const f=fixture(),a=f.create('clip-race-111111'),b=f.create('clip-race-222222');
 await Promise.all([a.save({kind:'note',body:'窗口甲'}),b.save({kind:'note',body:'窗口乙'})]);
 assert.deepEqual(f.read().items.map(x=>x.body).sort(),['窗口乙','窗口甲']);
 assert.equal(f.writes,2);assert.equal(a.uncertain,false);assert.equal(b.uncertain,false);
});

test('Host quota rejection preserves old data and permits recovery without an unknown-write fence',async()=>{
 const f=fixture(),a=f.create('clip-quota-111111');await a.save({kind:'note',body:'保留已有内容'});
 f.setMode('quota');
 const b=f.create('clip-quota-222222');
 await assert.rejects(b.save({kind:'note',body:'超过宿主配额'}),e=>e.code==='E_QUOTA');
 assert.equal(b.uncertain,false);assert.equal(f.read().items.length,1);
 assert.equal(f.read().items[0].body,'保留已有内容');assert.equal(f.writes,1);
 f.setMode('normal');await b.save({kind:'note',body:'恢复后保存'});assert.equal(f.read().items.length,2);
});

test('lost acknowledgement resolves through read-back without duplicate save',async()=>{
 const f=fixture(),a=f.create('clip-loss-111111');
 f.setMode('lost-after');
 const r=await a.save({body:'saved despite lost response',kind:'note'});
 assert.equal(r.item.body,'saved despite lost response');
 assert.equal(f.writes,1);
 assert.equal((await a.read()).data.items.length,1);
});
test('an unconfirmed write blocks further changes until explicit fresh read',async()=>{
 const f=fixture(),a=f.create('clip-unknown-111111');
 f.setMode('lost-before');
 await assert.rejects(a.save({body:'lost result',kind:'note'}),e=>e.code==='E_OUTCOME_UNKNOWN');
 assert.equal(a.uncertain,true);
 await assert.rejects(a.save({body:'another',kind:'note'}),e=>e.code==='E_OUTCOME_UNKNOWN');
 f.setMode('normal');
 await a.recover();
 assert.equal(a.uncertain,false);
 const r=await a.save({body:'new content',kind:'note'});
 assert.equal(r.item.body,'new content');
});
test('Host-confirmed no-write failure is recoverable without an unnecessary unknown outcome',async()=>{
 const f=fixture(),a=f.create('clip-failed-111111');
 f.setMode('host-failure');
 await assert.rejects(a.save({body:'not persisted',kind:'note'}),e=>e.code==='E_STORAGE_WRITE');
 assert.equal(a.uncertain,false);
 assert.equal(f.read(),null);
 f.setMode('normal');
 await a.save({body:'persist after failure',kind:'note'});
 assert.equal(f.read().items[0].body,'persist after failure');
});
test('stale edit baseline and invalid web sources fail closed',async()=>{
 const f=fixture(),a=f.create('clip-edit-111111');
 const record=(await a.save({body:'old',kind:'note'})).item;
 const b=f.create('clip-edit-222222');
 await b.edit(record.id,record,'new');
 await assert.rejects(a.edit(record.id,record,'clobber'),e=>e.code==='E_STORAGE_CONFLICT');
 await assert.rejects(a.save({body:'bad',source:'javascript:alert(1)',kind:'clip'}),e=>e.code==='E_SOURCE');
 assert.equal(f.read().items[0].body,'new');
});
test('corrupt or oversize stored records never get replaced by a new library',async()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(normalize(null))),{version:1,items:[]});
 assert.throws(()=>normalize({version:1,items:[{id:'invalid'}]}),e=>e.code==='E_STORAGE_CORRUPT');
});

test('one-click delete rejects stale records edited in another panel and preserves the newer text',async()=>{
 const f=fixture(),first=f.create('clip-delete-111111');
 const original=(await first.save({kind:'note',body:'保留的新内容'})).item;
 const second=f.create('clip-delete-222222');
 await second.edit(original.id,original,'另一窗口已修改');
 await assert.rejects(first.remove(original.id,original),
  e=>e.code==='E_STORAGE_CONFLICT');
 assert.equal((await first.read()).data.items[0].body,'另一窗口已修改');
 const fresh=(await first.read()).data.items[0];
 assert.equal((await first.remove(fresh.id,fresh)).removed,true);
 assert.equal((await second.read()).data.items.length,0);
});

test('new clip source is sanitized at storage boundary while legacy 1.1.0 records remain readable',async()=>{
 const f=fixture();
 const first=await f.create('clip-url-111111').save({kind:'clip',
  body:'这是一条中文摘录',source:'https://example.com/a(b)?access_token=SECRET&mode=read&session_id=ABC#secret'});
 assert.equal(first.item.source,'https://example.com/a%28b%29?mode=read');
 assert.equal(f.read().items[0].source,first.item.source);
 const again=await f.create('clip-url-222222').save({kind:'clip',
  body:'这是一条中文摘录',source:'https://example.com/a(b)?mode=read#other'});
 assert.equal(again.duplicate,true,'sanitized source deduplicates independently of secrets');
 assert.equal(f.writes,1);
 const old={...first.item,source:'https://example.com/legacy?access_token=OLD#prior'};
 const stored=normalize({version:1,items:[old]});
 assert.equal(stored.items[0].source,old.source,'never corrupt or rewrite historical records on upgrade');
});

const markup=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function settled(check){
 for(let i=0;i<100;i++){if(check())return;await turn();}
 assert.fail('backup did not settle');
}
function backupUI({request,sdk}){
 const {document,window}=parseHTML('<html><body>'+markup+'</body></html>');
 const root=document.body;
 const context={OpenDeskTool:{setState(){} }};
 runInNewContext(source,{globalThis:context,document,TextEncoder,URL,Date,Math});
 context.OpenDeskClipNotes.create({root,request,sdk,onStatus(){}});
 return {root,click:()=>root.querySelector('#clip-note-backup').dispatchEvent(new window.Event('click')),
  status:()=>root.querySelector('#clip-notes-status')};
}
test('backup reserves preparation before its fresh read and includes another window latest commit',async()=>{
 const f=fixture();await f.create('clip-backup-111111').save({kind:'note',body:'已有摘录'});
 let release,paused=false,prepared=0,exported=null,legacyCalls=0;
 const gate=new Promise(resolve=>{release=resolve;});
 const request=async(op,args)=>{if(paused&&op==='storage.get')await gate;return f.request(op,args);};
 const sdk={downloads:{text:async()=>{legacyCalls++;return {started:true};},
  prepareText:async make=>{prepared++;const args=await make();exported=args;return {started:true};}}};
 const ui=backupUI({request,sdk});await turn();paused=true;
 ui.click();ui.click();
 assert.equal(prepared,1,'one explicit backup starts preparation synchronously and blocks duplicate clicks');
 assert.equal(exported,null);
 await f.create('clip-backup-222222').save({kind:'note',body:'另一窗口刚保存的中文'});
 release();await settled(()=>exported!==null);
 const backup=JSON.parse(exported.text);
 assert.equal(exported.filename,'web-clipper-notes.json');
 assert.equal(backup.format,'opendesk.clipper-notes.backup.v1');
 assert.deepEqual(backup.items.map(item=>item.body),['已有摘录','另一窗口刚保存的中文']);
 assert.equal(legacyCalls,0);
});
test('backup on an old Host still fresh-reads through the existing text export',async()=>{
 const f=fixture();await f.create('clip-backup-333333').save({kind:'note',body:'旧 Host 仍能备份'});
 let exported=null;
 const ui=backupUI({request:f.request,sdk:{downloads:{text:async args=>{exported=args;return {started:true};}}}});
 await turn();ui.click();await settled(()=>exported!==null);
 assert.equal(JSON.parse(exported.text).items[0].body,'旧 Host 仍能备份');
});
test('a failed preparation never automatically retries through the legacy export',async()=>{
 const f=fixture();let legacyCalls=0;
 const ui=backupUI({request:f.request,sdk:{downloads:{
  prepareText:async()=>{throw error('E_OUTCOME_UNKNOWN');},
  text:async()=>{legacyCalls++;return {started:true};}
 }}});
 await turn();ui.click();await settled(()=>ui.status().dataset.error==='true');
 assert.equal(legacyCalls,0);
 assert.match(ui.status().textContent,/备份下载未确认/);
});
test('a corrupt fresh read stops the backup without exporting an older UI snapshot',async()=>{
 const f=fixture();let corrupt=false,exports=0;
 const request=(op,args)=>corrupt&&op==='storage.get'
  ?Promise.resolve({value:{version:999,items:[]},etag:'a'.repeat(64)}):f.request(op,args);
 const sdk={downloads:{prepareText:async make=>{const args=await make();exports++;return args;},
  text:async()=>{exports++;return {started:true};}}};
 const ui=backupUI({request,sdk});await turn();corrupt=true;ui.click();
 await settled(()=>ui.status().dataset.error==='true');
 assert.equal(exports,0);assert.match(ui.status().textContent,/不会覆盖已有记录/);
});
