import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {createClipperPreview} from '../../src/ui/react/preview/clipper-preview.js';
import {compileSharedToolCss} from '../../scripts/preview/shared-tool-design.mjs';

test('token-only tool styling compiles the canonical palette without host layout or private colors',async()=>{
  const tokens=await readFile('src/ui/design-tokens.css','utf8');
  const layout=await readFile('examples/sidebar-tools/web-markdown-clipper/src/style.css','utf8');
  const css=await compileSharedToolCss(layout);
  assert.ok(css.includes(tokens));
  assert.doesNotMatch(css,/#workspace-content|\.workbench-nav/);
  for(const bad of ['.clip{color:#123456}',':root{--od-ink:red}','@import "x.css";',
    '.clip{color:red}',':root{--paper:rebeccapurple}', '.clip{background:rgb(0 0 0)}',
    '.clip{box-shadow:0 0 2px hsl(0 0% 0%)}'])
    await assert.rejects(compileSharedToolCss('/* @opendesk-shared-tokens */\n'+bad),/private palette/);
});

function preview(location={origin:'http://127.0.0.1:43115',protocol:'http:'}){
  const messages=[],listeners=new Map(),center={hidden:false};
  const root={nodeType:1,ownerDocument:{},hidden:false,replaceChildren(frame){this.frame=frame;frame.isConnected=true;}};
  const view=createSidebarToolsView();view.attachRuntime({frameRoot:root,settingsControl:{nodeType:1,ownerDocument:{}}});
  const doc={defaultView:{location,
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    getElementById:()=>center,querySelector:()=>null,
    createElement:()=>({style:{},setAttribute(key,value){this[key]=value;},
      contentWindow:{postMessage:message=>messages.push(message)},remove(){this.isConnected=false;}})};
  const app=createClipperPreview({view,stage:'<html data-preview-instance="" data-preview-parent-origin="">',doc});
  app.open();
  const frame=root.frame,instance=frame.srcdoc.match(/data-preview-instance="([^"]+)/)[1];
  const valid={source:frame.contentWindow,origin:'null',data:{protocol:'opendesk.clipper.preview.v1',
    toolId:'web-markdown-clipper',instance,kind:'navigation-state',page:'reader'}};
  return {app,view,root,frame,messages,valid,receive:event=>listeners.get('message')?.(event)};
}

test('preview rejects forged identity/source/origin and retired iframe messages',()=>{
  const p=preview();
  assert.equal(p.frame.sandbox,'allow-scripts');
  for(const event of [{...p.valid,origin:'http://evil.test'},{...p.valid,source:{}},
    {...p.valid,data:{...p.valid.data,instance:'old'}},
    {...p.valid,data:{...p.valid.data,toolId:'other'}},
    {...p.valid,data:{...p.valid.data,protocol:'opendesk.sidebar-tool.v1'}}]){
    p.receive(event);assert.equal(p.view.fields['sidebar-tool-title'].textContent,'网页剪藏');
  }
  p.receive(p.valid);assert.equal(p.view.fields['sidebar-tool-title'].textContent,'摘录详情');
  p.app.close();p.receive(p.valid);assert.equal(p.view.fields['sidebar-tool-display'].hidden,true);
  p.app.open();p.receive(p.valid);assert.equal(p.view.fields['sidebar-tool-title'].textContent,'网页剪藏');
  p.app.dispose();p.view.dispose();
});

test('file preview binds the serialized null message origin without relaxing source identity',()=>{
  const p=preview({protocol:'file:',origin:'file://'});
  assert.match(p.frame.srcdoc,/data-preview-parent-origin="null"/);
  p.app.dispose();p.view.dispose();
});

test('preview settings retain the iframe and dirty/busy block dangerous navigation',()=>{
  const p=preview();p.receive(p.valid);
  p.view.dispatch('sidebar-tool-settings-open','click',{});
  assert.equal(p.view.fields['sidebar-tool-settings-view'].hidden,false);
  for(const id of ['generic-site-scope','generic-site-binary','generic-site-advanced'])
    assert.equal(p.view.fields['sidebar-tool-'+id].hidden,true,'preview hides inapplicable site authority controls');
  p.view.dispatch('sidebar-tool-back','click',{});
  assert.equal(p.root.frame,p.frame);assert.equal(p.frame.isConnected,true);
  assert.equal(p.view.fields['sidebar-tool-title'].textContent,'摘录详情');
  p.receive({...p.valid,data:{...p.valid.data,kind:'edit-state',dirty:true,busy:true}});
  p.view.dispatch('sidebar-tool-settings-open','click',{});
  p.view.dispatch('sidebar-tool-back','click',{});
  assert.equal(p.view.fields['sidebar-tool-settings-view'].hidden,true);
  assert.equal(p.messages.length,0);
  p.receive({...p.valid,data:{...p.valid.data,kind:'edit-state',dirty:true,busy:false}});
  p.view.dispatch('sidebar-tool-back','click',{});
  assert.equal(p.messages.at(-1).kind,'navigation-action');
  assert.equal(p.messages.at(-1).action,'back','business owner decides dirty confirmation');
  p.app.dispose();p.view.dispose();
});

test('sandbox preview actions require the bound parent, origin, protocol and instance',async()=>{
  const code=await readFile('examples/sidebar-tools/web-markdown-clipper/preview/mock-host.js','utf8');
  let receive;const dispatched=[],parent={postMessage(){}};
  const root={dispatchEvent:event=>dispatched.push(event)};
  runInNewContext(code,{parent,document:{documentElement:{dataset:{previewInstance:'current',previewParentOrigin:'http://localhost:43115'}},querySelector:()=>root},
    window:{addEventListener:(type,handler)=>{receive=handler;}},TextEncoder,URL,URLSearchParams,
    CustomEvent:class{constructor(type,values){this.type=type;Object.assign(this,values);}}});
  const event={source:parent,origin:'http://localhost:43115',data:{kind:'navigation-action',action:'back',
    protocol:'opendesk.clipper.preview.v1',toolId:'web-markdown-clipper',instance:'current'}};
  for(const bad of [{...event,source:{}},{...event,origin:'null'},
    {...event,data:{...event.data,instance:'old'}},{...event,data:{...event.data,toolId:'other'}},
    {...event,data:{...event.data,protocol:'wrong'}}])receive(bad);
  assert.equal(dispatched.length,0);receive(event);assert.equal(dispatched.length,1);
});
