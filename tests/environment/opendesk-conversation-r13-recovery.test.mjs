import test from 'node:test';
import assert from 'node:assert/strict';
import '../../examples/sidebar-tools/bookmark-manager/src/model.js';
import '../../examples/sidebar-tools/bookmark-manager/src/service.js';
import {executeBookmarkPlan} from '../../src/ui/conversation/bookmark-actions.js';

// Actual business adapter + actual Service/model; SDK receipts are local fixtures.
// No Chrome, Provider, Host authorization or native PASS is claimed here.
function fixture(){
 const nodes=[{id:'0',title:'root'},
  {id:'1',title:'书签栏',parentId:'0'},
  {id:'2',title:'其他',parentId:'0'},
  {id:'folder',title:'工作',parentId:'1'},
  {id:'destination',title:'目标',parentId:'2'},
  {id:'bookmark',title:'原书签',url:'https://example.com/',parentId:'folder'}];
 const writes=[];let next=0;
 const f={nodes,writes,status:async()=>({callableNow:true})};
 const sdk={capabilities:{
  list:async()=>globalThis.BookmarkR2Service.METHODS.map(name=>({
   operation:'browser.bookmarks.'+name,
   requiredCapabilities:['browser.bookmarks.full'],status:{callableNow:true}})),
  getStatus:({operation})=>f.status(operation)
 },bookmarks:{}};
 for(const name of globalThis.BookmarkR2Service.METHODS){
  const parts=name.split('.');let owner=sdk.bookmarks;
  for(const part of parts.slice(0,-1))owner=owner[part]??={};
  owner[parts.at(-1)]=async()=>({});
 }
 sdk.bookmarks.getTree=async()=>({snapshotRef:'local_snapshot_123456',
  nodes:structuredClone(nodes),nextCursor:null});
 sdk.bookmarks.create=async args=>{
  writes.push({type:'create',args});
  const node={id:'created-'+(++next),title:args.title,parentId:args.parentId,
   ...(args.url?{url:args.url}:{})};nodes.push(node);return {...node};
 };
 sdk.bookmarks.update=async args=>{
  writes.push({type:'update',args});
  const node=nodes.find(n=>n.id===args.id);Object.assign(node,args.changes);return {...node};
 };
 sdk.bookmarks.move=async args=>{
  writes.push({type:'move',args});
  const node=nodes.find(n=>n.id===args.id);Object.assign(node,args.destination);return {...node};
 };
 f.sdk=sdk;f.service=globalThis.BookmarkR2Service.create(sdk);
 f.context={currentFolderId:'folder',selectedId:'bookmark'};
 f.run=(actions,options={})=>executeBookmarkPlan({plan:{actions},
  service:f.service,context:f.context,...options});
 return f;
}
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes});return {promise,resolve}};
const folder={type:'folder.create',title:'新目录'};
const bookmark={type:'bookmark.create',title:'新书签',url:'https://example.org/'};
const rename={type:'bookmark.update',target:'$selected',title:'新名称'};
const move={type:'bookmark.move',target:'$selected',parent:'目标'};

