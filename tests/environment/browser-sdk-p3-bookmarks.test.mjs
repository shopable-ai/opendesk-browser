import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserBookmarksHost} from '../../src/platform/chrome/bookmarks.js';

const id={toolId:'bookmark-test',toolVersion:'1.0.0',
  packageHash:'a'.repeat(64),installEpoch:'install-a'};
const request={url:'https://example.org/docs',title:'Docs'};
const error=code=>e=>e?.code===code;

function fixture(){
  const storage=new Map(),nodes=new Map(),calls=[];
  let permission=true,revokeOnCreate=false,unknownCreate=false,
    unknownGet=false,rejectMissingGet=false,unknownRemove=false;
  const api={
    storage:{local:{
      async get(key){
        calls.push(['storage.get',key]);
        return storage.has(key)?{[key]:structuredClone(storage.get(key))}:{};
      },
      async set(object){
        calls.push(['storage.set',structuredClone(object)]);
        for(const [key,value] of Object.entries(object))storage.set(key,structuredClone(value));
      }
    }},
    bookmarks:{
      async create(row){
        calls.push(['create',row]);
        if(unknownCreate)throw Error('timeout');
        const created={id:String(nodes.size+10),...row};
        nodes.set(created.id,created);
        if(revokeOnCreate)permission=false;
        return created;
      },
      async get(bookmarkId){
        calls.push(['get',bookmarkId]);
        if(unknownGet)throw Error('quota exceeded');
        if(nodes.has(bookmarkId))return [{...nodes.get(bookmarkId)}];
        if(rejectMissingGet)throw Error("Can't find bookmark for id.");
        return [];
      },
      async remove(bookmarkId){
        calls.push(['remove',bookmarkId]);
        if(unknownRemove)throw Error('callback lost');
        nodes.delete(bookmarkId);
      }
    }
  };
  const authorize=async({context,origin})=>{
    if(!permission)throw Object.assign(Error('revoked'),{code:'E_CHROME_PERMISSION_REQUIRED'});
    if(context.packageHash!==id.packageHash)throw Object.assign(Error('foreign'),{code:'E_OWNER'});
    if(origin!=='https://example.org')throw Object.assign(Error('wrong site'),{code:'E_SITE_PERMISSION_REVOKED'});
  };
  let count=0;
  const make=()=>createBrowserBookmarksHost({api,authorize,
    createRef:()=>`bookmark-ref-${String(++count).padStart(4,'0')}`});
  return {
    api,storage,nodes,calls,make,
    set permission(value){permission=value;},
    set revokeOnCreate(value){revokeOnCreate=value;},
    set unknownCreate(value){unknownCreate=value;},
    set unknownGet(value){unknownGet=value;},
    set rejectMissingGet(value){rejectMissingGet=value;},
    set unknownRemove(value){unknownRemove=value;}
  };
}

test('Bookmarks: real native create, durable opaque ownership and remove after Worker restart',async()=>{
  const f=fixture(),host=f.make();
  const created=await host.create(request,id);
  assert.equal(created.bookmarkRef,'bookmark-ref-0001');
  assert.equal(f.nodes.size,1);
  assert.deepEqual(f.nodes.get('10'),{id:'10',url:request.url,title:request.title});

  const restarted=f.make();
  assert.deepEqual(await restarted.removeOwned({bookmarkRef:created.bookmarkRef},id),{removed:true});
  assert.equal(f.nodes.size,0);
});

test('Bookmarks: owner, version, epoch, opaque ID and schema boundaries are enforced',async()=>{
  const f=fixture(),host=f.make(),created=await host.create(request,id);
  await assert.rejects(host.removeOwned({bookmarkRef:created.bookmarkRef},
    {...id,toolId:'other-tool'}),error('E_BOOKMARK_REF_INVALID'));
  await assert.rejects(host.removeOwned({bookmarkRef:created.bookmarkRef},
    {...id,packageHash:'b'.repeat(64)}),error('E_BOOKMARK_REF_INVALID'));
  await assert.rejects(host.removeOwned({bookmarkRef:created.bookmarkRef},
    {...id,toolVersion:'2.0.0'}),error('E_BOOKMARK_REF_INVALID'));
  await assert.rejects(host.removeOwned({bookmarkRef:created.bookmarkRef},
    {...id,installEpoch:'install-b'}),error('E_BOOKMARK_REF_INVALID'));
  await assert.rejects(host.removeOwned({bookmarkRef:'10'},id),error('E_SCHEMA'));
  await assert.rejects(host.create({...request,parentRef:'r'.repeat(32)},id),
    error('E_BOOKMARK_PARENT_UNAVAILABLE'));
  await assert.rejects(host.create({url:'file:///etc/passwd'},id),error('E_SCHEMA'));
  assert.equal(f.calls.some(([kind])=>kind==='remove'),false);
});

