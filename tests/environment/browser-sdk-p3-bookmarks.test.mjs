import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserBookmarksHost} from '../../src/platform/chrome/bookmarks.js';
const id={toolId:'bookmark-test',toolVersion:'1.0.0',
  packageHash:'a'.repeat(64),installEpoch:'install-a'};
const error=code=>e=>e?.code===code;
function fixture(){
  const storage=new Map(),nodes=new Map(),calls=[];
  let permission=true,revokeOnCreate=false,unknownCreate=false,unknownRemove=false;
  const api={
    storage:{local:{
      async get(key){return {[key]:structuredClone(storage.get(key))}},
      async set(object){for(const [key,value] of Object.entries(object))storage.set(key,structuredClone(value));}
    }},
    bookmarks:{
      async create(row){calls.push(['create',row]);if(unknownCreate)throw Error('timeout');
        const created={id:String(nodes.size+10),...row};nodes.set(created.id,created);
        if(revokeOnCreate)permission=false;
        return created;},
      async get(bookmarkId){calls.push(['get',bookmarkId]);
        return nodes.has(bookmarkId)?[{...nodes.get(bookmarkId)}]:[]},
      async remove(bookmarkId){calls.push(['remove',bookmarkId]);
        if(unknownRemove)throw Error('callback lost');
        nodes.delete(bookmarkId)}
    }
  };
  const authorize=async({context,origin})=>{
    if(!permission)throw Object.assign(Error('revoked'),{code:'E_CHROME_PERMISSION_REQUIRED'});
    if(context.packageHash!==id.packageHash)throw Object.assign(Error('foreign'),{code:'E_OWNER'});
    if(origin!=='https://example.org')throw Object.assign(Error('wrong site'),{code:'E_SITE_PERMISSION_REVOKED'});
  };
  let count=0;
  const make=()=>createBrowserBookmarksHost({api,authorize,
    createRef:()=>('book-ref-'+(++count)).padEnd(36,'x')});
  return {api,storage,nodes,calls,make,deny:()=>{permission=false},
    allow:()=>{permission=true},revokeOnCreate:()=>{revokeOnCreate=true},
    unknownCreate:()=>{unknownCreate=true},unknownRemove:()=>{unknownRemove=true}};
}
const request={url:'https://example.org/docs',title:'Docs'};
test('Bookmarks: real native create, durable opaque ownership and remove after Worker restart',async()=>{
  const f=fixture(),first=f.make();
  const created=await first.create(request,id);
  assert.deepEqual(Object.keys(created),['bookmarkRef']);
  assert.match(created.bookmarkRef,/^[A-Za-z0-9_-]{16,160}$/);
  assert.equal(f.nodes.size,1);
  assert.equal(f.calls.filter(([type])=>type==='create').length,1);
  const restored=f.make();
  assert.deepEqual(await restored.removeOwned({bookmarkRef:created.bookmarkRef},id),{removed:true});
  assert.equal(f.nodes.size,0);
  assert.deepEqual(f.calls.filter(([type])=>type==='remove').map(([,x])=>x),['10']);
});
test('Bookmarks: unauthorized tool, changed package, synthetic raw ID and foreign refs are denied',async()=>{
  const f=fixture(),host=f.make(),created=await host.create(request,id);
  await assert.rejects(host.removeOwned({bookmarkRef:created.bookmarkRef},
    {...id,toolId:'other-tool'}),error('E_BOOKMARK_REF_INVALID'));
  await assert.rejects(host.removeOwned({bookmarkRef:created.bookmarkRef},
    {...id,packageHash:'b'.repeat(64)}),error('E_BOOKMARK_REF_INVALID'));
  await assert.rejects(host.removeOwned({bookmarkRef:'10'},id),error('E_SCHEMA'));
  await assert.rejects(host.create({...request,parentRef:'r'.repeat(32)},id),
    error('E_BOOKMARK_PARENT_UNAVAILABLE'));
  await assert.rejects(host.create({url:'file:///etc/passwd'},id),error('E_SCHEMA'));
  await assert.rejects(host.create({url:'https://secret@example.org/'},id),error('E_SCHEMA'));
  assert.equal(f.calls.filter(([kind])=>kind==='remove').length,0);
});
test('Bookmarks: revoked permission refuses native effect and changed target prevents deletion',async()=>{
  const f=fixture(),host=f.make(),created=await host.create(request,id);
  f.nodes.get('10').url='https://evil.example.org/';
  await assert.rejects(host.removeOwned({bookmarkRef:created.bookmarkRef},id),
    error('E_BOOKMARK_REF_INVALID'));
  assert.equal(f.calls.filter(([type])=>type==='remove').length,0);
  f.deny();
  await assert.rejects(host.create(request,id),error('E_CHROME_PERMISSION_REQUIRED'));
  await assert.rejects(host.removeOwned({bookmarkRef:created.bookmarkRef},id),
    error('E_CHROME_PERMISSION_REQUIRED'));
  assert.equal(f.calls.filter(([type])=>type==='create').length,1);
});
test('Bookmarks: unknown and revoked-after-effect never return success or blindly retry',async()=>{
  const f=fixture(),host=f.make();f.unknownCreate();
  await assert.rejects(host.create(request,id),error('E_OUTCOME_UNKNOWN'));
  assert.equal(f.calls.filter(([kind])=>kind==='create').length,1);
  const g=fixture();g.revokeOnCreate();
  await assert.rejects(g.make().create(request,id),error('E_OUTCOME_UNKNOWN'));
  assert.equal(g.nodes.size,1);
  const h=fixture(),fresh=h.make(),result=await fresh.create(request,id);
  h.unknownRemove();
  await assert.rejects(fresh.removeOwned({bookmarkRef:result.bookmarkRef},id),
    error('E_OUTCOME_UNKNOWN'));
  assert.equal(h.calls.filter(([kind])=>kind==='remove').length,1);
});
test('Bookmarks: externally deleted bookmark clears owned mapping without global lookup',async()=>{
  const f=fixture(),host=f.make(),result=await host.create(request,id);
  f.nodes.clear();
  assert.deepEqual(await host.removeOwned({bookmarkRef:result.bookmarkRef},id),{removed:false});
  await assert.rejects(host.removeOwned({bookmarkRef:result.bookmarkRef},id),
    error('E_BOOKMARK_REF_INVALID'));
  assert(f.calls.filter(([kind])=>kind==='get').every(([,value])=>value==='10'));
});
