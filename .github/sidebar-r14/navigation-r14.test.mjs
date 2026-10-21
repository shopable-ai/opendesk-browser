import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
const defer=()=>{
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
};
class Element {
 constructor(id){
  this.id=id;this.value='';this.textContent='';this.dataset={};this.events={};
  this.children=[];this.hidden=false;this.disabled=false;this.scrollTop=0;
  this.classList={add(){}};
 }
 addEventListener(type,callback){(this.events[type]??=[]).push(callback);}
 async fire(type,event={}){const action={preventDefault(){},stopPropagation(){},...event};for(const callback of this.events[type]||[])await callback(action);}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(key,value){this[key]=value;}
 focus(){this.focused=true;}
 remove(){this.removed=true;}
 contains(node){return node===this||this.children.some(child=>child?.contains?.(node));}
}
const articles=[
 {id:'note-a',kind:'note',title:'正文 A',body:'正文 A 的完整内容',createdAt:'2026-10-21T00:00:00Z',updatedAt:'2026-10-21T00:00:00Z'},
 {id:'note-b',kind:'note',title:'正文 B',body:'正文 B 的完整内容',createdAt:'2026-10-21T00:00:00Z',updatedAt:'2026-10-21T00:00:00Z'}
];
async function setup(){
 const source=await readFile(new URL('../src/notes.js',import.meta.url),'utf8');
 const ids=[...source.matchAll(/q\('([^']+)'\)/g)].map(match=>match[1]);
 const elements=Object.fromEntries([...new Set(ids)].map(id=>[id,new Element(id)]));
 const document={
  scrollingElement:{scrollTop:0},documentElement:{scrollTop:0},
  createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag)
 };
 const root=new Element('root');root.ownerDocument=document;
 root.querySelector=key=>elements[key.slice(1)];root.matches=()=>false;
 elements['clip-home'].hidden=false;elements['clip-notes'].hidden=true;
 elements['clip-kind-filter'].value='all';
 const timers=[],navigation=[],states=[],getCalls=[],editCalls=[];
 const stored=new Map(articles.map(item=>[item.id,{...item}]));
 let manualGet=false,holdEdit=null;
 const snapshot=id=>({item:{...stored.get(id)},etag:'etag-v1'});
 const request=async(operation,payload={})=>{
  if(operation==='clipNotes.list'){
   const query=String(payload.query||'');
   const matched=[...stored.values()].filter(item=>
    (payload.kind===undefined||payload.kind===item.kind)&&
    (item.title.includes(query)||item.body.includes(query)));
   return {items:matched.slice(payload.offset||0).map(({body,...rest})=>({...rest,excerpt:body})),
    total:stored.size,matched:matched.length,usedBytes:100,etag:'etag-v1',nextOffset:null};
  }
  if(operation==='clipNotes.get'){
   if(!stored.has(payload.id))throw Object.assign(new Error('not found'),{code:'E_NOT_FOUND'});
   if(manualGet){
    const pending=defer();getCalls.push({id:payload.id,...pending});
    return pending.promise;
   }
   return snapshot(payload.id);
  }
  if(operation==='clipNotes.edit'){
   editCalls.push({...payload});
   if(holdEdit)await holdEdit.promise;
   const previous=stored.get(payload.id);
   stored.set(payload.id,{...previous,body:payload.body});
   return {id:payload.id,unchanged:false};
  }
  throw new Error('Unexpected Host request: '+operation);
 };
 const context={OpenDeskTool:{
  setNavigation:state=>navigation.push(state.page),
  setState:state=>states.push(state)
 }};
 runInNewContext(source,{globalThis:context,document,TextEncoder,URL,Date,Math,
  requestAnimationFrame:fn=>fn(),
  setTimeout:(fn,ms)=>{const timer={fn,ms,active:true};timers.push(timer);return timer;},
  clearTimeout:timer=>{if(timer)timer.active=false;}});
 const notes=context.OpenDeskClipNotes.create({root,request,sdk:{},
  renderMarkdown:(body,target)=>{target.textContent=body;}});
 await flush();
 return {elements,root,document,notes,navigation,states,timers,getCalls,editCalls,snapshot,
  setManualGet(value){manualGet=value;},
  holdEdit(){holdEdit=defer();return holdEdit;},
  reader(){return elements['clip-note-read-title'].textContent;},
  row(index=0){return elements['clip-note-list'].children[index];},
  recent(index=0){return elements['clip-recent-list'].children[index];}
 };
}
test('R1.4: 180ms search debounce cannot cancel an already selected 240ms detail read',async()=>{
 const f=await setup(),e=f.elements;
 await f.notes.showLibrary();f.document.scrollingElement.scrollTop=170;
 e['clip-search'].value='正文';await e['clip-search'].fire('input');
 assert.equal(f.timers.at(-1).ms,180);
 f.setManualGet(true);
 await f.row(0).children[0].fire('click');
 assert.equal(f.getCalls[0].id,'note-a');
 f.timers.at(-1).fn();await flush(); // Debounced list refresh races the pending get.
 assert.equal(e['clip-note-list'].children.length,2);
 f.getCalls[0].resolve(f.snapshot('note-a'));await flush();
 assert.equal(f.reader(),'正文 A');
 assert.equal(e['clip-notes'].dataset.view,'reading');
 assert.equal(f.navigation.at(-1),'reader');
 await e['clip-note-reader-back'].fire('click');
 assert.equal(e['clip-notes'].dataset.view,'list');
 assert.equal(e['clip-search'].value,'正文');
 assert.equal(f.document.scrollingElement.scrollTop,170,'list scroll position restored');
});
test('R1.4: newest detail wins and leaving the library makes old responses inert',async()=>{
 const f=await setup(),e=f.elements;
 await f.notes.showLibrary();f.setManualGet(true);
 await f.row(0).children[0].fire('click');
 await f.row(1).children[0].fire('click');
 assert.deepEqual(f.getCalls.map(entry=>entry.id),['note-a','note-b']);
 f.getCalls[1].resolve(f.snapshot('note-b'));await flush();
 assert.equal(f.reader(),'正文 B');
 f.getCalls[0].resolve(f.snapshot('note-a'));await flush();
 assert.equal(f.reader(),'正文 B','first response may not overwrite newer explicit choice');
 await e['clip-note-reader-back'].fire('click');
 await f.row(0).children[0].fire('click');
 assert.equal(f.getCalls.length,3);
 await f.root.fire('opendesk-tool-navigation',{detail:{action:'back'}});
 assert.equal(e['clip-home'].hidden,false,'back leaves library before response');
 f.getCalls[2].resolve(f.snapshot('note-a'));await flush();
 assert.equal(e['clip-home'].hidden,false,'old detail must not reopen exited page');
 assert.equal(f.navigation.at(-1),'home');
});
test('R1.4: editing lookup is independent of filtering; dirty discard and scroll survive',async()=>{
 const f=await setup(),e=f.elements;
 await f.notes.showLibrary();f.document.scrollingElement.scrollTop=96;
 f.setManualGet(true);
 await f.row(0).children[1].children[0].fire('click');
 assert.equal(f.getCalls[0].id,'note-a');
 e['clip-kind-filter'].value='note';await e['clip-kind-filter'].fire('change');await flush();
 f.getCalls[0].resolve(f.snapshot('note-a'));await flush();
 assert.equal(e['clip-notes'].dataset.view,'editing');
 assert.equal(e['clip-note-body'].value,'正文 A 的完整内容');
 e['clip-note-body'].value='尚未保存';await e['clip-note-body'].fire('input');
 await f.root.fire('opendesk-tool-navigation',{detail:{action:'back'}});
 assert.equal(e['clip-note-unsaved'].hidden,false,'dirty edit requires confirmation');
 assert.equal(e['clip-note-body'].value,'尚未保存');
 await e['clip-note-discard'].fire('click');
 assert.equal(e['clip-notes'].dataset.view,'list');
 assert.equal(f.document.scrollingElement.scrollTop,96);
 assert.equal(e['clip-kind-filter'].value,'note');
});
test('R1.4: reader edit/save has a busy navigation lock and returns to updated reader',async()=>{
 const f=await setup(),e=f.elements;
 await f.notes.showLibrary();f.document.scrollingElement.scrollTop=122;
 await f.row(1).children[0].fire('click');await flush();
 assert.equal(f.reader(),'正文 B');
 await e['clip-note-read-edit'].fire('click');
 e['clip-note-body'].value='B 更新 Markdown';await e['clip-note-body'].fire('input');
 const hold=f.holdEdit();
 await e['clip-note-save'].fire('click');await flush();
 assert.equal(f.editCalls.length,1,'exactly one edit issued');
 await e['clip-note-save'].fire('click');
 await f.root.fire('opendesk-tool-navigation',{detail:{action:'back'}});
 assert.equal(e['clip-notes'].dataset.view,'editing','busy back is rejected');
 assert.equal(f.editCalls.length,1,'busy double click must not duplicate the write');
 hold.resolve();await flush();
 assert.equal(e['clip-notes'].dataset.view,'reading');
 assert.equal(e['clip-note-read-body'].textContent,'B 更新 Markdown');
 assert.equal(f.states.at(-1).busy,false);
 await e['clip-note-reader-back'].fire('click');
 assert.equal(f.document.scrollingElement.scrollTop,122);
});
