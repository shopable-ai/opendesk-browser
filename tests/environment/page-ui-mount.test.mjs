import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageUI} from '../../src/scripting/user-scripts/page-ui.js';

// Deterministic DOM ownership double. Layout/CSP still require native Chrome evidence.
class Element extends EventTarget {
  constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.ownerDocument=doc;
    this.parentNode=null;this.children=[];this.props={};this.style={};this.dataset={};
    if(tag==='style')this.sheet={cssRules:[]};}
  get parentElement(){return this.parentNode?.tagName==='SHADOW'?null:this.parentNode;}
  get isConnected(){return this===this.ownerDocument.documentElement||!!this.parentNode?.isConnected;}
  get nextSibling(){const a=this.parentNode?.children||[];return a[a.indexOf(this)+1]||null;}
  append(...xs){xs.forEach(x=>this.appendChild(x));}
  appendChild(x){x.remove();x.parentNode=this;this.children.push(x);this.ownerDocument.changed(this);return x;}
  insertBefore(x,ref){x.remove();x.parentNode=this;
    const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,x);
    this.ownerDocument.changed(this);return x;}
  remove(){if(!this.parentNode)return;const parent=this.parentNode;
    parent.children.splice(parent.children.indexOf(this),1);this.parentNode=null;this.ownerDocument.changed(parent);}
  setAttribute(k,v){this.props[k]=v;}
  getAttribute(k){return this.props[k]||null;}
  matches(s){return s==='[data-opendesk-ui-owner]'?!!this.getAttribute('data-opendesk-ui-owner'):
    s.includes('button')&&this.tagName==='BUTTON';}
  closest(s){for(let x=this;x;x=x.parentElement)if(x.matches(s))return x;return null;}
  attachShadow(){const el=new Element('shadow',this.ownerDocument);el.parentNode=this;this.shadowRoot=el;return el;}
  getBoundingClientRect(){return {top:12,right:120,width:52,height:32};}
  querySelectorAll(selector){const out=[];const go=e=>{
    if(selector==='style'&&e.tagName==='STYLE'||selector==='img'&&e.tagName==='IMG')out.push(e);
    e.children.forEach(go);
  };go(this);return out;}
}
class Doc {
  constructor(){
    this.observers=new Set();const doc=this;
    this.defaultView=new EventTarget();
    class Observer {
      constructor(callback){this.callback=callback;this.targets=new Set();doc.observers.add(this);}
      observe(target){this.targets.add(target);}
      disconnect(){doc.observers.delete(this);this.targets.clear();}
    }
    Object.assign(this.defaultView,{innerWidth:800,innerHeight:600,MutationObserver:Observer,
      setTimeout,clearTimeout,setInterval,clearInterval,
      requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout,
      getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})});
    this.documentElement=new Element('html',this);
    this.body=new Element('body',this);this.documentElement.appendChild(this.body);
  }
  createElement(tag){return new Element(tag,this);}
  querySelectorAll(selector){
    if(selector==='[')throw new SyntaxError('invalid selector');
    const found=[],walk=e=>{
      if(selector.startsWith('#')&&e.getAttribute('id')===selector.slice(1)||selector==='[data-opendesk-ui-owner]'&&e.getAttribute('data-opendesk-ui-owner'))found.push(e);
      for(const child of e.children)walk(child);
    };walk(this.documentElement);return found;
  }
  changed(parent){for(const item of [...this.observers]){
    if(item.targets.has(parent))queueMicrotask(()=>item.callback([]));
  }}
}
function fixture(t){
  const before=globalThis.document,doc=new Doc();
  globalThis.document=doc;
  t.after(()=>{doc.defaultView.dispatchEvent(new Event('pagehide'));globalThis.document=before;});
  const toolbar=doc.createElement('section'),anchor=doc.createElement('h2');
  anchor.setAttribute('id','page-ui-anchor');
  doc.body.append(toolbar);toolbar.append(anchor);
  return {doc,toolbar,anchor};
}

