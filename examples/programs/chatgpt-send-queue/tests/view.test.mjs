import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createQueueView} from '../src/view.js';

// A small, independent DOM/flow fixture. Rectangles are explicit CSS-pixel
// inputs, not a replica of ChatGPT markup or a claim of browser rendering QA.
class Style {
  values=new Map();
  setProperty(key,value,priority=''){this.values.set(key,[String(value),priority]);}
  getPropertyValue(key){return this.values.get(key)?.[0]||'';}
  getPropertyPriority(key){return this.values.get(key)?.[1]||'';}
  removeProperty(key){this.values.delete(key);}
}
const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
const defaults={display:'block',visibility:'visible',opacity:'1',backgroundColor:'transparent',
  backgroundImage:'none',boxShadow:'none',borderTopLeftRadius:'0px',borderTopRightRadius:'0px',
  borderBottomRightRadius:'0px',borderBottomLeftRadius:'0px'};
class Node {
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];
    this.style=new Style();this.computed={...defaults};this.dataset={};this.attributes={};}
  get isConnected(){return this===this.ownerDocument.body||!!this.parentElement?.isConnected;}
  get nextSibling(){const siblings=this.parentElement?.children||[];return siblings[siblings.indexOf(this)+1]||null;}
  append(...nodes){for(const node of nodes){node.remove();this.children.push(node);node.parentElement=this;}}
  insertBefore(node,before){node.remove();this.children.splice(this.children.indexOf(before),0,node);node.parentElement=this;}
  remove(){if(this.parentElement){const siblings=this.parentElement.children;siblings.splice(siblings.indexOf(this),1);this.parentElement=null;}}
  replaceChildren(...nodes){for(const child of [...this.children])child.remove();this.append(...nodes);}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  setAttribute(key,value){this.attributes[key]=value;}
  getAttribute(key){return this.attributes[key];}
  closest(){return null;}
  querySelectorAll(selector){return this.children.flatMap(child=>[
    ...(selector==='button'?child.tagName==='button':selector==='[data-id-row]'?
      !!child.dataset.idRow:selector==='[data-action]'?!!child.dataset.action:false)?[child]:[],
    ...child.querySelectorAll(selector)]);}
  getBoundingClientRect(){return this.measure?.()||rect(0,0,0,0);}
}
function fixture({radius='28px',rightRadius=radius,paint=true,damage='',coarse=false}={}){
  const doc={defaultView:{getComputedStyle:node=>node.computed,matchMedia:()=>({matches:coarse})},
    createElement:tag=>new Node(doc,tag),createElementNS:(_ns,tag)=>new Node(doc,tag)};
  doc.body=new Node(doc,'body');
  const parent=doc.createElement('main'),form=doc.createElement('form');
  const surface=doc.createElement('section'),wrapper=doc.createElement('div');
  const editorShell=doc.createElement('div'),editor=doc.createElement('textarea');
  const toolbar=doc.createElement('div'),native=doc.createElement('button'),aux=doc.createElement('button');
  doc.body.append(parent);parent.append(form);form.append(surface);surface.append(wrapper);
  wrapper.append(editorShell,toolbar);editorShell.append(editor);toolbar.append(aux,native);
  const managed=[],waits=[],calls=[],disposals=[];
  let state={items:[{id:'q1',text:'queued text',state:'queued'}],expanded:false,answerGate:true};
  const getUI=kind=>managed.find(ui=>ui.kind===kind&&ui.active());
  const shown=kind=>getUI(kind)?.host.style.getPropertyValue('display')!=='none'&&
    !!getUI(kind)?.host.isConnected;
  const listHeight=100;
  const flow=()=>shown('list')?listHeight+(parseFloat(getUI('list').host.style.getPropertyValue('margin-bottom'))||0):0;
  const top=()=>400+flow();
  parent.measure=()=>rect(80,380,760,300);
  form.measure=()=>rect(100,top(),680,180);
  surface.measure=()=>rect(130,top()+20,560,140);
  wrapper.measure=surface.measure;
  editorShell.measure=()=>rect(146,top()+36,528,60);
  editor.measure=()=>rect(146,top()+36,528-(shown('button')?(damage==='editor'?60:damage==='inline'?40:0):0),60);
  toolbar.measure=()=>rect(146,top()+104,528,40);
  native.measure=()=>rect(636,top()+106,shown('button')&&damage==='button'?20:34,34);
  aux.measure=()=>rect(146,top()+106,34,34);
  Object.assign(surface.computed,{backgroundColor:paint?'rgb(255, 255, 255)':'transparent',
    borderTopLeftRadius:radius,borderTopRightRadius:rightRadius,
    borderBottomLeftRadius:radius,borderBottomRightRadius:rightRadius});
  // A painted editor-only shell and a transparent rounded wrapper must lose
  // to the first painted ancestor that also contains the native controls.
  Object.assign(editorShell.computed,{backgroundColor:'white',borderTopLeftRadius:'12px',borderTopRightRadius:'12px'});
  Object.assign(wrapper.computed,{borderTopLeftRadius:'44px',borderTopRightRadius:'44px'});
  const createPageUI=({id})=>{
    const kind=id.endsWith('.list')?'list':'button',host=doc.createElement('host');
    const content=doc.createElement('shadow');
    content.measure=host.measure=()=>{
      if(host.style.getPropertyValue('display')==='none')return rect(0,0,0,0);
      const width=parseFloat(host.style.getPropertyValue('width'))||0;
      return kind==='list'?rect(100+(parseFloat(host.style.getPropertyValue('margin-left'))||0),400,width,listHeight):
        rect(damage==='overlap'?640:636-width-6,top()+(damage==='input-overlap'?40:106),width,width);
    };
    // Shadow children are intentionally outside light-DOM queries/containment.
    const append=content.append.bind(content);
    content.append=(...nodes)=>{append(...nodes);for(const node of nodes){
      if(node.className==='sq-send')node.measure=host.measure;
    }};
    let active=true;
    const listeners=[];
    const ui={kind,host,content,shadowRoot:{activeElement:null},listeners,
      active:()=>active,addStyle(){},on(node,event,callback){listeners.push({node,event,callback});},
      destroy(){active=false;host.remove();}};
    managed.push(ui);return ui;
  };
  const owner={content:{ownerDocument:doc},getAsset:()=>'',onDispose:fn=>disposals.push(fn),setTimeout(){}};
  const engine={view:()=>state,wait:reason=>waits.push(reason)};
  const view=createQueueView({owner,createPageUI,assets:[],engine,
    actions:{sendNow:id=>calls.push(id)}});
  return {view,doc,form,surface,wrapper,editor,native,toolbar,parent,managed,waits,calls,
    snap:{ok:true,form,editor,sendButton:native},ui:getUI,
    state:value=>{state={...state,...value};},dispose:()=>disposals.forEach(fn=>fn())};
}
const panel=h=>h.ui('list').content.children[0];

