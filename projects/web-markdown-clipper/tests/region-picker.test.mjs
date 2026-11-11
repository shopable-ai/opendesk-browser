import test from 'node:test';
import assert from 'node:assert/strict';
import {beginRegionPick,regionCandidates,preferredRegionIndex} from '../trusted/region-picker.js';

function fixture(){
 const doc={events:new Map(),addEventListener(name,fn){(this.events.get(name)||this.events.set(name,new Set()).get(name)).add(fn);},
  removeEventListener(name,fn){this.events.get(name)?.delete(fn);},
  createElement(tag){return new Element(tag,doc);},async fire(name,event){for(const fn of [...this.events.get(name)||[]])fn(event);}};
 class Element{
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.nodeType=1;this.doc=doc;this.children=[];this.parentElement=null;this.attributes={};
   this.style={cssText:'',outline:'',setProperty:()=>{}};this.text='';}
  append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;}
  setAttribute(name,value){this.attributes[name]=value;}
  getAttribute(name){return this.attributes[name]??null;}
  getRootNode(){return this.doc;}
  get isConnected(){let n=this;while(n){if(n===doc.documentElement)return true;n=n.parentElement;}return false;}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
  set textContent(v){this.text=String(v);this.children=[];}
  matches(selector){
   return selector.split(',').some(s=>{
    s=s.trim();if(s===this.tagName.toLowerCase())return true;
    if(s==='[role="article"]')return this.attributes.role==='article';
    if(s==='main'||s==='[role="main"]')return s==='main'?this.tagName==='MAIN':this.attributes.role==='main';
    if(s==='[aria-busy="true"]')return this.attributes['aria-busy']==='true';
    if(s==='[data-streaming="true"]')return this.attributes['data-streaming']==='true';
    if(s==='[data-state="streaming"]')return this.attributes['data-state']==='streaming';
    if(s.startsWith('[data-message-')||s.startsWith('[data-turn-'))return false;
    if(s==='[inert]')return false;
    if(s==='[aria-hidden="true"]')return this.attributes['aria-hidden']==='true';
    if(s==='[data-opendesk-clip-root]')return this.attributes['data-opendesk-clip-root']!==undefined;
    if(s==='[role="button"]'||s==='[role="navigation"]'||s==='[role="banner"]'||s==='[role="toolbar"]'||s==='[role="textbox"]')
     return this.attributes.role===s.slice(7,-2);
    if(s.startsWith('[contenteditable]'))return this.attributes.contenteditable==='true';
    return false;
   });
  }
  closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
  querySelectorAll(selector){const out=[];const walk=node=>{for(const child of node.children){if(child.matches(selector))out.push(child);walk(child);}};walk(this);return out;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  contains(node){for(let n=node;n;n=n.parentElement)if(n===this)return true;return false;}
  getBoundingClientRect(){return {left:5,top:30,right:400,bottom:300,width:395,height:270};}
 }
 const root=doc.documentElement=new Element('html',doc),body=doc.body=new Element('body',doc);root.append(body);
 const win={innerWidth:500,innerHeight:600,events:new Map(),
  addEventListener(name,fn){(this.events.get(name)||this.events.set(name,new Set()).get(name)).add(fn);},
  removeEventListener(name,fn){this.events.get(name)?.delete(fn);},
  setTimeout(fn){this.timer=fn;return 1;},clearTimeout(){this.timer=null;}};
 const thread=doc.createElement('div');
 const a=doc.createElement('article'),b=doc.createElement('article');
 const p=doc.createElement('p');p.textContent='A'.repeat(350);
 const q=doc.createElement('p');q.textContent='B'.repeat(300);
 a.append(p);b.append(q);thread.append(a,b);body.append(thread);
 const event=(target,extra={})=>({target,isTrusted:true,button:0,defaultPrevented:false,
  preventDefault(){this.defaultPrevented=true;},stopPropagation(){},stopImmediatePropagation(){},...extra});
 return {doc,win,thread,a,b,p,q,event};
}
test('one AI answer is preferred; conversation containing multiple articles is excluded',()=>{
 const {doc,win,thread,p,a,b}=fixture();
 const nodes=regionCandidates(p,doc,win);
 assert.ok(nodes.includes(a));
 assert.ok(!nodes.includes(thread));
 assert.ok(!nodes.includes(b));
 assert.equal(nodes[preferredRegionIndex(nodes)],a);
});
test('one trusted click extracts one connected region, prevents page activation and releases listeners',async()=>{
 const {doc,win,p,a,event}=fixture();let calls=0;
 const pick=beginRegionPick({doc,win,extract:node=>{calls++;assert.equal(node,a);return '## A\n\nBody\n';}});
 await doc.fire('mousemove',event(p));
 const click=event(p);
 await doc.fire('click',click);
 const result=await pick.promise;
 assert.equal(result.markdown,'## A\n\nBody\n');
 assert.equal(result.loadedOnly,true);
 assert.equal(calls,1);
 assert.equal(click.defaultPrevented,true);
 assert.equal(doc.events.get('click').size,0);
 assert.equal(win.timer,null);
});
test('Escape rejects without extraction and leaves no click handlers',async()=>{
 const {doc,win,p,event}=fixture();let calls=0;
 const pick=beginRegionPick({doc,win,extract:()=>{calls++;return 'LEAK';}});
 await doc.fire('mousemove',event(p));
 await doc.fire('keydown',event(p,{key:'Escape'}));
 await assert.rejects(pick.promise,/取消/);
 assert.equal(calls,0);assert.equal(doc.events.get('click').size,0);
});
test('streaming flag is included without claiming missing virtualized content',async()=>{
 const {doc,win,a,p,event}=fixture();a.setAttribute('aria-busy','true');
 const pick=beginRegionPick({doc,win,extract:()=> 'partial'});
 await doc.fire('mousemove',event(p));await doc.fire('click',event(p));
 const result=await pick.promise;
 assert.equal(result.streaming,true);assert.equal(result.loadedOnly,true);
});
test('interactive input and password regions are not selectable',()=>{
 const {doc,win,a}=fixture();
 const form=doc.createElement('form'),input=doc.createElement('input');
 input.setAttribute('type','password');form.append(input);a.append(form);
 assert.deepEqual(regionCandidates(input,doc,win),[]);
});
