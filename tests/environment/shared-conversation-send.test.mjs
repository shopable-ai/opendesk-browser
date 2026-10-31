import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import * as React from 'react';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';

const root=new URL('../../',import.meta.url);
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
async function compile(path,replacements={}){
  let {code}=await transform(await readFile(new URL(path,root),'utf8'),{loader:'tsx',format:'esm',jsx:'transform'});
  for(const [from,to] of Object.entries({react:import.meta.resolve('react'),...replacements}))
    code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
  return moduleURL(code);
}
const button=await compile('src/ui/react/components/ui/button.tsx');
const css=moduleURL('export default '+JSON.stringify(await readFile(new URL('src/ui/react/components/conversation-frame.css',root),'utf8')));
const layout=moduleURL('export default '+JSON.stringify(await readFile(new URL('src/ui/react/components/conversation-layout.css',root),'utf8')));
const {SharedConversationFrame}=await import(await compile('src/ui/react/components/conversation.tsx',{
  'react-dom':import.meta.resolve('react-dom'),'./ui/button.tsx':button,'./conversation-frame.css?raw':css,'./conversation-layout.css?raw':layout
}));

test('Send click reaches the controlled callback without native form submission; IME and blocked states remain fenced',async t=>{
  const sends=[];
  let blocked=false;
  const ui=createExtensionCenterDOM(t,{component:()=>React.createElement(SharedConversationFrame,{
    inputId:'request',sendId:'send',draft:'collect titles',blocked,
    onSend:event=>sends.push(event.nativeEvent?.type||event.type)
  })});
  ui.window.getSelection=()=>({anchorNode:null,anchorOffset:0,focusNode:null,focusOffset:0});
  ui.doc.getElementById('send').dispatch('click');
  assert.deepEqual(sends,['click'],'sandbox does not dispatch a native submit event');
  ui.doc.getElementById('request').dispatch('keydown',{key:'Enter',isComposing:true});
  ui.doc.getElementById('request').dispatch('keydown',{key:'Enter',shiftKey:true});
  assert.equal(sends.length,1);
  ui.doc.getElementById('request').dispatch('keydown',{key:'Enter'});
  assert.equal(sends.length,2);
  blocked=true;ui.paint();
  assert.equal(ui.doc.getElementById('send').disabled,true);
  ui.doc.getElementById('request').dispatch('keydown',{key:'Enter'});
  assert.equal(sends.length,2);
});
