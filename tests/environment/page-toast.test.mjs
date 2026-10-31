import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFile} from 'node:fs/promises';
import {showPageToast} from '../../src/scripting/user-scripts/page-toast.js';
import {createPageUI} from '../../src/scripting/user-scripts/page-ui.js';
import {requestPageToast} from '../../src/platform/chrome/page-toast.js';

class Element extends EventTarget{
  constructor(tag,doc){super();Object.assign(this,{tagName:tag.toUpperCase(),ownerDocument:doc,children:[],style:{setProperty(key,value){this[key.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value;}},attrs:{},parentNode:null});}
  get isConnected(){return this===this.ownerDocument.documentElement||!!this.parentNode?.isConnected;}
  append(...nodes){nodes.forEach(node=>this.appendChild(node));}
  appendChild(node){node.remove();node.parentNode=this;this.children.push(node);return node;}
  insertBefore(node,ref){this.appendChild(node);}
  remove(){if(this.parentNode){const nodes=this.parentNode.children;nodes.splice(nodes.indexOf(this),1);this.parentNode=null;}}
  setAttribute(key,value){this.attrs[key]=value;}
  getAttribute(key){return this.attrs[key]??null;}
  attachShadow(){this.shadowRoot=new Element('shadow',this.ownerDocument);this.shadowRoot.parentNode=this;return this.shadowRoot;}
  showPopover(){this.open=true;}
  hidePopover(){this.open=false;}
}
function fixture(t){
  let seq=0;const timers=new Map(),win=new EventTarget(),doc=new EventTarget();
  Object.assign(win,{setTimeout(fn,ms){timers.set(++seq,{fn,ms});return seq;},clearTimeout(id){timers.delete(id);},
    MutationObserver:class{observe(){}disconnect(){}}});
  Object.assign(doc,{defaultView:win,createElement:tag=>new Element(tag,doc),querySelectorAll:()=>[]});
  doc.documentElement=new Element('html',doc);doc.body=new Element('body',doc);doc.documentElement.append(doc.body);
  const before=globalThis.document;globalThis.document=doc;
  t.after(()=>{win.dispatchEvent(new Event('pagehide'));globalThis.document=before;});
  return {doc,win,timers,get toast(){return doc.__opendeskPageToastV1;},
    expire(){for(const [id,row] of [...timers]){timers.delete(id);row.fn();}}};
}
test('toast is plain text, noninteractive, replaced in place and expires after the latest call',t=>{
  const f=fixture(t),focus={};f.doc.activeElement=focus;
  showPageToast({id:'one',message:'<img src=x onerror=alert(1)>',variant:'success'});
  const first=f.toast,host=first.host;
  assert.equal(first.text.textContent,'<img src=x onerror=alert(1)>');
  assert.equal(first.text.children.length,0);assert.equal(host.style.pointerEvents,'none');
  assert.equal(first.notice.getAttribute('role'),'status');assert.equal(host.open,true);
  assert.equal(f.doc.activeElement,focus);
  showPageToast({id:'one',message:'视频倍速 · 1.5×',duration:3500});
  assert.equal(f.toast.host,host);assert.equal(f.toast.text.textContent,'视频倍速 · 1.5×');
  assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,3500);
  f.expire();assert.equal(host.isConnected,false);assert.equal(f.toast,undefined);
});
test('fullscreen changes move the same toast and pagehide removes it without BFCache resurrection',t=>{
  const f=fixture(t);showPageToast({message:'Ready'});
  const host=f.toast.host,player=f.doc.createElement('section');f.doc.body.append(player);
  f.doc.fullscreenElement=player;f.doc.dispatchEvent(new Event('fullscreenchange'));
  assert.equal(host.parentNode,player);
  const video=f.doc.createElement('video');player.append(video);f.doc.fullscreenElement=video;
  f.doc.dispatchEvent(new Event('fullscreenchange'));
  assert.equal(host.parentNode,f.doc.body,'void media element cannot render child overlays');
  assert.equal(host.open,true,'manual popover stays in the top layer');
  f.win.dispatchEvent(new Event('pagehide'));assert.equal(f.toast,undefined);assert.equal(f.timers.size,0);
  f.win.dispatchEvent(new Event('pageshow'));assert.equal(host.isConnected,false);
});
test('invalid options leave an existing toast intact and a different owner cannot dismiss it',t=>{
  const f=fixture(t);showPageToast({id:'one',message:'Saved'});const first=f.toast;
  for(const options of [{message:''},{message:'x'.repeat(241)},{duration:0},{duration:Infinity},{variant:'html'},{id:'bad id'},{position:'unknown'},{position:null}])
    assert.throws(()=>showPageToast({id:'one',message:'valid',...options}),{code:'E_UI_TOAST'});
  showPageToast({id:'other'},'dismiss');assert.equal(f.toast,first);
  showPageToast({id:'one'},'dismiss');assert.equal(f.toast,undefined);
});
test('all nine positions relocate the same live toast and invalid input preserves its placement and timer',t=>{
  const f=fixture(t),ui=createPageUI({id:'positions'});
  ui.toast({message:'Top by default'});const host=f.toast.host;
  assert.equal(host.style.inset,'16px auto auto 50%');
  for(const [position,inset,transform] of [
    ['top-left','16px auto auto 16px','none'],['top','16px auto auto 50%','translateX(-50%)'],
    ['top-right','16px 16px auto auto','none'],['left','50% auto auto 16px','translateY(-50%)'],
    ['center','50% auto auto 50%','translate(-50%, -50%)'],['right','50% 16px auto auto','translateY(-50%)'],
    ['bottom-left','auto auto 16px 16px','none'],['bottom','auto auto 16px 50%','translateX(-50%)'],
    ['bottom-right','auto 16px 16px auto','none']
  ]){
    ui.toast({message:position,position});assert.equal(f.toast.host,host);
    assert.equal(host.style.inset,inset);assert.equal(host.style.transform,transform);
  }
  const timer=f.toast.timer;
  assert.throws(()=>ui.toast({message:'Invalid',position:'middle'}),{code:'E_UI_TOAST'});
  assert.equal(f.toast.timer,timer);assert.equal(f.toast.text.textContent,'bottom-right');
  assert.equal(host.style.inset,'auto 16px 16px auto');
});
test('Page UI owns toast cleanup and rejects callbacks after Stop',t=>{
  const f=fixture(t),ui=createPageUI({id:'author.page'});
  ui.toast({message:'Done'});assert.equal(f.toast.id,'author.page');
  ui.destroy();assert.equal(f.toast,undefined);assert.equal(f.timers.size,0);
  assert.throws(()=>ui.toast({message:'Late'}),{code:'E_UI_DOCUMENT'});
  const one=createPageUI({id:'one'}),two=createPageUI({id:'two'});
  one.toast({message:'One'});two.toast({message:'Two'});one.destroy();
  assert.equal(f.toast.text.textContent,'Two');two.destroy();assert.equal(f.toast,undefined);
});
test('fixed toast serializes without imports or privileged globals',t=>{
  const f=fixture(t);
  assert.equal(runInNewContext('('+showPageToast.toString()+')({message:"Serialized"})',{document:f.doc}).shown,true);
  assert.equal(f.toast.text.textContent,'Serialized');
});
test('the fixed offline helper exposes the same managed toast API',async t=>{
  const f=fixture(t),source=await readFile(new URL('../../src/libs/page-frameworks/page-ui-helper-r243.js',import.meta.url),'utf8');
  const api=runInNewContext(source+';__opendeskPageUIR243',{document:f.doc,Event,console});
  const ui=api.createPageUI({id:'compiled'});ui.toast({message:'Compiled helper'});
  assert.equal(f.toast.text.textContent,'Compiled helper');ui.destroy();assert.equal(f.toast,undefined);
});
test('Stop can clean up a toast after the document root has detached',t=>{
  const f=fixture(t),ui=createPageUI({id:'detached'});
  ui.toast({message:'Old page'});Object.defineProperty(f.doc.documentElement,'isConnected',{value:false});
  assert.doesNotThrow(()=>ui.destroy());assert.equal(f.toast,undefined);assert.equal(f.timers.size,0);
});
test('trusted toast rechecks authorization and targets only the captured top document',async()=>{
  const target={windowId:1,tabId:4,documentId:'current',url:'https://media.example/watch',origin:'https://media.example'};
  const calls=[];let live={...target},denied=false;
  const options={id:'test',message:'Done',position:'bottom-right',api:{scripting:{executeScript:async request=>{
    calls.push(request);return [{frameId:0,documentId:'current',result:{shown:true}}];
  }}},currentPageTarget:{capture:()=>({...live}),revalidate:async()=>{}},assertCurrent(){},
    async assertInstalled(){if(denied)throw Error('revoked');}};
  assert.deepEqual(await requestPageToast(options),{shown:true});
  assert.deepEqual(calls[0].target,{tabId:4,documentIds:['current']});assert.equal(calls[0].world,'ISOLATED');
  assert.equal(calls[0].func,showPageToast);assert.equal(calls[0].args[0].position,'bottom-right');
  assert.deepEqual(Object.keys(calls[0].args[0]).sort(),['duration','id','message','position','variant']);
  denied=true;await assert.rejects(requestPageToast(options),/revoked/);assert.equal(calls.length,1);
  denied=false;options.assertInstalled=async()=>{live.documentId='replaced';};
  await assert.rejects(requestPageToast(options),{code:'E_DOCUMENT_STALE'});assert.equal(calls.length,1);
});