test('docks to visible shared rounded surface, not form or editor-only/transparent shells',()=>{
  const h=fixture(),original=h.form.getBoundingClientRect().width,input=h.editor.getBoundingClientRect().width;
  h.form.style.setProperty('border-top-left-radius','17px','important');
  const originalStyles=[...h.form.style.values];
  assert.equal(h.view.place(h.snap),true);h.view.render();
  const box=h.ui('list').host.getBoundingClientRect(),surface=h.surface.getBoundingClientRect();
  assert.equal(box.width,504);assert.equal(box.left,surface.left+28);
  assert.equal(box.right,surface.right-28);assert.equal(box.bottom,surface.top);
  assert.equal(panel(h).style.getPropertyValue('--sq-surface-radius'),'28px 28px 0 0 / 28px 28px 0 0');
  assert.equal(h.form.getBoundingClientRect().width,original);assert.equal(h.editor.getBoundingClientRect().width,input);
  assert.deepEqual([...h.form.style.values],originalStyles);assert.equal(h.surface.style.values.size,0);
  for(let i=0;i<3;i++){assert.equal(h.view.place(h.snap),true);assert.deepEqual(h.ui('list').host.getBoundingClientRect(),box);}
  const force=panel(h).querySelectorAll('button').find(node=>node.dataset.action==='now');
  assert.equal(force.title,'强制发送');assert.equal(force.getAttribute('aria-label'),'强制发送');
  h.ui('list').listeners.find(x=>x.event==='click').callback({target:{closest:()=>force},stopPropagation(){}});
  assert.deepEqual(h.calls,['q1']);
  h.dispose();assert.deepEqual([...h.form.style.values],originalStyles);
  assert.ok(h.managed.every(ui=>!ui.active()&&!ui.host.isConnected));
});

test('resolves asymmetric elliptical percentages and CSS overlapping-radius scaling',()=>{
  const h=fixture({radius:'10% 80%',rightRadius:'5% 80%'});
  assert.equal(h.view.place(h.snap),true);
  // 112px vertical radii exceed the 140px edge: common scale is 0.625.
  assert.equal(h.ui('list').host.getBoundingClientRect().width,507.5);
  assert.equal(h.ui('list').host.getBoundingClientRect().left,165);
  assert.equal(panel(h).style.getPropertyValue('--sq-surface-radius'),'35px 17.5px 0 0 / 70px 70px 0 0');
});