test('old floating API stays fixed; CSS and two IDs stay in their own shadow roots',t=>{
  const {doc}=fixture(t);
  const one=createPageUI({id:'u.one'}),two=createPageUI({id:'u.two'});
  assert.equal(one.host.style.position,'fixed');
  assert.equal(one.host.parentNode,doc.body);
  assert.notEqual(one.shadowRoot,two.shadowRoot);
  assert.equal(one.shadowRoot.querySelectorAll('style').length,1);
  assert.equal(doc.querySelectorAll('[data-opendesk-ui-owner]').length,2);
  two.destroy();one.destroy();
});
test('nearby inline button executes safely; original site node remains unchanged',t=>{
  const {doc,toolbar,anchor}=fixture(t);
  let siteCalls=0;anchor.addEventListener('click',()=>siteCalls++);
  const ui=createPageUI({id:'u.inline',mount:{selector:'#page-ui-anchor',position:'after'}});
  const button=doc.createElement('button');button.type='button';button.className='od-button';
  ui.content.append(button);let calls=0;ui.on(button,'click',()=>calls++);
  button.dispatchEvent(new Event('click'));
  assert.equal(calls,1);assert.equal(siteCalls,0);assert.equal(anchor.isConnected,true);
  assert.equal(toolbar.children[1],ui.host);
  assert.equal(ui.getMountDiagnostics().strategy,'inline');
  const report=ui.verifyMount();
  assert.equal(report.checks.hostConnected,true);assert.equal(report.checks.shadowReady,true);
  assert.equal(report.checks.cssReady,true);
  assert.doesNotThrow(()=>JSON.stringify(report));
  ui.destroy();button.dispatchEvent(new Event('click'));assert.equal(calls,1);
});
test('ambiguous, invalid and OpenDesk-owned selectors fail before replacing same ID',t=>{
  const {doc,toolbar}=fixture(t);
  const old=createPageUI({id:'u.reused'});
  const twin=doc.createElement('h2');twin.setAttribute('id','page-ui-anchor');toolbar.append(twin);
  assert.throws(()=>createPageUI({id:'u.reused',mount:{selector:'#page-ui-anchor'}}),
    e=>e.code==='E_UI_TARGET_AMBIGUOUS');
  assert.equal(old.active(),true);
  assert.throws(()=>createPageUI({id:'u.reused',mount:{selector:'['}}),e=>e.code==='E_UI_TARGET');
  assert.throws(()=>createPageUI({id:'u.reused',mount:{selector:'#page-ui-anchor',mode:'hijack'}}),
    e=>e.code==='E_UI_TARGET');
  const selector=doc.createElement('div');selector.setAttribute('id','other-ui');
  selector.setAttribute('data-opendesk-ui-owner','opendesk.page-ui.v1');doc.body.append(selector);
  assert.throws(()=>createPageUI({id:'u.reused',mount:{selector:'#other-ui'}}),e=>e.code==='E_UI_TARGET');
  assert.equal(old.active(),true);old.destroy();
});
test('framework-like replacement triggers inline -> anchored -> floating without duplicating host',async t=>{
  const {doc,toolbar,anchor}=fixture(t);
  const ui=createPageUI({id:'u.reflow',mount:{selector:'#page-ui-anchor'}});
  let clicked=0;const button=doc.createElement('button');button.type='button';ui.content.append(button);
  ui.on(button,'click',()=>clicked++);
  const newAnchor=doc.createElement('h2');newAnchor.setAttribute('id','page-ui-anchor');
  anchor.remove();toolbar.append(newAnchor);
  await Promise.resolve();
  assert.equal(ui.getMountDiagnostics().strategy,'anchored');
  assert.equal(ui.host.parentNode,doc.body);
  doc.defaultView.dispatchEvent(new Event('scroll'));await new Promise(r=>setTimeout(r,5));
  assert.match(ui.host.style.left,/px$/);
  newAnchor.remove();await Promise.resolve();
  assert.equal(ui.getMountDiagnostics().strategy,'floating');
  button.dispatchEvent(new Event('click'));assert.equal(clicked,1);
  assert.equal(doc.querySelectorAll('[data-opendesk-ui-owner]').length,1);
  assert.deepEqual(ui.getMountDiagnostics().transitions.map(x=>x.strategy),
    ['inline','anchored','floating']);
  ui.destroy();assert.equal(doc.observers.size,0);
});
test('interactive append refused; target missing uses floating; pagehide clears watchers',t=>{
  const {doc}=fixture(t);
  const link=doc.createElement('button');link.setAttribute('id','danger');doc.body.append(link);
  const ui=createPageUI({id:'u.safe',mount:{selector:'#danger',position:'append'}});
  assert.equal(ui.getMountDiagnostics().strategy,'anchored');
  assert.equal(ui.getMountDiagnostics().reason,'interactive_boundary');
  assert.equal(link.children.length,0);
  const fallback=createPageUI({id:'u.missing',mount:{selector:'#not-found'}});
  assert.equal(fallback.getMountDiagnostics().strategy,'floating');
  assert.equal(fallback.getMountDiagnostics().reason,'target_missing');
  doc.defaultView.dispatchEvent(new Event('pagehide'));
  assert.equal(ui.active(),false);assert.equal(fallback.active(),false);
  assert.equal(doc.observers.size,0);
});