for(const action of [folder,bookmark,{...move,parent:'其他'}]){
 test('R1.3 system folders remain valid destinations for '+action.type,async()=>{
  const f=fixture();f.context.currentFolderId='1';
  const result=await f.run([action]);
  assert.equal(result.messages.length,1);
  assert.equal(f.writes.length,1);
  assert.equal(result.tree.byId.get(result.refs.folderId||result.refs.bookmarkId).parentId,
   action.type==='bookmark.move'?'2':'1');
 });
}
for(const action of [{...folder,title:'  新目录  '},
 {...bookmark,title:'  新书签  ',url:'https://EXAMPLE.org:443'},
 {...rename,title:'  新名称  '}]){
 test('R1.3 Service normalization is verified as success for '+action.type,async()=>{
  const f=fixture(),result=await f.run([action]);
  assert.equal(result.messages.length,1);
  assert.equal(f.writes.length,1);
  const node=result.tree.byId.get(result.refs.folderId||result.refs.bookmarkId);
  assert.equal(node.title,action.title.trim());
  if(action.type==='bookmark.create')assert.equal(node.url,'https://example.org/');
 });
}
for(const action of [folder,bookmark,rename,move]){
 test('R1.3 Stop during Service preflight prevents SDK dispatch for '+action.type,async()=>{
  const f=fixture(),entered=deferred(),release=deferred(),controller=new AbortController();
  const operation=action.type.endsWith('.create')?'create':action.type.split('.')[1];
  f.status=async op=>{
   if(op==='browser.bookmarks.'+operation){entered.resolve();await release.promise}
   return {callableNow:true};
  };
  const pending=f.run([action],{signal:controller.signal});
  const rejection=assert.rejects(pending,error=>{
   assert.equal(error.code,'E_CANCELLED');assert.equal(error.writeIssued,false);return true;
  });
  await entered.promise;controller.abort();release.resolve();await rejection;
  assert.equal(f.writes.length,0);
 });
 test('R1.3 revoked preflight stays definite and recoverable for '+action.type,async()=>{
  const f=fixture();
  const operation=action.type.endsWith('.create')?'create':action.type.split('.')[1];
  f.status=async op=>op==='browser.bookmarks.'+operation?
   {callableNow:false,reasonCode:'E_GRANT_REVOKED'}:{callableNow:true};
  await assert.rejects(f.run([action]),error=>{
   assert.equal(error.code,'E_GRANT_REVOKED');assert.equal(error.writeIssued,false);
   assert.deepEqual(error.partial,[]);return true;
  });
  assert.equal(f.writes.length,0);
  f.status=async()=>({callableNow:true});
  assert.equal((await f.run([action])).messages.length,1);
  assert.equal(f.writes.length,1,'only a new explicit request after restored grant writes');
 });
}
for(const reference of ['target','parent']){
 test('R1.3 a same-name replacement during thinking is rejected for '+reference,async()=>{
  const f=fixture(),expectedTree=await f.service.load();
  const prior=f.nodes.find(n=>n.id===(reference==='target'?'bookmark':'destination'));
  f.nodes.splice(f.nodes.indexOf(prior),1,{...prior,id:'replacement'});
  const action=reference==='target'?{...rename,target:prior.title}:move;
  await assert.rejects(f.run([action],{expectedTree}),error=>
   error.code==='E_BOOKMARK_STALE'&&error.writeIssued===false);
  assert.equal(f.writes.length,0);
 });
}

test('R1.3 bare-origin URL succeeds through the actual Service and readback',async()=>{
 const f=fixture(),result=await f.run([{...bookmark,url:'https://example.com'}]);
 assert.equal(result.messages.length,1);
 assert.equal(result.tree.byId.get(result.refs.bookmarkId).url,'https://example.com/');
 assert.equal(f.writes.length,1);
 assert.deepEqual(f.writes[0].args,{title:bookmark.title,url:'https://example.com/',parentId:'folder'});
});

test('R1.3 an already stopped request performs no tree read or SDK write',async()=>{
 const f=fixture(),controller=new AbortController();let reads=0;
 f.sdk.bookmarks.getTree=async()=>{reads++;throw Error('must not read')};
 controller.abort();
 await assert.rejects(f.run([folder],{signal:controller.signal}),error=>
  error.code==='E_CANCELLED'&&error.writeIssued===false);
 assert.equal(reads,0);assert.equal(f.writes.length,0);
});

