import test from 'node:test';
import assert from 'node:assert/strict';
import {createBookmarkService} from '../../src/bookmark-manager/service.js';
import {createBookmarkManager} from '../../src/bookmark-manager/trusted-ui.js';
import {bookmarkTree,isDescendant,asHttpUrl,parentFolder,projectBookmarkRows} from '../../src/bookmark-manager/model.js';

const initial=()=>[{id:'0',title:'root',children:[
 {id:'1',title:'Bookmarks bar',parentId:'0',folderType:'bookmarks-bar',children:[
   {id:'10',parentId:'1',title:'Dev',children:[{id:'100',parentId:'10',title:'Site',url:'https://example.com/'}]}
 ]},
 {id:'2',title:'Other bookmarks',parentId:'0',folderType:'other',children:[]},
 {id:'3',title:'Managed',parentId:'0',folderType:'managed',unmodifiable:'managed',children:[{id:'30',parentId:'3',title:'Restricted',children:[]}]}
]}];
function harness(permission=true){
 let roots=initial(),next=200;
 const listeners={};
 const event=name=>({addListener(fn){(listeners[name]??=new Set()).add(fn)},removeListener(fn){listeners[name]?.delete(fn)},emit(...args){for(const fn of listeners[name]??[])fn(...args)}});
 function tree(){return bookmarkTree(roots)}
 function locate(id){return tree().byId.get(id)}
 function insert(node,parentId){const walk=items=>{for(const it of items){if(it.id===parentId){it.children.push(node);return true}if(it.children&&walk(it.children))return true}return false};walk(roots)}
 function deleteNode(id){const walk=arr=>{for(let i=0;i<arr.length;i++){if(arr[i].id===id){arr.splice(i,1);return true}if(arr[i].children&&walk(arr[i].children))return true}return false};walk(roots)}
 const bookmarks={
  getTree:async()=>structuredClone(roots),
  create:async({title,url,parentId})=>{const node={id:String(next++),title,parentId,...(url?{url}:{children:[]})};insert(node,parentId);return node},
  update:async(id,changes)=>{const node=locate(id);const walk=arr=>{for(const it of arr){if(it.id===id){Object.assign(it,changes);return true}if(it.children&&walk(it.children))return true}return false};walk(roots);return {...node,...changes}},
  move:async(id,{parentId})=>{const copy=structuredClone(locate(id));deleteNode(id);copy.parentId=parentId;insert(copy,parentId);return copy},
  remove:async id=>deleteNode(id),removeTree:async id=>deleteNode(id),
  onCreated:event('created'),onRemoved:event('removed'),onChanged:event('changed'),onMoved:event('moved'),onChildrenReordered:event('reordered'),onImportEnded:event('imported')
 };
 const api={bookmarks,permissions:{contains:async()=>permission,onAdded:event('permission-added'),onRemoved:event('permission-removed')}};
 return {service:createBookmarkService(api),api,bookmarks,setPermission(v){permission=v},tree};
}
test('system and managed roots remain protected, ordinary children editable',()=>{
 const f=harness(),t=f.tree();
 assert.equal(t.byId.get('1').locked,true);
 assert.equal(t.byId.get('10').locked,false);
 assert.equal(t.byId.get('3').locked,true);
 assert.equal(t.byId.get('30').locked,true);
 assert.equal(isDescendant(t,'100','10'),true);
});
test('permission denied never requests Chrome permission in read/write service',async()=>{
 const f=harness(false);
 await assert.rejects(f.service.load(),/授权/);
 await assert.rejects(f.service.createFolder({title:'X',parentId:'1'}),/授权/);
 assert.equal(f.api.permissions.request,undefined);
});
test('create edit move delete real Chrome bookmark tree with mock',async()=>{
 const f=harness(),s=f.service;
 const folder=await s.createFolder({title:'Research',parentId:'2'});
 const link=await s.createBookmark({title:'Paper',url:'https://example.org/test',parentId:folder.id});
 assert.equal((await s.load()).byId.get(link.id).title,'Paper');
 await s.update({expected:(await s.load()).byId.get(link.id),title:'New paper',url:'https://example.net/'});
 await s.move({expected:(await s.load()).byId.get(link.id),parentId:'10'});
 assert.equal((await s.load()).byId.get(link.id).parentId,'10');
 await assert.rejects(s.remove({expected:(await s.load()).byId.get(link.id)}),/确认/);
 await s.remove({expected:(await s.load()).byId.get(link.id),confirmed:true});
 assert.equal((await s.load()).byId.has(link.id),false);
});
test('reject managed mutation, root deletion, cycles and unsafe protocols',async()=>{
 const f=harness(),s=f.service,t=await s.load();
 await assert.rejects(s.update({expected:t.byId.get('1'),title:'No'}),/保护/);
 await assert.rejects(s.remove({expected:t.byId.get('3'),confirmed:true}),/保护/);
 await assert.rejects(s.createFolder({title:'X',parentId:'3'}),/保护/);
 await assert.rejects(s.createFolder({title:'X',parentId:'0'}),/保护/);
 await assert.rejects(s.move({expected:t.byId.get('10'),parentId:'10'}),/自身/);
 await assert.rejects(s.createBookmark({title:'JS',url:'javascript:alert(1)',parentId:'1'}),/HTTP/);
 assert.throws(()=>asHttpUrl('https://user:pw@example.com/'),/普通/);
});
test('reject stale content and permission revoked before mutation',async()=>{
 const f=harness(),s=f.service,t=await s.load();
 await f.bookmarks.update('100',{title:'External change'});
 await assert.rejects(s.remove({expected:t.byId.get('100'),confirmed:true}),/变化/);
 f.setPermission(false);
 await assert.rejects(s.move({expected:t.byId.get('10'),parentId:'2'}),/授权/);
});
test('releases bookmark and permission observers on close',()=>{
 const f=harness();let n=0;const release=f.service.onChange(()=>n++);
 f.bookmarks.onChanged.emit();f.api.permissions.onRemoved.emit({permissions:['bookmarks']});assert.equal(n,2);
 f.api.permissions.onAdded.emit({permissions:['history']});assert.equal(n,2);
 f.api.permissions.onAdded.emit({permissions:['bookmarks']});assert.equal(n,3);
 release();f.bookmarks.onChanged.emit();f.api.permissions.onRemoved.emit({permissions:['bookmarks']});
 f.api.permissions.onAdded.emit({permissions:['bookmarks']});assert.equal(n,3);
});