test('recomputes when the shared surface changes and never rewrites native inline styles',()=>{
  const h=fixture();assert.equal(h.view.place(h.snap),true);
  h.wrapper.computed.backgroundColor='white';
  assert.equal(h.view.place(h.snap),true);
  assert.equal(h.ui('list').host.getBoundingClientRect().width,472);
  assert.equal(panel(h).style.getPropertyValue('--sq-surface-radius'),'44px 44px 0 0 / 44px 44px 0 0');
  h.view.hide();assert.equal(h.ui('list').host.style.getPropertyValue('margin-bottom'),'');
  assert.equal(panel(h).style.getPropertyValue('--sq-surface-radius'),'');
  assert.equal(h.ui('button').host.style.getPropertyValue('display'),'none');
  assert.equal(h.view.place(h.snap),true);
  h.state({items:[]});h.view.render();
  assert.equal(h.ui('list').host.style.getPropertyValue('display'),'none');
  assert.equal(h.ui('list').host.style.getPropertyValue('margin-left'),'');
  for(const node of [h.form,h.surface,h.wrapper,h.editor,h.native])assert.equal(node.style.values.size,0);
});

for(const damage of ['editor','button','overlap','input-overlap'])test(`withdraws UI on ${damage} geometry damage`,()=>{
  const h=fixture({damage});assert.equal(h.view.place(h.snap),false);
  assert.ok(h.waits.length);assert.equal(h.ui('button').host.style.getPropertyValue('display'),'none');
  assert.equal(h.ui('list').host.style.getPropertyValue('display'),'none');
  assert.equal(h.editor.getBoundingClientRect().width,528);assert.equal(h.native.getBoundingClientRect().width,34);
  h.dispose();assert.ok(h.managed.every(ui=>!ui.host.isConnected));
});

test('missing, hidden or detached shared surface hides previously placed UI',()=>{
  for(const change of [h=>{h.surface.computed.backgroundColor='transparent';},
    h=>{h.surface.computed.display='none';},h=>h.editor.remove(),h=>h.native.remove()]){
    const h=fixture();assert.equal(h.view.place(h.snap),true);change(h);
    assert.equal(h.view.place(h.snap),false);
    assert.equal(h.ui('list').host.style.getPropertyValue('display'),'none');
    assert.equal(h.ui('button').host.style.getPropertyValue('display'),'none');
    h.dispose();
  }
});

test('accepts form itself only when it is the visible rounded shared surface',()=>{
  const h=fixture({paint:false});Object.assign(h.form.computed,{backgroundColor:'white',
    borderTopLeftRadius:'20px',borderTopRightRadius:'20px'});
  assert.equal(h.view.place(h.snap),true);
  assert.equal(h.ui('list').host.getBoundingClientRect().width,640);
  assert.equal(h.ui('list').host.getBoundingClientRect().bottom,h.form.getBoundingClientRect().top);
});

test('walks through display:contents wrappers and follows replacement form/editor nodes',()=>{
  const h=fixture();h.wrapper.computed.display='contents';h.wrapper.measure=()=>rect(0,0,0,0);
  assert.equal(h.view.place(h.snap),true);
  const oldForm=h.form,newForm=h.doc.createElement('form');
  newForm.measure=oldForm.measure;newForm.append(h.surface);h.parent.append(newForm);oldForm.remove();
  const newEditor=h.doc.createElement('textarea');newEditor.measure=h.editor.measure;
  h.editor.parentElement.append(newEditor);h.editor.remove();
  assert.equal(h.view.place({...h.snap,form:newForm,editor:newEditor}),true);
  assert.equal(h.ui('list').host.nextSibling,newForm);
  h.dispose();assert.equal(newForm.style.values.size,0);assert.equal(oldForm.style.values.size,0);
});

test('coarse-pointer button keeps its existing 42px hot area and native control stays intact',()=>{
  const h=fixture({coarse:true});assert.equal(h.view.place(h.snap),true);
  assert.equal(h.ui('button').host.getBoundingClientRect().width,42);
  assert.equal(h.native.getBoundingClientRect().width,34);
});

test('panel CSS consumes measured radius without any website selector',async()=>{
  const css=await readFile(new URL('../assets/queue.css',import.meta.url),'utf8');
  assert.match(css,/border-radius:var\(--sq-surface-radius,/);
  assert.doesNotMatch(css,/(?:^|[}\n])\s*(?:form|textarea|#prompt-textarea)[\s:{]/);
});

test('single-line row allows only the added action width without shrinking the native shell or controls',()=>{
  const h=fixture({damage:'inline'});
  assert.equal(h.view.place(h.snap),true);h.view.render();
  assert.equal(h.form.getBoundingClientRect().width,680);
  assert.equal(h.editor.getBoundingClientRect().width,488);
  assert.equal(h.native.getBoundingClientRect().width,34);
  h.view.hide();assert.equal(h.editor.getBoundingClientRect().width,528);
});