for(const action of [folder,bookmark,rename,move]){
 test('R1.3 a preflight timeout has no write outcome for '+action.type,async()=>{
  const f=fixture(),operation=action.type.endsWith('.create')?'create':action.type.split('.')[1];
  f.status=async op=>{
   if(op==='browser.bookmarks.'+operation)throw Object.assign(Error('status timeout'),{code:'E_TIMEOUT'});
   return {callableNow:true};
  };
  await assert.rejects(f.run([action,folder]),error=>{
   assert.equal(error.code,'E_SDK_STATUS');assert.equal(error.writeIssued,false);
   assert.deepEqual(error.partial,[]);return true;
  });
  assert.equal(f.writes.length,0);
 });
 for(const code of ['E_TIMEOUT','E_OUTCOME_UNKNOWN','E_GRANT_REVOKED','E_CANCELLED']){
  test('R1.3 '+code+' after SDK dispatch never replays '+action.type,async()=>{
   const f=fixture(),operation=action.type.endsWith('.create')?'create':action.type.split('.')[1];
   const original=f.sdk.bookmarks[operation];
   f.sdk.bookmarks[operation]=async args=>{
    await original(args);throw Object.assign(Error('receipt lost'),{code});
   };
   await assert.rejects(f.run([action,folder]),error=>{
    assert.equal(error.code,'E_OUTCOME_UNKNOWN');assert.equal(error.writeIssued,true);
    assert.equal(error.cause.code,code);assert.deepEqual(error.partial,[]);
    assert.equal(error.refs.folderId,null);assert.equal(error.refs.bookmarkId,null);return true;
   });
   assert.equal(f.writes.length,1,'no replay and no later mutation');
   const refreshed=await f.service.load();
   assert.ok([...refreshed.byId.values()].some(n=>action.type==='bookmark.move'?
    n.id==='bookmark'&&n.parentId==='destination':n.title===action.title));
   assert.equal(f.writes.length,1,'refresh is read-only');
  });
 }
}

test('R1.3 same-name directories require a path; verified last-folder IDs survive ambiguity',async()=>{
 const f=fixture();
 f.nodes.push({id:'other-work',title:'工作',parentId:'2'});
 await assert.rejects(f.run([{...bookmark,parent:'工作'}]),error=>{
  assert.equal(error.code,'E_BOOKMARK_AMBIGUOUS');assert.equal(error.writeIssued,false);
  assert.match(error.message,/书签栏 \/ 工作/);assert.match(error.message,/其他 \/ 工作/);return true;
 });
 assert.equal(f.writes.length,0);
 const first=await f.run([{...folder,title:'工作'},
  {...bookmark,parent:'$lastFolder'}],{expectedTree:await f.service.load()});
 assert.notEqual(first.refs.folderId,'folder');
 assert.notEqual(first.refs.folderId,'other-work');
 assert.equal(first.tree.byId.get(first.refs.bookmarkId).parentId,first.refs.folderId);
 const second=await f.run([{...rename,target:'$lastBookmark'}],{refs:first.refs});
 assert.equal(second.refs.bookmarkId,first.refs.bookmarkId);
 const moved=await f.run([{...move,parent:'其他 / 工作'}]);
 assert.equal(moved.tree.byId.get('bookmark').parentId,'other-work');
});

test('R1.3 duplicate bookmark names are not treated as an implicit selected ID',async()=>{
 const f=fixture();
 f.nodes.push({id:'duplicate',title:'原书签',url:'https://other.example/',parentId:'destination'});
 await assert.rejects(f.run([{...rename,target:'原书签'}]),error=>
  error.code==='E_BOOKMARK_AMBIGUOUS'&&error.writeIssued===false);
 assert.equal(f.writes.length,0);
 const result=await f.run([{...rename,target:'书签栏 / 工作 / 原书签'}]);
 assert.equal(result.refs.bookmarkId,'bookmark');
 assert.equal(f.nodes.find(n=>n.id==='duplicate').title,'原书签');
});

for(const [field,changed] of [['title','外部改名'],['url','https://changed.example/'],['parentId','destination']]){
 test('R1.3 thinking-time '+field+' change keeps the original bookmark untouched',async()=>{
  const f=fixture(),expectedTree=await f.service.load();
  f.nodes.find(n=>n.id==='bookmark')[field]=changed;
  await assert.rejects(f.run([rename],{expectedTree}),error=>
   error.code==='E_BOOKMARK_STALE'&&error.writeIssued===false);
  assert.equal(f.writes.length,0);assert.equal(f.nodes.find(n=>n.id==='bookmark')[field],changed);
 });
}