test('folder removal rejects stale subtree and only removes explicitly reviewed descendants',async()=>{
 const f=harness(),s=f.service;
 const folder=await s.createFolder({title:'Nested',parentId:'2'});
 await s.createBookmark({title:'One',url:'https://one.example/',parentId:folder.id});
 const before=await s.load(),expected=before.byId.get(folder.id);
 const oldDescendants=[...before.byId.keys()].filter(id=>id!==folder.id&&isDescendant(before,id,folder.id));
 await s.createBookmark({title:'New',url:'https://two.example/',parentId:folder.id});
 await assert.rejects(s.remove({expected,confirmed:true,expectedDescendantIds:oldDescendants}),/变化/);
 const newest=await s.load(),children=[...newest.byId.keys()].filter(id=>id!==folder.id&&isDescendant(newest,id,folder.id));
 await s.remove({expected:newest.byId.get(folder.id),confirmed:true,expectedDescendantIds:children});
 assert.equal((await s.load()).byId.has(folder.id),false);
});

test('pagination reaches every visible row and search includes items beyond the first 200',()=>{
 const roots=initial(),children=roots[0].children[0].children;
 for(let index=0;index<550;index++)children.push({
   id:String(1000+index),parentId:'1',title:'Needle '+index,url:'https://example.com/item/'+index
 });
 const tree=bookmarkTree(roots),expanded=new Set(['1']);
 const folded=projectBookmarkRows(tree,{expanded:new Set(),limit:200});
 assert.equal(folded.total,3,'collapsed folder children are not counted as visible rows');
 const first=projectBookmarkRows(tree,{expanded,limit:200});
 assert.equal(first.total,554);
 assert.equal(first.rows.length,200);
 assert.equal(projectBookmarkRows(tree,{expanded,limit:400}).rows.length,400);
 const complete=projectBookmarkRows(tree,{expanded,limit:1000});
 assert.equal(complete.rows.length,complete.total);
 assert.equal(complete.rows.at(-1).item.id,'1549');
 const found=projectBookmarkRows(tree,{search:'Needle 549',limit:200});
 assert.equal(found.total,1);
 assert.equal(found.rows[0].item.id,'1549','search must not stop at the first 200 tree nodes');
 const matches=projectBookmarkRows(tree,{search:'Needle',limit:200});
 assert.equal(matches.total,550);
 assert.equal(matches.rows.length,200);
 assert.equal(projectBookmarkRows(tree,{search:'Needle',limit:600}).rows.length,550);
 assert.throws(()=>projectBookmarkRows(tree,{limit:0}),/数量/);
});

