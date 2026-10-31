import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import * as React from 'react';
import {flushSync} from 'react-dom';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';
import {createPreviewKit,createComponentReference} from '../../scripts/sidebar-preview-kit.mjs';
const root=new URL('../../',import.meta.url);
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
async function compile(path,replacements={}){
 let {code}=await transform(await readFile(new URL(path,root),'utf8'),{loader:'tsx',format:'esm',jsx:'transform'});
 for(const [from,to] of Object.entries({react:import.meta.resolve('react'),...replacements}))
  code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
 return moduleURL(code);
}
const button=await compile('src/ui/react/components/ui/button.tsx');
const replacements={'react-dom':import.meta.resolve('react-dom'),'./ui/button.tsx':button};
for(const name of ['frame','layout'])replacements[`./conversation-${name}.css?raw`]=moduleURL('export default '+JSON.stringify(await readFile(new URL(`src/ui/react/components/conversation-${name}.css`,root),'utf8')));
const {SharedConversationDock,SharedConversationFrame,TrustedConversationWorkspace}=await import(await compile('src/ui/react/components/conversation.tsx',replacements));

test('controlled Dock preserves children, forwards DOM props and resizes by keyboard and pointer',t=>{
 let open=true,mounts=0,keys=0,measure;
 const previousObserver=globalThis.ResizeObserver;
 globalThis.ResizeObserver=class {constructor(callback){measure=callback;}observe(){}disconnect(){}};
 t.after(()=>{globalThis.ResizeObserver=previousObserver;});
 function Child(){React.useEffect(()=>{mounts++;},[]);return React.createElement('input',{id:'retained',defaultValue:'draft'});}
 const ui=createExtensionCenterDOM(t,{component:()=>React.createElement('div',{className:'od-conversation-workspace'},
  React.createElement('div',{className:'od-conversation-business'},'business'),
  React.createElement(SharedConversationDock,{open,id:'custom-dock','aria-label':'Custom',className:'consumer',onKeyDown:()=>keys++,onClose:()=>{open=false;}},React.createElement(Child)))});
 const dock=ui.doc.getElementById('custom-dock'),input=ui.doc.getElementById('retained');
 dock.parentElement.getBoundingClientRect=()=>({height:600});
 Object.defineProperty(dock.parentElement,'clientHeight',{value:600});
 flushSync(()=>measure());
 assert.equal(dock.getAttribute('aria-label'),'Custom');assert.ok(dock.classList.contains('consumer'));
 const separator=dock.querySelector('[role="separator"]');
 const initial=Number(separator.getAttribute('aria-valuenow'));
 separator.dispatch('keydown',{key:'ArrowUp'});
 assert.equal(Number(separator.getAttribute('aria-valuenow')),initial+16);assert.equal(keys,1);
 separator.dispatch('keydown',{key:'Home'});
 assert.equal(separator.getAttribute('aria-valuenow'),separator.getAttribute('aria-valuemin'));
 const before=Number(separator.getAttribute('aria-valuenow'));
 separator.dispatch('pointerdown',{button:0,clientY:300,pointerId:1});
 separator.dispatch('pointermove',{clientY:260,pointerId:1});ui.paint();
 assert.equal(Number(separator.getAttribute('aria-valuenow')),before+40);
 separator.dispatch('pointerup',{pointerId:1});
 separator.dispatch('pointermove',{clientY:200,pointerId:1});ui.paint();
 assert.equal(Number(separator.getAttribute('aria-valuenow')),before+40);
 dock.querySelector('.od-conversation-close').dispatch('click');ui.paint();
 assert.equal(dock.hidden,true);assert.equal(ui.doc.getElementById('retained'),input);
 open=true;ui.paint();assert.equal(dock.hidden,false);assert.equal(mounts,1);
});

test('Frame Send and Stop callbacks remain controlled inside Dock',t=>{
 let busy=false,sends=0,stops=0;
 const ui=createExtensionCenterDOM(t,{component:()=>React.createElement(SharedConversationDock,{open:true},
  React.createElement(SharedConversationFrame,{inputId:'draft',draft:'hello',busy,sendId:'send',stopId:'stop',focusOnOpen:false,
   onSend:()=>{sends++;busy=true;},onStop:()=>{stops++;busy=false;}}))});
 ui.window.getSelection=()=>({anchorNode:null,anchorOffset:0,focusNode:null,focusOffset:0});
 ui.doc.getElementById('send').dispatch('click');ui.paint();assert.equal(sends,1);
 ui.doc.getElementById('stop').dispatch('click');ui.paint();assert.equal(stops,1);
});

test('offline recipe compiles canonical layout, source locks it and carries no provider CSS',async()=>{
 const result=await createComponentReference(await createPreviewKit());
 assert.ok(result.inputs['src/ui/react/components/conversation-layout.css']);
 assert.ok(!Object.keys(result.inputs).some(p=>p.endsWith('conversation-dock.css')));
 assert.ok(result.guide.includes('SharedConversationDock'));
 assert.ok(result.html.includes('sidebar-tool-chat-slot'));
 const layout=await readFile(new URL('src/ui/react/components/conversation-layout.css',root),'utf8');
 assert.doesNotMatch(layout,/provider|settings|workflow/);
});

// Consumer-owned settings must survive the presentation-only Dock extraction.
test('Dock keeps the settings action beside collapse and retains its children',t=>{
 let settings=0,open=true;
 const ui=createExtensionCenterDOM(t,{component:()=>React.createElement(SharedConversationDock,{open,
  onClose:()=>{open=false;},toolbar:React.createElement('button',{'aria-label':'AI Provider 设置',onClick:()=>settings++},'settings')},
  React.createElement('input',{id:'kept-draft',defaultValue:'retained draft'}))});
 const dock=ui.doc.querySelector('.od-conversation-dock'),toolbar=dock.querySelector('.od-conversation-toolbar');
 assert.equal(toolbar.querySelectorAll('button').length,2);
 toolbar.querySelector('[aria-label="AI Provider 设置"]').dispatch('click');assert.equal(settings,1);
 dock.querySelector('.od-conversation-close').dispatch('click');ui.paint();assert.equal(dock.hidden,true);
 open=true;ui.paint();assert.equal(dock.hidden,false);
 assert.equal(ui.doc.getElementById('kept-draft').value,'retained draft');
});
