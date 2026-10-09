import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageUI} from '../../src/scripting/user-scripts/page-ui.js';
import {renderPanel} from '../../examples/programs/page-ui-basic/src/view.js';

// Component evidence only. Real Shadow DOM, native input and resource decode
// are verified separately in the workflow's controlled Chrome session.
class Element extends EventTarget {
  constructor(tag,doc){super();Object.assign(this,{tag,ownerDocument:doc,parentNode:null,children:[],props:{},style:{},dataset:{},value:'',disabled:false});}
  get isConnected(){return this===this.ownerDocument.documentElement||!!this.parentNode?.isConnected;}
  append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
  appendChild(node){this.append(node);return node;}
  insertBefore(node,ref){node.remove();node.parentNode=this;const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,node);}
  remove(){if(this.parentNode){const nodes=this.parentNode.children;nodes.splice(nodes.indexOf(this),1);this.parentNode=null;}}
  setAttribute(key,value){this.props[key]=value;}
  getAttribute(key){return this.props[key]||null;}
  attachShadow(){this.shadowRoot=new Element('shadow',this.ownerDocument);this.shadowRoot.parentNode=this;return this.shadowRoot;}
  focus(){this.ownerDocument.activeElement=this;}
  click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}
}
function harness(){
  const doc={title:'Title at mount',createElement:tag=>new Element(tag,doc)};
  doc.documentElement=new Element('html',doc);doc.body=new Element('body',doc);doc.documentElement.append(doc.body);
  const timers=new Map();let scheduled=0,completed=0;
  doc.defaultView=new EventTarget();
  Object.assign(doc.defaultView,{setTimeout:fn=>{timers.set(++scheduled,fn);return scheduled;},clearTimeout:id=>timers.delete(id)});
  const all=root=>[root,...root.children.flatMap(all)];
  doc.querySelectorAll=()=>all(doc.documentElement).filter(n=>n.getAttribute('data-opendesk-ui-owner'));
  const before=globalThis.document;globalThis.document=doc;
  const mount=()=>{
    const ui=createPageUI({id:'sample.page-ui-basic.panel',assets:{'assets/mark.png':{kind:'image',url:'data:image/png;base64,AAAA'}}});
    renderPanel(ui,{config:{title:'Configured title',hint:'Configured hint'},onClose:()=>ui.destroy(),onExit:()=>ui.destroy()});
    const nodes=all(ui.content),find=cls=>nodes.find(n=>n.className?.split(' ').includes(cls));
    return {ui,input:find('od-input'),run:find('od-button--primary'),status:find('od-status'),result:find('od-result'),
      close:nodes.find(n=>n.textContent==='关闭'),exit:nodes.find(n=>n.textContent==='完全退出')};
  };
  return {doc,mount,timers,get scheduled(){return scheduled;},get completed(){return completed;},
    flush(){for(const [id,fn] of [...timers]){timers.delete(id);completed++;fn();}},
    cleanup(){for(const host of doc.querySelectorAll())host.dispatchEvent(new Event('opendesk:page-ui:dispose:v1'));globalThis.document=before;}};
}
test('Page UI reads the title at click, trims input, and preserves that snapshot during busy',()=>{
  const h=harness();try{
    const p=h.mount();h.doc.title='Title at click';p.input.value='  OpenDesk UI  ';p.run.click();
    assert.equal(p.status.dataset.state,'busy');assert.equal(p.run.disabled,true);assert.equal(h.scheduled,1);
    h.doc.title='Title after click';h.flush();
    assert.deepEqual(JSON.parse(p.result.textContent),{pageTitle:'Title at click',input:'OpenDesk UI'});
    assert.equal(p.status.dataset.state,'success');assert.equal(p.run.disabled,false);
  }finally{h.cleanup();}
});
test('empty and whitespace input focus the field without scheduling or replacing a prior result',()=>{
  const h=harness();try{
    const p=h.mount();p.input.value='OK';p.run.click();h.flush();const previous=p.result.textContent;
    for(const input of ['', ' \t\n ']){p.input.value=input;p.run.click();assert.equal(p.status.dataset.state,'error');
      assert.equal(h.doc.activeElement,p.input);assert.equal(p.result.textContent,previous);assert.equal(h.scheduled,1);}
  }finally{h.cleanup();}
});
test('Enter and repeated clicks while busy schedule exactly one callback; next input has its own result',()=>{
  const h=harness();try{
    const p=h.mount();const enter=()=>p.input.dispatchEvent(Object.assign(new Event('keydown'),{key:'Enter'}));
    p.input.value='first';enter();p.input.value='second';enter();p.run.click();p.run.click();
    assert.equal(h.scheduled,1);h.flush();assert.equal(JSON.parse(p.result.textContent).input,'first');
    enter();assert.equal(h.scheduled,2);h.flush();assert.equal(JSON.parse(p.result.textContent).input,'second');
    assert.equal(h.completed,2);
  }finally{h.cleanup();}
});
test('close, exit, pagehide and same-id replacement cancel pending work and retire old listeners',()=>{
  for(const action of ['close','exit','pagehide','replace']){
    const h=harness();try{
      const p=h.mount();p.input.value='old';p.run.click();assert.equal(h.timers.size,1);
      const before=p.result.textContent;let next;
      if(action==='replace')next=h.mount();else if(action==='pagehide')h.doc.defaultView.dispatchEvent(new Event('pagehide'));else p[action].click();
      assert.equal(p.ui.active(),false);assert.equal(h.timers.size,0);h.flush();assert.equal(p.result.textContent,before);
      p.run.disabled=false;p.run.click();assert.equal(h.scheduled,1,'retired listener must not schedule work');
      if(next){next.input.value='new';next.run.click();h.flush();assert.equal(JSON.parse(next.result.textContent).input,'new');}
    }finally{h.cleanup();}
  }
});
