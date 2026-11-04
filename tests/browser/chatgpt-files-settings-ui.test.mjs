import test from 'node:test';
import assert from 'node:assert/strict';
import {initChatGPTFilesSettingsUI} from '../../src/native-agent/chatgpt-files-settings-ui.js';

const protocol='opendesk.chatgpt.project.v1';
const key='opendesk.chatgpt.files.preferences.v1';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function target(){
  const listeners=new Map();
  return {listeners,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    emit(type,event={}){for(const fn of listeners.get(type)||[])fn(event);}};
}
function fixture(){
  const window=target(),body={},nodes={};
  const doc=Object.assign(target(),{body,activeElement:body,hidden:false,hasFocus:()=>true,defaultView:window,
    getElementById:id=>nodes[id]});
  for(const id of ['chatgpt-files-enabled','chatgpt-files-diagnostics','chatgpt-files-settings-status']){
    let disabled=true;
    nodes[id]=Object.assign(target(),{checked:false,textContent:'',hidden:false,isConnected:true,
      focus(){doc.activeElement=this;},getClientRects:()=>[{}]});
    Object.defineProperty(nodes[id],'disabled',{get:()=>disabled,set(value){disabled=value;if(value&&doc.activeElement===nodes[id])doc.activeElement=body;}});
  }
  let preferences={enabled:true,diagnosticsVisible:false},responder;
  const calls=[],changes=new Set();
  const api={runtime:{async sendMessage(message){calls.push(message);if(responder)return responder(message);
    if(message.action==='configure')preferences={...preferences,...message.preferences};
    return {ok:true,data:{preferences:{...preferences}}};}},storage:{onChanged:{addListener:fn=>changes.add(fn),removeListener:fn=>changes.delete(fn)}}};
  return {doc,window,nodes,calls,changes,api,start:()=>initChatGPTFilesSettingsUI({api,document:doc}),
    respond(fn){responder=fn;},set(value){preferences=value;},
    change(id,checked,trusted=true){const node=nodes[id];node.checked=checked;node.emit('change',{isTrusted:trusted});}};
}
test('reads installed defaults without configuring or granting permissions; rejects synthetic changes',async()=>{
  const h=fixture();h.start();await settle();
  assert.equal(h.nodes['chatgpt-files-enabled'].checked,true);
  assert.equal(h.nodes['chatgpt-files-diagnostics'].checked,false);
  assert.deepEqual(h.calls,[{protocol,action:'settings'}]);
  h.change('chatgpt-files-enabled',false,false);await settle();
  assert.equal(h.nodes['chatgpt-files-enabled'].checked,true);assert.equal(h.calls.length,1);
});
test('trusted changes patch only their own preference, disable pending controls and restore lost focus',async()=>{
  const h=fixture();h.start();await settle();let resolve;
  h.respond(()=>new Promise(done=>{resolve=done;}));
  const control=h.nodes['chatgpt-files-diagnostics'];control.focus();
  h.change('chatgpt-files-diagnostics',true);
  assert.equal(control.disabled,true);assert.equal(h.nodes['chatgpt-files-enabled'].disabled,true);
  h.change('chatgpt-files-enabled',false);
  assert.deepEqual(h.calls.at(-1),{protocol,action:'configure',preferences:{diagnosticsVisible:true}});
  assert.equal(h.calls.length,2);
  resolve({ok:true,data:{preferences:{enabled:true,diagnosticsVisible:true}}});await settle();
  assert.equal(control.disabled,false);assert.equal(h.nodes['chatgpt-files-enabled'].checked,true);
  assert.equal(h.doc.activeElement,control);
});
test('lost configure acknowledgement reads authority without replay or fake rollback',async()=>{
  const h=fixture();h.start();await settle();
  h.respond(message=>{if(message.action==='configure')throw new Error('lost receipt');
    return {ok:true,data:{preferences:{enabled:false,diagnosticsVisible:false}}};});
  h.change('chatgpt-files-enabled',false);await settle();
  assert.deepEqual(h.calls.map(x=>x.action),['settings','configure','settings']);
  assert.equal(h.nodes['chatgpt-files-enabled'].checked,false);
  assert.match(h.nodes['chatgpt-files-settings-status'].textContent,/回读/);
});
test('unknown readback disables controls until focus recovers actual preferences',async()=>{
  const h=fixture();h.start();await settle();h.respond(()=>({ok:false,error:{message:'unavailable'}}));
  h.change('chatgpt-files-enabled',false);await settle();
  assert.equal(h.nodes['chatgpt-files-enabled'].disabled,true);
  assert.match(h.nodes['chatgpt-files-settings-status'].textContent,/未知/);
  h.respond(()=>({ok:true,data:{preferences:{enabled:false,diagnosticsVisible:true}}}));
  h.window.emit('focus');await settle();
  assert.equal(h.nodes['chatgpt-files-enabled'].disabled,false);assert.equal(h.nodes['chatgpt-files-diagnostics'].checked,true);
});
test('storage notifications read authority and pagehide removes listeners and ignores late replies',async()=>{
  const h=fixture();h.start();await settle();h.set({enabled:false,diagnosticsVisible:true});
  for(const fn of h.changes){fn({unrelated:{}},'local');fn({[key]:{}},'sync');}await settle();assert.equal(h.calls.length,1);
  for(const fn of h.changes)fn({[key]:{}},'local');await settle();
  assert.equal(h.nodes['chatgpt-files-enabled'].checked,false);
  let resolve;h.respond(()=>new Promise(done=>{resolve=done;}));h.window.emit('focus');
  h.window.emit('pagehide');assert.equal(h.changes.size,0);
  resolve({ok:true,data:{preferences:{enabled:true,diagnosticsVisible:false}}});await settle();
  assert.equal(h.nodes['chatgpt-files-enabled'].checked,false);
  const count=h.calls.length;h.window.emit('focus');h.change('chatgpt-files-enabled',true);await settle();assert.equal(h.calls.length,count);
});
test('malformed preferences never become a writable default state',async()=>{
  const h=fixture();h.respond(()=>({ok:true,data:{preferences:{enabled:'true'}}}));h.start();await settle();
  assert.equal(h.nodes['chatgpt-files-enabled'].disabled,true);
  assert.match(h.nodes['chatgpt-files-settings-status'].textContent,/未知/);
});
test('pending storage updates are read after configure and never overwrite a newer authority value',async()=>{
  const h=fixture();h.start();await settle();let resolve;
  h.respond(message=>message.action==='configure'?new Promise(done=>{resolve=done;}):
    {ok:true,data:{preferences:{enabled:false,diagnosticsVisible:false}}});
  h.change('chatgpt-files-diagnostics',true);
  for(const fn of h.changes)fn({[key]:{}},'local');
  assert.equal(h.calls.length,2);
  resolve({ok:true,data:{preferences:{enabled:true,diagnosticsVisible:true}}});await settle();
  assert.deepEqual(h.calls.map(x=>x.action),['settings','configure','settings']);
  assert.equal(h.nodes['chatgpt-files-enabled'].checked,false);
  assert.equal(h.nodes['chatgpt-files-diagnostics'].checked,false);
});
test('finishing a change does not steal focus after the user navigates elsewhere',async()=>{
  const h=fixture();h.start();await settle();let resolve;
  h.respond(()=>new Promise(done=>{resolve=done;}));
  h.nodes['chatgpt-files-enabled'].focus();h.change('chatgpt-files-enabled',false);
  const elsewhere={};h.doc.activeElement=elsewhere;h.doc.emit('focusin');
  resolve({ok:true,data:{preferences:{enabled:false,diagnosticsVisible:false}}});await settle();
  assert.equal(h.doc.activeElement,elsewhere);
});