test('R1.3 a selected bookmark removed during thinking is never replaced by a namesake',async()=>{
 const f=fixture(),expectedTree=await f.service.load();
 f.nodes.splice(f.nodes.findIndex(n=>n.id==='bookmark'),1,
  {id:'namesake',title:'原书签',url:'https://example.com/',parentId:'folder'});
 await assert.rejects(f.run([rename],{expectedTree}),error=>
  error.code==='E_BOOKMARK_STALE'&&error.writeIssued===false);
 assert.equal(f.writes.length,0);
});

test('R1.3 Service detects a change after the adapter snapshot before dispatch',async()=>{
 const f=fixture(),read=f.sdk.bookmarks.getTree;let reads=0;
 f.sdk.bookmarks.getTree=async args=>{
  if(++reads===2)f.nodes.find(n=>n.id==='bookmark').title='外部改名';
  return read(args);
 };
 await assert.rejects(f.run([rename]),error=>
  error.code==='E_BOOKMARK_STALE'&&error.writeIssued===false);
 assert.equal(f.writes.length,0);assert.equal(f.nodes.find(n=>n.id==='bookmark').title,'外部改名');
});

for(const action of [folder,bookmark]){
 for(const receipt of ['missing-id','not-in-readback','wrong-kind','wrong-title','wrong-parent','wrong-url']){
  if(receipt==='wrong-url'&&action.type==='folder.create')continue;
  test('R1.3 '+receipt+' cannot publish a new ID for '+action.type,async()=>{
   const f=fixture(),original=f.sdk.bookmarks.create;
   f.sdk.bookmarks.create=async args=>{
    const result=await original(args),node=f.nodes.find(n=>n.id===result.id);
    if(receipt==='missing-id')return {};
    if(receipt==='not-in-readback')return {...result,id:'never-read-back'};
    if(receipt==='wrong-kind'){
     if(action.type==='folder.create')node.url='https://unexpected.example/';else delete node.url;
    }
    if(receipt==='wrong-title')node.title='其他名称';
    if(receipt==='wrong-parent')node.parentId='destination';
    if(receipt==='wrong-url')node.url='https://other.example/';
    return result;
   };
   const published=[];
   await assert.rejects(f.run([action,folder],{onStep:step=>published.push(step)}),error=>{
    assert.equal(error.code,'E_OUTCOME_UNKNOWN');assert.equal(error.writeIssued,true);
    assert.deepEqual(error.partial,[]);assert.equal(error.refs.folderId,null);
    assert.equal(error.refs.bookmarkId,null);return true;
   });
   assert.deepEqual(published,[]);assert.equal(f.writes.length,1);
  });
 }
}

test('R1.3 a confirmed first step survives later revocation and only a new request resumes',async()=>{
 const f=fixture();let denied=false;
 f.status=async op=>denied&&op==='browser.bookmarks.create'?
  {callableNow:false,reasonCode:'E_GRANT_REVOKED'}:{callableNow:true};
 let retained;
 await assert.rejects(f.run([folder,{...bookmark,parent:'$lastFolder'}],{
  onStep:()=>{denied=true;}
 }),error=>{
  assert.equal(error.code,'E_GRANT_REVOKED');assert.equal(error.writeIssued,false);
  assert.equal(error.partial.length,1);assert.ok(error.refs.folderId);
  assert.equal(error.refs.bookmarkId,null);retained=error.refs;return true;
 });
 assert.equal(f.writes.length,1);denied=false;
 const resumed=await f.run([{...bookmark,parent:'$lastFolder'}],{refs:retained});
 assert.equal(resumed.tree.byId.get(resumed.refs.bookmarkId).parentId,retained.folderId);
 assert.equal(f.writes.length,2);assert.equal(f.writes.filter(w=>!w.args.url).length,1);
});