test('Bookmarks: revoked permission and external edit refuse native deletion',async()=>{
  const f=fixture(),host=f.make(),created=await host.create(request,id);
  f.permission=false;
  await assert.rejects(host.removeOwned({bookmarkRef:created.bookmarkRef},id),
    error('E_CHROME_PERMISSION_REQUIRED'));
  f.permission=true;
  f.nodes.get('10').url='https://attacker.example/docs';
  await assert.rejects(host.removeOwned({bookmarkRef:created.bookmarkRef},id),
    error('E_BOOKMARK_REF_INVALID'));
  assert.equal(f.calls.some(([kind])=>kind==='remove'),false);
});

test('Bookmarks: uninstall or missing mapping does not replay against native IDs',async()=>{
  const f=fixture(),host=f.make(),created=await host.create(request,id);
  f.storage.clear();
  await assert.rejects(host.removeOwned({bookmarkRef:created.bookmarkRef},id),
    error('E_BOOKMARK_REF_INVALID'));
  assert.equal(f.nodes.has('10'),true);
  assert.equal(f.calls.some(([kind])=>kind==='get'||kind==='remove'),false);
});

test('Bookmarks: unknown create, remove and get failures do not return success or auto-replay',async()=>{
  const createFailure=fixture(),createHost=createFailure.make();
  createFailure.unknownCreate=true;
  await assert.rejects(createHost.create(request,id),error('E_OUTCOME_UNKNOWN'));
  assert.equal(createFailure.nodes.size,0);

  const removeFailure=fixture(),removeHost=removeFailure.make();
  const removeTarget=await removeHost.create(request,id);
  removeFailure.unknownRemove=true;
  await assert.rejects(removeHost.removeOwned({bookmarkRef:removeTarget.bookmarkRef},id),
    error('E_OUTCOME_UNKNOWN'));
  assert.equal(removeFailure.calls.filter(([kind])=>kind==='remove').length,1);
  assert.equal(removeFailure.nodes.has('10'),true);

  const getFailure=fixture(),getHost=getFailure.make();
  const getTarget=await getHost.create(request,id);
  getFailure.unknownGet=true;
  await assert.rejects(getHost.removeOwned({bookmarkRef:getTarget.bookmarkRef},id),
    error('E_CHROME'));
  assert.equal(getFailure.calls.some(([kind])=>kind==='remove'),false);
  getFailure.unknownGet=false;
  assert.deepEqual(await getHost.removeOwned({bookmarkRef:getTarget.bookmarkRef},id),
    {removed:true});
});

test('Bookmarks: revoked-after-effect never returns success',async()=>{
  const f=fixture(),host=f.make();
  f.revokeOnCreate=true;
  await assert.rejects(host.create(request,id),error('E_OUTCOME_UNKNOWN'));
  assert.equal(f.nodes.size,1);
});

test('Bookmarks: externally deleted bookmark clears owned mapping without global lookup',async()=>{
  const f=fixture(),host=f.make(),result=await host.create(request,id);
  f.nodes.clear();
  assert.deepEqual(await host.removeOwned({bookmarkRef:result.bookmarkRef},id),{removed:false});
  await assert.rejects(host.removeOwned({bookmarkRef:result.bookmarkRef},id),
    error('E_BOOKMARK_REF_INVALID'));
  assert(f.calls.filter(([kind])=>kind==='get').every(([,value])=>value==='10'));
  assert.equal(f.calls.some(([kind])=>kind==='remove'),false);
});

test('Bookmarks: rejected external delete is treated as missing and released once',async()=>{
  const f=fixture(),host=f.make(),result=await host.create(request,id);
  f.rejectMissingGet=true;
  f.nodes.clear();
  assert.deepEqual(await host.removeOwned({bookmarkRef:result.bookmarkRef},id),{removed:false});
  await assert.rejects(host.removeOwned({bookmarkRef:result.bookmarkRef},id),
    error('E_BOOKMARK_REF_INVALID'));
  assert(f.calls.filter(([kind])=>kind==='get').every(([,value])=>value==='10'));
  assert.equal(f.calls.some(([kind])=>kind==='remove'),false);
});
