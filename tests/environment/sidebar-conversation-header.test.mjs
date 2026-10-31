import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import {createSidebarToolSandboxDOM} from '../helpers/sidebar-tool-sandbox-dom.mjs';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {createSidebarTools} from '../../src/ui/sidebar-tools.js';
import {SIDEBAR_TOOL_PROTOCOL as protocol,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {officialFixtureFetch} from '../helpers/official-tools.mjs';
const tool={format:'opendesk.sidebar-tool.v1',id:'conversation-example',version:'1.0.0',title:'Conversation',description:'Test',capabilities:[],html:'<main>Example</main>',css:'',js:'void 0;'};

test('SSR emits the fixed, hidden AI control beside the trusted slot before uninstall',async()=>{
  const {ToolHost}=await loadSidebarReact();
  const view=createSidebarToolsView();
  const render=()=>parseHTML(renderToStaticMarkup(React.createElement(ToolHost,{view}))).document;
  let doc=render(),button=doc.getElementById('sidebar-tool-conversation-toggle');
  assert.equal(button.hidden,true);
  assert.equal(button.className,'sidebar-tool-icon-action od-icon-button od-conversation-frame-trigger');
  assert.equal(button.querySelector('span.od-conversation-ai-glyph').textContent,'AI');
  assert.equal(button.getAttribute('aria-controls'),'sidebar-tool-frame');
  assert.ok([...doc.querySelectorAll('button')].indexOf(button)<[...doc.querySelectorAll('button')].indexOf(doc.getElementById('sidebar-tool-remove')));
  view.patch(button.id,{hidden:false,attributes:{'aria-expanded':'true','aria-pressed':'true'}});
  button=render().getElementById(button.id);
  assert.equal(button.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');
  view.dispose();
});

test('host validates sender/session, emits only toggle, restores focus and retires state',async t=>{
  const {document:doc,window:win}=parseHTML('<html><body></body></html>');
  const oldWindow=globalThis.window;globalThis.window=win;
  const create=doc.createElement.bind(doc);
  doc.createElement=tag=>{const node=create(tag);if(tag==='iframe')Object.defineProperty(node,'contentWindow',{value:{sent:[],postMessage(message){this.sent.push(message);}}});return node;};
  const view=createSidebarToolsView(),frameRoot=create('div');doc.body.append(frameRoot);
  view.attachRuntime({frameRoot,settingsControl:create('button')});
  const store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const api={runtime:{getURL:p=>'chrome-extension://test/'+p,sendMessage:async()=>undefined},storage:{local:{get:async key=>({[key]:store.get(key)}),set:async rows=>{for(const [k,v] of Object.entries(rows))store.set(k,v);}},onChanged:{addListener(){},removeListener(){}}}};
  const host=createSidebarTools({api,doc,view,taskWorkbench:{},fetcher:officialFixtureFetch});
  t.after(()=>{host.dispose();view.dispose();globalThis.window=oldWindow;});
  await host.ready;host.setVisible(true);host.openTool(tool.id);
  const frame=frameRoot.firstChild;assert.ok(frame);await frame.onload();
  const loaded=frame.contentWindow.sent[0],field=view.fields['sidebar-tool-conversation-toggle'];
  const send=(data={},overrides={})=>{const event=new win.Event('message');Object.assign(event,{origin:'null',source:frame.contentWindow,data:{protocol,instance:loaded.instance,toolId:tool.id,kind:'conversation-state',visible:true,open:true,...data},...overrides});win.dispatchEvent(event);};
  for(const overrides of [{origin:'https://evil.test'},{source:{} }])send({},overrides);
  for(const data of [{instance:'stale'},{toolId:'other'},{protocol:'wrong'},{visible:1},{open:'yes'}])send(data);
  assert.equal(field.hidden,true);send();assert.equal(field.hidden,false);
  assert.equal(field.attributes['aria-expanded'],'true');assert.equal(field.attributes['aria-pressed'],'true');
  view.dispatch(field.key,'click',{isTrusted:true,secret:'never relay'});
  assert.deepEqual(frame.contentWindow.sent.at(-1),{protocol,instance:loaded.instance,toolId:tool.id,kind:'conversation-action',action:'toggle'});
  doc.activeElement=frame;view.takeEffects();send({open:false});
  assert.ok(view.takeEffects().some(effect=>effect.key===field.key&&effect.method==='focus'));
  send();host.closeTool();assert.equal(field.hidden,true);assert.equal(field.attributes['aria-pressed'],'false');
  send();assert.equal(field.hidden,true,'late messages cannot revive a retired control');
});

test('sandbox publishes strict boolean state and dispatches only verified fixed actions',async t=>{
  const compiled=await build({entryPoints:['src/sidebar-tools/bridge.js'],bundle:true,write:false,format:'iife',globalName:'SandboxBridge',platform:'browser',define:{'import.meta.env.MODE':'"test"'}});
  const {window:hostWindow}=parseHTML('<html><body></body></html>');
  const sandbox=createSidebarToolSandboxDOM(t,{hostWindow,bridgeCode:compiled.outputFiles[0].text});
  const received=[];hostWindow.addEventListener('message',event=>received.push(event.data));
  sandbox.transport.postMessage({protocol,kind:'load',instance:'live',tool:{...tool,js:`
    for(const value of [null,{},true,{visible:1,open:false},{visible:true,open:false,extra:true},Object.assign(Object.create({visible:true,open:false}),{x:1,y:2})])
      if(OpenDeskTool.setConversationState(value)!==false)throw Error('invalid state accepted');
    if(OpenDeskTool.setConversationState({visible:true,open:false})!==true)throw Error('valid state rejected');
  `}});
  await new Promise(resolve=>setImmediate(resolve));
  // The installed script executes inside the fixture's actual sandbox realm.
  // Use a tool script on load for API checks, rather than exposing private bridge state.
  assert.equal(sandbox.errors.length,0);
  assert.deepEqual(received.filter(row=>row.kind==='conversation-state'),[{protocol,kind:'conversation-state',instance:'live',toolId:tool.id,visible:true,open:false}]);
  const events=[];sandbox.doc.getElementById('tool-root').addEventListener('opendesk:conversation-action',e=>events.push(e.detail));
  for(const data of [{instance:'stale'},{toolId:'other'},{action:'execute'},{protocol:'wrong'}])sandbox.transport.postMessage({protocol,kind:'conversation-action',instance:'live',toolId:tool.id,action:'toggle',...data});
  assert.equal(events.length,0);
  sandbox.transport.postMessage({protocol,kind:'conversation-action',instance:'live',toolId:tool.id,action:'toggle',html:'<script/>',event:{isTrusted:true}});
  assert.deepEqual(JSON.parse(JSON.stringify(events)),[{action:'toggle'}]);
});