test('R1.3 a confirmed first ID survives a second applied write with a lost receipt',async()=>{
 const f=fixture(),original=f.sdk.bookmarks.create;let retained;
 f.sdk.bookmarks.create=async args=>{
  const result=await original(args);
  if(args.url)throw Object.assign(Error('lost receipt'),{code:'E_TIMEOUT'});
  return result;
 };
 await assert.rejects(f.run([folder,{...bookmark,parent:'$lastFolder'},rename]),error=>{
  assert.equal(error.code,'E_OUTCOME_UNKNOWN');assert.equal(error.writeIssued,true);
  assert.equal(error.partial.length,1);assert.ok(error.refs.folderId);
  assert.equal(error.refs.bookmarkId,null);retained=error.refs;return true;
 });
 assert.equal(f.writes.length,2);
 const refreshed=await f.service.load();
 assert.ok([...refreshed.byId.values()].some(n=>n.title===bookmark.title&&n.parentId===retained.folderId));
 assert.equal(f.writes.length,2);
});

test('R1.3 revocation after SDK success before readback retains an unknown outcome',async()=>{
 const f=fixture(),original=f.sdk.bookmarks.create;let revoked=false;
 f.status=async op=>revoked&&op==='browser.bookmarks.getTree'?
  {callableNow:false,reasonCode:'E_GRANT_REVOKED'}:{callableNow:true};
 f.sdk.bookmarks.create=async args=>{const result=await original(args);revoked=true;return result;};
 await assert.rejects(f.run([bookmark,folder]),error=>{
  assert.equal(error.code,'E_OUTCOME_UNKNOWN');assert.equal(error.writeIssued,true);
  assert.equal(error.cause.code,'E_GRANT_REVOKED');assert.equal(error.refs.bookmarkId,null);
  assert.deepEqual(error.partial,[]);return true;
 });
 assert.equal(f.writes.length,1);revoked=false;
 const refreshed=await f.service.load();
 assert.ok([...refreshed.byId.values()].some(n=>n.title===bookmark.title));
 assert.equal(f.writes.length,1);
});

test('R1.3 Stop after dispatch verifies the completed write and prevents the next one',async()=>{
 const f=fixture(),original=f.sdk.bookmarks.create,entered=deferred(),release=deferred();
 const controller=new AbortController();
 f.sdk.bookmarks.create=async args=>{
  const result=await original(args);entered.resolve();await release.promise;return result;
 };
 const pending=f.run([folder,bookmark],{signal:controller.signal});
 const rejection=assert.rejects(pending,error=>{
  assert.equal(error.code,'E_CANCELLED');assert.equal(error.writeIssued,false);
  assert.equal(error.partial.length,1);assert.ok(error.refs.folderId);
  assert.equal(error.refs.bookmarkId,null);return true;
 });
 await entered.promise;controller.abort();release.resolve();await rejection;
 assert.equal(f.writes.length,1);
});

for(const parentId of ['0','managed','managed-child']){
 test('R1.3 root and managed destinations stay protected: '+parentId,async()=>{
  const f=fixture();
  f.nodes.push({id:'managed',title:'受管',parentId:'0',unmodifiable:'managed'},
   {id:'managed-child',title:'受管子目录',parentId:'managed'});
  f.context.currentFolderId=parentId;
  await assert.rejects(f.run([folder]),error=>
   error.code==='E_BOOKMARK_STALE'&&error.writeIssued===false);
  assert.equal(f.writes.length,0);
 });
}

for(const action of [rename,move]){
 test('R1.3 system folders are destinations but not mutation targets for '+action.type,async()=>{
  const f=fixture();f.context.selectedId='1';
  await assert.rejects(f.run([action]),error=>
   error.code==='E_BOOKMARK_STALE'&&error.writeIssued===false);
  assert.equal(f.writes.length,0);
 });
}
