import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageUI} from '../../src/scripting/user-scripts/page-ui.js';

// Lightweight DOM double; CSP/rendering must still be checked in real Chrome.
class Element extends EventTarget {
  constructor(tag,doc){super();this.tag=tag;this.ownerDocument=doc;
    this.parentNode=null;this.children=[];this.props={};this.style={};}
  get isConnected(){return this===this.ownerDocument.documentElement||!!this.parentNode?.isConnected;}
  append(...xs){xs.forEach(x=>this.appendChild(x));}
  appendChild(x){x.remove();x.parentNode=this;this.children.push(x);return x;}
  insertBefore(x,ref){x.remove();x.parentNode=this;
    const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,x);return x;}
  remove(){if(!this.parentNode)return;const arr=this.parentNode.children;
    arr.splice(arr.indexOf(this),1);this.parentNode=null;}
  setAttribute(k,v){this.props[k]=v;}
  getAttribute(k){return this.props[k]||null;}
  attachShadow(){const el=new Element('shadow',this.ownerDocument);el.parentNode=this;return el;}
}
class Doc {
  constructor(){
    this.defaultView=new EventTarget();
    Object.assign(this.defaultView,{setTimeout,clearTimeout,setInterval,clearInterval,
      URL:{createObjectURL:()=> 'blob:mock',revokeObjectURL:()=>{}},
      MutationObserver:class{observe(){} disconnect(){}}});
    this.documentElement=new Element('html',this);
    this.body=new Element('body',this);this.documentElement.appendChild(this.body);
  }
  createElement(tag){return new Element(tag,this);}
  querySelectorAll(){
    const items=[];const walk=e=>{if(e.getAttribute('data-opendesk-ui-owner'))items.push(e);
      for(const c of e.children)walk(c);};walk(this.documentElement);return items;
  }
}
test('same-id replacement disposes old listener, keeps a different instance',()=>{
  const before=globalThis.document;const doc=new Doc();globalThis.document=doc;
  try{
    let calls=0,cleanups=0;
    const first=createPageUI({id:'sample.one'});
    const btn=doc.createElement('button');first.content.append(btn);
    first.on(btn,'click',()=>calls++);first.onDispose(()=>cleanups++);
    btn.dispatchEvent(new Event('click'));assert.equal(calls,1);
    const second=createPageUI({id:'sample.two',baseStyles:false,css:'.x{color:red}'});
    const next=createPageUI({id:'sample.one'});
    assert.equal(cleanups,1);assert.equal(first.active(),false);
    btn.dispatchEvent(new Event('click'));assert.equal(calls,1);
    assert.equal(doc.querySelectorAll().length,2);
    next.destroy();assert.equal(second.active(),true);
    second.destroy();assert.equal(doc.querySelectorAll().length,0);
  }finally{globalThis.document=before;}
});
test('assets, timer/observer/ObjectURL and pagehide cleanup remain scoped',()=>{
  const before=globalThis.document;const doc=new Doc();globalThis.document=doc;
  try{
    let disconnected=0,created=0,revoked=0;
    doc.defaultView.MutationObserver=class{constructor(){created++;}observe(){}disconnect(){disconnected++;}};
    doc.defaultView.URL={createObjectURL:()=> 'blob:mock',revokeObjectURL:()=>revoked++};
    const ui=createPageUI({id:'sample.resources',assets:{
      'one.css':{kind:'css',text:'.a{color:red}'},
      'two.png':{kind:'image',url:'data:image/png;base64,AAAA'},
      'three.json':{kind:'json',text:'{"works":true}'}
    }});
    assert.match(ui.getAsset('one.css'),/color:red/);
    assert.deepEqual(ui.getAsset('three.json'),{works:true});
    assert.match(ui.getAsset('two.png'),/^data:image/);
    assert.throws(()=>ui.getAsset('unknown'),e=>e.code==='E_UI_RESOURCE');
    ui.addStyle(ui.getAsset('one.css'));ui.observe(ui.content,()=>{});ui.objectURL({});
    ui.setTimeout(()=>{},20000);ui.setInterval(()=>{},20000);
    doc.defaultView.dispatchEvent(new Event('pagehide'));
    assert.equal(ui.active(),false);assert.equal(disconnected,created);assert.equal(revoked,1);
    for(let i=0;i<20;i++){const item=createPageUI({id:'cycle',baseStyles:false});
      assert.equal(item.shadowRoot.children.filter(x=>x.tag==='style').length,0);
      item.destroy();}
    assert.equal(doc.querySelectorAll().length,0);
  }finally{globalThis.document=before;}
});
