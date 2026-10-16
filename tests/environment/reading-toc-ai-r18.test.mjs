import test from 'node:test';
import assert from 'node:assert/strict';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {runInNewContext} from 'node:vm';

const project='examples/sidebar-tools/reading-toc';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

class Element{
 constructor(tag='div'){
  this.tagName=tag.toUpperCase();this.children=[];this.attrs=new Map();
  this.events=new Map();this.dataset={};this.textContent='';this.value='';
  this.title='';this.hidden=false;this.disabled=false;
  this.style={setProperty(){}};
 }
 get options(){return this.children.filter(n=>n.tagName==='OPTION');}
 append(...nodes){for(const node of nodes)this.children.push(...(node.tagName==='FRAGMENT'?node.children:[node]));}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(name,value){this.attrs.set(name,String(value));}
 removeAttribute(name){this.attrs.delete(name);}
 addEventListener(type,handler){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push(handler);}
 fire(type,event={}){for(const fn of this.events.get(type)||[])fn(event);}
 querySelectorAll(selector){return this.children.flatMap(child=>[
  ...(selector==='button'&&child.tagName==='BUTTON'?[child]:[]),...child.querySelectorAll(selector)
 ]);}
 focus(){Element.active=this;}
}
function boot(js){
 const ids=['toc-source','toc-list','toc-empty','toc-error','toc-overview-more','toc-refresh',
  'toc-ai-view','toc-free-view','toc-member-card','toc-member-title','toc-member-tag',
  'toc-member-description','toc-member-meta','toc-member-entry','toc-member-disclaimer',
  'toc-promo','toc-promo-brand','toc-promo-kind','toc-promo-title','toc-promo-description',
  'toc-promo-action','toc-ai-navigation','toc-ai-list','toc-ai-status'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
 nodes['toc-empty'].hidden=true;nodes['toc-error'].hidden=true;
 const modes=['top','focus','full','ai'].map(id=>{const node=new Element('button');node.dataset.tocMode=id;return node;});
 const modeGroup=new Element();
 modeGroup.append(...modes);
 const containers={'.toc-panel':new Element(),'.toc-title':new Element(),'.toc-modes':modeGroup,'.toc-scroll':new Element()};
 const root={
  querySelector:selector=>selector.startsWith('#')?nodes[selector.slice(1)]:containers[selector],
  querySelectorAll:()=>modes
 };
 let onLocaleChange;
 const calls=[],events=new Map(),winEvents=new Map();
 const document={activeElement:null,hidden:false,createElement:tag=>new Element(tag),
  createDocumentFragment:()=>new Element('fragment'),
  addEventListener:(event,fn)=>events.set(event,fn)};
 const window={addEventListener:(event,fn)=>winEvents.set(event,fn)};
 const snapshot={url:'https://example.com/article',
  sources:[{id:'s-1',label:'Article'},{id:'s-2',label:'Other'}],
  activeId:'h1',items:[{id:'h1',label:'Heading 1',sourceId:'s-1',depth:0,topId:'h1'},
   {id:'h2',label:'Heading 2',sourceId:'s-1',depth:1,topId:'h1'}],
  overview:{'s-1':{ids:['h1'],hiddenCount:1}}};
 const tool={root,locale:'zh-CN',onLocaleChange:handler=>{onLocaleChange=handler;},
  request:async(operation,payload)=>{
   calls.push({operation,payload});
   if(operation==='toc.snapshot')return snapshot;
   if(operation==='toc.navigate')return {ok:true};
   throw Error('unexpected privileged operation: '+operation);
  }};
 const globalThis={OpenDeskTool:tool};
 runInNewContext(js,{globalThis,document,window,setTimeout:()=>1,clearTimeout(){}});
 return {nodes,modes,modeGroup,calls,document,changeLocale:value=>onLocaleChange(value)};
}

test('R1.8 source package keeps stable v1 ID, permissions and four trusted tab buttons',async()=>{
 const pkg=await createSidebarToolPackage(project);
 assert.equal(pkg.format,'opendesk.sidebar-tool.v1');
 assert.equal(pkg.id,'reading-toc');
 assert.equal(pkg.version,'1.0.8');
 assert.deepEqual(pkg.capabilities,['page.toc']);
 assert.deepEqual([...pkg.html.matchAll(/data-toc-mode="([^"]+)"/g)].map(match=>match[1]),
  ['top','focus','full','ai']);
 assert.match(pkg.html,/id="toc-ai-view"/);
 assert.match(pkg.html,/id="toc-free-view"/);
 assert.doesNotMatch(pkg.html,/<iframe|<script|<form\b[^>]*\baction=/i);
 assert.doesNotMatch(pkg.js,/mockAIResult|request\(['"]ai\./);
});

test('R1.8 unavailable is fail-closed; partner default, no fictitious AI headings and free view survives',async()=>{
 const pkg=await createSidebarToolPackage(project),ui=boot(pkg.js);
 await tick();await tick();
 const {nodes,modes,calls}=ui;
 assert.equal(nodes['toc-ai-view'].hidden,true);
 assert.equal(nodes['toc-list'].children.length,2,'trusted free headings still present');
 modes[3].fire('click');
 assert.equal(nodes['toc-ai-view'].hidden,false);
 assert.equal(nodes['toc-free-view'].hidden,true);
 assert.equal(nodes['toc-member-card'].hidden,false);
 assert.equal(nodes['toc-member-entry'].hidden,true);
 assert.equal(nodes['toc-member-entry'].disabled,true);
 assert.equal(nodes['toc-promo'].hidden,false);
 assert.equal(nodes['toc-promo-title'].textContent,'广告位开放合作');
 assert.equal(nodes['toc-ai-navigation'].hidden,true);
 assert.deepEqual(nodes['toc-ai-list'].children,[],'no fake or inaccessible AI links');
 assert.equal(nodes['toc-source'].hidden,true);
 assert.deepEqual(calls.map(call=>call.operation),['toc.snapshot'],'no silent AI/checkout request');
 modes[2].fire('click');
 assert.equal(nodes['toc-free-view'].hidden,false);
 assert.equal(nodes['toc-source'].hidden,false,'multiple sources still selectable');
 assert.equal(nodes['toc-list'].children.length,2,'free headings restored without rescan');
});

test('R1.8 same locale resource updates AI copy; arrow-key selection returns to free mode',async()=>{
 const ui=boot((await createSidebarToolPackage(project)).js);
 await tick();await tick();
 ui.modes[3].fire('click');
 ui.changeLocale('en');
 assert.equal(ui.nodes['toc-promo-title'].textContent,'Sponsorship space available');
 assert.equal(ui.nodes['toc-ai-status'].textContent,'AI outline · Coming soon');
 ui.document.activeElement=ui.modes[3];
 let prevented=false;
 ui.modeGroup.fire('keydown',{key:'ArrowLeft',preventDefault(){prevented=true;}});
 assert.equal(prevented,true);
 assert.equal(ui.nodes['toc-ai-view'].hidden,true);
 assert.equal(ui.modes[2].attrs.get('aria-pressed'),'true');
});
