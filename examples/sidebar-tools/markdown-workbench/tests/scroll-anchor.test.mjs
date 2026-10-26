import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';

const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
function fixture(){
 const {document}=parseHTML('<html><body><div id="tool-root">'+html+'</div></body></html>');
 const root=document.querySelector('#tool-root'),editor=root.querySelector('#mdw-source');
 const geometry={width:380,height:200,extent:6044,top:0};
 let callback,disconnected=false,pendingTimer=false,active=editor;
 const events=new Map(),emit=type=>editor.dispatchEvent(new document.defaultView.Event(type));
 Object.defineProperties(editor,{
  clientWidth:{get:()=>geometry.width},clientHeight:{get:()=>geometry.height},
  scrollHeight:{get:()=>geometry.extent},
  scrollTop:{get:()=>geometry.top,set:value=>{
   geometry.top=Math.max(0,Math.min(value,geometry.extent-geometry.height));emit('scroll');
  }},selectionStart:{value:4342,writable:true},selectionEnd:{value:4342,writable:true}
 });
 Object.defineProperty(document,'activeElement',{get:()=>active});
 editor.focus=()=>{active=editor;};
 runInNewContext(source,{document,TextEncoder,URL,
  OpenDeskTool:{root,request:async()=>{}},
  ResizeObserver:class {constructor(fn){callback=fn;}observe(){}disconnect(){disconnected=true;}},
  addEventListener:(type,fn)=>events.set(type,fn),
  setTimeout:()=>{pendingTimer=true;return 1;},clearTimeout:()=>{pendingTimer=false;}
 });
 editor.value='x'.repeat(4342);
 return {editor,root,emit,geometry,
  bottom(){editor.scrollTop=geometry.extent;},
  resize(width,height,extent,nativeTop=geometry.top){
   Object.assign(geometry,{width,height,extent,top:nativeTop});
   emit('scroll'); // Native reflow scroll arrives before the observer.
   if(!disconnected)callback();
  },
  hide(){events.get('pagehide')();},
  get disconnected(){return disconnected;},get pendingTimer(){return pendingTimer;}
 };
}

test('combined zoom and splitter reflow keeps an existing end anchor without changing draft or selection',()=>{
 const f=fixture();f.bottom();
 f.resize(247,102,7534,5844);
 assert.equal(f.editor.scrollTop,7432);
 f.resize(341,101,6046,4691);
 assert.equal(f.editor.scrollTop,5945);
 f.resize(380,200,6044,4691);
 assert.equal(f.editor.scrollTop,5844);
 assert.equal(f.editor.value,'x'.repeat(4342));
 assert.equal(f.editor.selectionStart,4342);assert.equal(f.editor.selectionEnd,4342);
 assert.equal(f.editor.ownerDocument.activeElement,f.editor);
});

test('ordinary middle reading and explicit scroll intentions are left to the browser',()=>{
 const middle=fixture();middle.editor.scrollTop=2000;middle.resize(247,102,7534,1700);
 assert.equal(middle.editor.scrollTop,1700);
 for(const type of ['wheel','touchstart','pointerdown','keydown']){
  const f=fixture();f.bottom();f.emit(type);f.resize(247,102,7534,1234);
  assert.equal(f.editor.scrollTop,1234,type+' must release the previous end anchor');
 }
 const f=fixture();f.bottom();f.emit('wheel');f.editor.scrollTop=2000;
 f.resize(247,102,7534,1800);assert.equal(f.editor.scrollTop,1800);
 f.bottom();f.resize(341,101,6046,4691);assert.equal(f.editor.scrollTop,5945);
});

test('editing and preview mode changes release the old reading position',()=>{
 const edited=fixture();edited.bottom();edited.editor.value='new draft';edited.emit('input');
 edited.resize(247,102,7534,0);assert.equal(edited.editor.scrollTop,0);
 assert.equal(edited.editor.value,'new draft');
 const preview=fixture();preview.bottom();preview.root.querySelector('[data-mode="preview"]').click();
 preview.resize(0,0,0,0);preview.resize(380,200,6044,1234);
 assert.equal(preview.editor.scrollTop,1234);
});

test('confirmed clear and imported content never reuse an earlier end anchor',async()=>{
 const clear=fixture();clear.emit('input');clear.bottom();
 assert.equal(clear.root.querySelector('#mdw-clear').disabled,false,'user input enables destructive control');
 clear.root.querySelector('#mdw-clear').click();
 clear.root.querySelector('#mdw-review-confirm').click();await Promise.resolve();
 assert.equal(clear.editor.value,'');clear.resize(247,102,7534,0);
 assert.equal(clear.editor.scrollTop,0);
 const imported=fixture();imported.bottom();
 const file=imported.root.querySelector('#mdw-file');
 file.files=[{name:'new.md',size:9,text:async()=> 'new draft'}];
 file.dispatchEvent(new imported.editor.ownerDocument.defaultView.Event('change'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(imported.editor.value,'new draft');imported.resize(247,102,7534,0);
 assert.equal(imported.editor.scrollTop,0);
});

test('page teardown disconnects observation, removes scroll listeners and clears pending preview work',()=>{
 const f=fixture();f.emit('input');assert.equal(f.pendingTimer,true);f.bottom();f.hide();
 assert.equal(f.disconnected,true);assert.equal(f.pendingTimer,false);
 f.resize(247,102,7534,1234);assert.equal(f.editor.scrollTop,1234);
});