test('Chrome managed folderType cannot be selected as a writable parent without unmodifiable',()=>{
 const roots=initial();
 delete roots[0].children[2].unmodifiable;
 const tree=bookmarkTree(roots);
 assert.equal(tree.byId.get('3').locked,true);
 assert.throws(()=>parentFolder(tree,'3'),/保护/);
 assert.equal(parentFolder(tree,'1').id,'1','ordinary Chrome root folders remain writable');
});

test('trusted Side Panel tree shows more than 200 rows, searches later rows and handles revoke/regrant',async()=>{
 const f=harness();
 for(let index=0;index<420;index++){
   await f.bookmarks.create({title:'Needle '+index,url:'https://example.com/'+index,parentId:'1'});
 }
 const listeners=new Map(),container={
   hidden:true,innerHTML:'',
   addEventListener(name,fn){listeners.set(name,fn)},
   removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name)},
   contains:()=>true,
   querySelector:()=>({focus(){},setSelectionRange(){}}),
   querySelectorAll:()=>[]
 };
 const manager=createBookmarkManager({api:f.api,doc:{},container});
 assert.ok(manager);
 const settled=async predicate=>{
   for(let n=0;n<50;n++){
     if(predicate())return;
     await new Promise(resolve=>setTimeout(resolve,5));
   }
   assert.fail('trusted bookmark UI did not settle');
 };
 const displayed=()=>[...container.innerHTML.matchAll(/class="bm-node /g)].length;
 const click=(bm,id)=>{
   const item={dataset:{bm,id}};
   listeners.get('click')({target:{closest:()=>item}});
 };
 manager.open();
 await settled(()=>displayed()===200);
 assert.match(container.innerHTML,/已显示 200 \/ 424 项/);
 click('more-results');
 assert.equal(displayed(),400);
 click('more-results');
 assert.equal(displayed(),424);
 assert.doesNotMatch(container.innerHTML,/data-bm="more-results"/);
 listeners.get('input')({target:{id:'bookmark-manager-search',value:'Needle 419',selectionStart:10},isComposing:false});
 assert.equal(displayed(),1);
 assert.match(container.innerHTML,/data-id="619"/,'the last bookmark must be searchable');
 f.setPermission(false);f.api.permissions.onRemoved.emit({permissions:['bookmarks']});
 await settled(()=>container.innerHTML.includes('授权访问书签'));
 assert.equal(displayed(),0,'revoked permissions must not look like an empty tree');
 f.setPermission(true);f.api.permissions.onAdded.emit({permissions:['bookmarks']});
 await settled(()=>displayed()===1);
 manager.close();
 assert.equal(container.hidden,true);
 manager.dispose();
 assert.equal(listeners.size,0,'dispose must retire DOM observers');
});
