import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserFullBookmarksHost} from '../../src/platform/chrome/bookmarks-full.js';
import {BROWSER_OPERATIONS,normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {createApprovedBrowserBindings} from '../../src/framework/sdk/browser-bindings.js';

const error=code=>e=>e?.code===code;
const owner={toolId:'bookmark-manager',toolVersion:'0.2.1',packageHash:'a'.repeat(64),installEpoch:'epoch1'};
const expected=n=>({id:n.id,parentId:n.parentId??null,index:n.index??null,title:n.title,
  url:n.url??null,unmodifiable:n.unmodifiable??null,folderType:n.folderType??null});
function fixture(count=0){
  const rows=new Map(),listeners=new Map(),effects=[];
  let allowed=true,next=100000,serial=0;
  const root={id:'0',title:'root',parentId:null,index:null};
  const bar={id:'1',title:'Bookmarks bar',parentId:'0',index:0,folderType:'bar'};
  const folder={id:'2',title:'Safe folder',parentId:'1',index:0};
  for(const row of [root,bar,folder])rows.set(row.id,{...row});
  for(let i=0;i<count;i++)rows.set(String(i+10),{id:String(i+10),title:'Bookmark '+i,
    url:'https://example.org/'+i,parentId:'2',index:i});
  const clone=x=>JSON.parse(JSON.stringify(x));
  const build=(id,depth=0)=>{
    if(depth>100)throw Error('cyclic fixture');
    const row=rows.get(id);if(!row)throw Error('missing node');
    return {...clone(row),children:[...rows.values()].filter(x=>x.parentId===id)
      .sort((a,b)=>a.index-b.index).map(x=>build(x.id,depth+1))};
  };
  const emit=(event,...args)=>{for(const fn of listeners.get(event)||[])fn(...args)};
  const events=Object.fromEntries(['onCreated','onRemoved','onChanged','onMoved',
    'onChildrenReordered','onImportBegan','onImportEnded'].map(name=>[
      name,{addListener(fn){if(!listeners.has(name))listeners.set(name,[]);
        listeners.get(name).push(fn);}}
    ]));
  const bookmarks={
    ...events,
    async getTree(){return [build('0')]},
    async getSubTree(id){return [build(id)]},
    async get(id){if(!rows.has(id))throw Error('missing');return [clone(rows.get(id))]},
    async search(q){const term=typeof q==='string'?q:q.query??q.title??'';
      return [...rows.values()].filter(x=>x.title.includes(term)).map(clone)},
    async create(d){
      effects.push(['create',d]);const id=String(next++),node={
        id,parentId:d.parentId??'1',index:d.index??[...rows.values()].filter(x=>x.parentId===(d.parentId??'1')).length,
        title:d.title,...(d.url?{url:d.url}:{})};
      rows.set(id,node);emit('onCreated',id,clone(node));return clone(node);
    },
    async update(id,changes){
      effects.push(['update',id]);const n=rows.get(id);Object.assign(n,changes);
      emit('onChanged',id,clone(changes));return clone(n);
    },
    async move(id,d){
      effects.push(['move',id]);const n=rows.get(id),from={parentId:n.parentId,index:n.index};
      n.parentId=d.parentId;n.index=d.index??0;
      emit('onMoved',id,{parentId:n.parentId,index:n.index,
        oldParentId:from.parentId,oldIndex:from.index});return clone(n);
    },
    async remove(id){
      effects.push(['remove',id]);if([...rows.values()].some(x=>x.parentId===id))throw Error('folder not empty');
      const n=rows.get(id);rows.delete(id);emit('onRemoved',id,{parentId:n.parentId,index:n.index,node:clone(n)});
    },
    async removeTree(id){
      effects.push(['removeTree',id]);const node=rows.get(id);
      const stack=[id];while(stack.length){
        const current=stack.pop();
        for(const child of rows.values())if(child.parentId===current)stack.push(child.id);
        rows.delete(current);
      }
      emit('onRemoved',id,{parentId:node.parentId,index:node.index,node:clone(node)});
    }
  };
  let refs=0;
  const make=()=>createBrowserFullBookmarksHost({api:{bookmarks},
    makeRef:()=>String(++refs).padStart(36,'f'),
    authorize:async({operation,context})=>{
      if(!allowed)throw Object.assign(Error('Denied'),{code:'E_BOOKMARK_FULL_CONSENT_REQUIRED'});
      if(context.toolId!==owner.toolId||context.packageHash!==owner.packageHash||
         !operation.startsWith('browser.bookmarks.'))throw Object.assign(Error('foreign'),{code:'E_OWNER'});
    }});
  return {bookmarks,rows,effects,make,emit,expected:id=>expected(rows.get(id)),
    set allowed(v){allowed=v}};
}
async function pages(host,context=owner,limit=80,initial){
  let page=initial??await host.getTree({limit},context),all=[],seen=new Set(),step=0;
  while(page){
    assert(page.snapshotRef&&page.nodes.length<=limit);
    assert(new TextEncoder().encode(JSON.stringify(page)).byteLength<=10500);
    for(const row of page.nodes){assert(!seen.has(row.id));seen.add(row.id);all.push(row)}
    if(!page.nextCursor)break;
    assert(++step<300,'pager must advance');
    page=await host.getTree({cursor:page.nextCursor,limit},context);
  }
  return all;
}
test('R11.2 Owned and Full use separately gated Registry operations and one generated facade',()=>{
  for(const id of ['createOwned','removeOwned'])
    assert.deepEqual(BROWSER_OPERATIONS['browser.bookmarks.'+id].requiredCapabilities,['browser.bookmarks']);
  for(const id of ['getTree','get','search','create','update','move','remove','prepareRemoveTree',
    'removeTree','observe.start','observe.read','observe.stop'])
    assert.deepEqual(BROWSER_OPERATIONS['browser.bookmarks.'+id].requiredCapabilities,['browser.bookmarks.full']);
  const sdk=createBrowserSdk({request:async()=>null});
  assert.equal(typeof sdk.bookmarks.createOwned,'function');
  assert.equal(typeof sdk.bookmarks.getTree,'function');
  assert.equal(typeof sdk.bookmarks.observe.read,'function');
  assert.equal(sdk.bookmarks.revokeAll,undefined);
  assert.throws(()=>normalizeBrowserOperation('browser.bookmarks.getTree',{limit:101}),error('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.bookmarks.create',{title:'x',url:'file:///etc/passwd'}),error('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.bookmarks.removeTree',{id:'2',ticket:'no'}),error('E_SCHEMA'));
});
for(const count of [500,550,1001])
test('R11.2 '+count+' bookmarks paginate completely within a fixed 12KB Host IPC',async()=>{
  const f=fixture(count),host=f.make(),rows=await pages(host);
  assert.equal(rows.length,count+3);assert.equal(rows[0].id,'0');assert.equal(rows[2].id,'2');
  assert.equal(rows.filter(n=>n.url?.startsWith('https://example.org/')).length,count);
});
test('R11.2 snapshot pages do not truncate or include mid-stream inserts; cursor binds owner and worker generation',async()=>{
  const f=fixture(550),host=f.make(),first=await host.getTree({limit:70},owner);
  await f.bookmarks.create({parentId:'2',title:'External',url:'https://example.net/'});
  const rows=await pages(host,owner,70,first);
  assert.equal(rows.length,553,'snapshot remained anchored at 550 initial leaves');
  // A forged package identity is rejected by the trusted authority before the
  // snapshot lookup. Missing/expired snapshots are a separate failure mode.
  await assert.rejects(host.getTree({cursor:first.nextCursor,limit:70},
    {...owner,packageHash:'b'.repeat(64)}),error('E_OWNER'));
  await assert.rejects(f.make().getTree({cursor:first.nextCursor,limit:70},owner),error('E_SNAPSHOT_EXPIRED'));
  const after=await pages(host);assert.equal(after.length,554);
});
test('R11.2 full CRUD uses expected preconditions and never deletes a nonempty folder as a simple leaf',async()=>{
  const f=fixture(1),host=f.make();
  const created=await host.create({parentId:'1',title:'New folder'},owner);
  assert.equal(created.parentId,'1');assert.equal(created.url,undefined);
  const link=await host.create({parentId:created.id,title:'Link',url:'https://example.com/'},owner);
  assert.equal(link.parentId,created.id);
  await assert.rejects(host.remove({id:created.id,expected:f.expected(created.id)},owner),error('E_BOOKMARK_NOT_EMPTY'));
  const updated=await host.update({id:link.id,expected:f.expected(link.id),
    changes:{title:'Renamed'}},owner);
  assert.equal(updated.title,'Renamed');
  await assert.rejects(host.update({id:link.id,expected:expected(link),changes:{title:'Stale'}},owner),
    error('E_BOOKMARK_STALE'));
  const moved=await host.move({id:link.id,expected:f.expected(link.id),
    destination:{parentId:'2'}},owner);
  assert.equal(moved.parentId,'2');
  assert.deepEqual(await host.remove({id:link.id,expected:f.expected(link.id)},owner),{removed:true});
  assert.deepEqual(await host.remove({id:created.id,expected:f.expected(created.id)},owner),{removed:true});
});
test('R11.2 protected browser folders, managed descendants and recursive moves fail closed',async()=>{
  const f=fixture(1),host=f.make();
  await assert.rejects(host.remove({id:'1',expected:f.expected('1')},owner),error('E_BOOKMARK_PROTECTED'));
  await assert.rejects(host.move({id:'2',expected:f.expected('2'),destination:{parentId:'2'}},owner),
    error('E_BOOKMARK_PROTECTED'));
  f.rows.get('10').unmodifiable='managed';
  const initial=await host.getTree({limit:80},owner);
  await assert.rejects(host.prepareRemoveTree({id:'2',snapshotRef:initial.snapshotRef,
    expected:f.expected('2'),descendantCount:1},owner),error('E_BOOKMARK_STALE'));
  assert.equal(f.effects.filter(x=>x[0]==='removeTree').length,0);
});
test('R11.2 deletion ticket is one-use; external mutation cancels the native recursive delete',async()=>{
  const f=fixture(2),host=f.make(),initial=await host.getTree({limit:80},owner);
  const args={id:'2',snapshotRef:initial.snapshotRef,expected:f.expected('2'),descendantCount:2};
  const prepared=await host.prepareRemoveTree(args,owner);
  f.rows.get('10').title='Edited by other Chrome window';
  await assert.rejects(host.removeTree({id:'2',ticket:prepared.ticket},owner),error('E_BOOKMARK_STALE'));
  await assert.rejects(host.removeTree({id:'2',ticket:prepared.ticket},owner),error('E_BOOKMARK_CONFIRM_EXPIRED'));
  assert.equal(f.effects.filter(x=>x[0]==='removeTree').length,0);
  const refresh=await host.getTree({limit:80},owner);
  const retry=await host.prepareRemoveTree({...args,snapshotRef:refresh.snapshotRef},owner);
  assert.deepEqual(await host.removeTree({id:'2',ticket:retry.ticket},owner),{removed:true});
  assert.equal(f.effects.filter(x=>x[0]==='removeTree').length,1);
});
test('R11.2 event queue reports overflow/gap, worker restart and owner mismatch explicitly',async()=>{
  const f=fixture(0),host=f.make(),watch=await host.observe.start({maxEvents:2,durationMs:30000},owner);
  for(let i=0;i<4;i++)f.emit('onChanged','2',{title:'V'+i});
  const page=await host.observe.read({sessionRef:watch.sessionRef,cursor:'0',limit:50},owner);
  assert.equal(page.events.length,2);assert.equal(page.gapCount,2);assert.equal(page.droppedCount,2);
  await assert.rejects(host.observe.read({sessionRef:watch.sessionRef,cursor:'0',limit:50},
    {...owner,packageHash:'b'.repeat(64)}),error('E_OWNER'));
  await assert.rejects(f.make().observe.read({sessionRef:watch.sessionRef,cursor:'0',limit:50},owner),
    error('E_SESSION_EXPIRED'));
  assert.deepEqual(await host.observe.stop({sessionRef:watch.sessionRef},owner),{stopped:true});
});
test('R11.2 Full authorization blocks writes and reads before Chrome and any write is dispatched once',async()=>{
  const f=fixture(1),host=f.make();
  f.allowed=false;
  await assert.rejects(host.getTree({limit:20},owner),error('E_BOOKMARK_FULL_CONSENT_REQUIRED'));
  await assert.rejects(host.create({parentId:'1',title:'Not allowed'},owner),error('E_BOOKMARK_FULL_CONSENT_REQUIRED'));
  assert.equal(f.effects.length,0);
  f.allowed=true;
  const bindings=createApprovedBrowserBindings({bookmarks:{
    getTree:(a,c)=>host.getTree(a,c),create:(a,c)=>host.create(a,c)
  }});
  let passes=0,creates=0;
  const original=f.bookmarks.create;f.bookmarks.create=async args=>{creates++;return original(args)};
  await assert.rejects(bindings.dispatch('browser.bookmarks.create',
    {title:'One',parentId:'1'},owner,{authorize:async()=>{if(++passes===2)
      throw Object.assign(Error('post-effect revoked'),{code:'E_TOOL_DISABLED'})}}),error('E_OUTCOME_UNKNOWN'));
  assert.equal(creates,1);
});

test('R11.2 SDK facade and single approved Dispatcher execute the eight Full CRUD calls',async()=>{
  const mock=fixture(2),full=mock.make();
  const service=Object.fromEntries(Object.entries(full).filter(([key])=>
    key!=='revokeAll'&&key!=='observe'));
  const bindings=createApprovedBrowserBindings({
    bookmarks:service,'bookmarks.observe':full.observe
  });
  const expectedRoutes=['getTree','get','search','create','update','move','remove',
    'prepareRemoveTree','removeTree','observe.start','observe.read','observe.stop'];
  for(const method of expectedRoutes)
    assert.equal(bindings.has('browser.bookmarks.'+method),true,method+' must use the one Dispatcher');
  assert.equal(bindings.has('browser.bookmarks.revokeAll'),false);
  let admissions=0;
  const sdk=createBrowserSdk({request:(operation,args)=>
    bindings.dispatch(operation,args,owner,{authorize:async(method,_input,context)=>{
      assert.equal(context,owner);
      assert.deepEqual(BROWSER_OPERATIONS[method].requiredCapabilities,['browser.bookmarks.full']);
      admissions++;
    }})
  });
  const first=await sdk.bookmarks.getTree({limit:20});
  assert.equal(first.nodes.length,5);
  assert.equal((await sdk.bookmarks.get({id:'10'}))[0].id,'10');
  assert.equal((await sdk.bookmarks.search({query:'Bookmark 0',limit:20})).nodes[0].id,'10');
  const folder=await sdk.bookmarks.create({parentId:'1',title:'SDK folder'});
  const link=await sdk.bookmarks.create({parentId:folder.id,title:'SDK link',
    url:'https://example.org/sdk-link'});
  const updated=await sdk.bookmarks.update({id:link.id,expected:mock.expected(link.id),
    changes:{title:'SDK edited'}});
  assert.equal(updated.title,'SDK edited');
  const moved=await sdk.bookmarks.move({id:link.id,expected:mock.expected(link.id),
    destination:{parentId:'2'}});
  assert.equal(moved.parentId,'2');
  assert.deepEqual(await sdk.bookmarks.remove({id:link.id,expected:mock.expected(link.id)}),
    {removed:true});
  const snapshot=await sdk.bookmarks.getTree({limit:20});
  const prepared=await sdk.bookmarks.prepareRemoveTree({id:'2',
    snapshotRef:snapshot.snapshotRef,expected:mock.expected('2'),descendantCount:2});
  assert.deepEqual(await sdk.bookmarks.removeTree({id:'2',ticket:prepared.ticket}),{removed:true});
  const watch=await sdk.bookmarks.observe.start({maxEvents:3,durationMs:10000});
  mock.emit('onChanged','1',{title:'Bookmarks bar'});
  const read=await sdk.bookmarks.observe.read({sessionRef:watch.sessionRef,cursor:'0',limit:3});
  assert.equal(read.events.length,1);
  assert.deepEqual(await sdk.bookmarks.observe.stop({sessionRef:watch.sessionRef}),{stopped:true});
  assert(admissions>=expectedRoutes.length*2,
    'Every approved method must pass authorization both before and after the native effect');
  assert.deepEqual(mock.effects.filter(x=>x[0]==='removeTree').map(x=>x[1]),['2']);
  // The trusted Side Panel's one-shot Chrome write-intent and real permission
  // prompts are separate Host admission checks, not emulated in this Node test.
});

test('R2.4 revocation during asynchronous write preflight prevents every native write',async()=>{
  for(const operation of ['create','update','move','remove']){
    const f=fixture(1),host=f.make();
    const node=f.expected('10');
    const original=f.bookmarks.get;
    f.bookmarks.get=async id=>{
      const result=await original(id);
      // Native reads can resolve after the installed Full grant was revoked.
      f.allowed=false;
      return result;
    };
    const args={
      create:{title:'Denied',parentId:'2'},
      update:{id:'10',expected:node,changes:{title:'Denied'}},
      move:{id:'10',expected:node,destination:{parentId:'1'}},
      remove:{id:'10',expected:node}
    }[operation];
    await assert.rejects(host[operation](args,owner),error('E_BOOKMARK_FULL_CONSENT_REQUIRED'));
    assert.equal(f.effects.length,0,operation+' must not reach Chrome after revocation');
  }
});

test('R2.4 create and move reject destinations below a managed ancestor',async()=>{
  const f=fixture(1),host=f.make();
  f.rows.set('3',{id:'3',title:'Managed',parentId:'1',index:1,unmodifiable:'managed'});
  f.rows.set('4',{id:'4',title:'Unmarked child',parentId:'3',index:0});
  await assert.rejects(host.create({title:'Denied',parentId:'4'},owner),error('E_BOOKMARK_PROTECTED'));
  await assert.rejects(host.move({id:'10',expected:f.expected('10'),destination:{parentId:'4'}},owner),
    error('E_BOOKMARK_PROTECTED'));
  assert.equal(f.effects.length,0);
});
