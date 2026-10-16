// Functional Sandbox UI exercise using the exact shipped classic JS (not Chrome acceptance).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';

const tool='examples/sidebar-tools/prompt-shortcuts';
const tick=()=>new Promise(resolve=>setTimeout(resolve,8));
const settle=async()=>{for(let i=0;i<4;i++)await tick();};

class FakeNode{
  constructor(tag='div',id=''){
    this.tagName=tag.toUpperCase();this.id=id;this.className='';this.dataset={};
    this.hidden=false;this.disabled=false;this.checked=false;this.value='';
    this.children=[];this.textContent='';this.attributes={};this.handlers=new Map();
    // Keep dynamic class tokens consistent with the current production markup.
    this.classList={
      contains:token=>this.className.split(/\s+/).includes(token),
      add:(...tokens)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));
        for(const token of tokens)set.add(token);this.className=[...set].join(' ');},
      toggle:(token,force)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));
        const enabled=force===undefined?!set.has(token):Boolean(force);
        if(enabled)set.add(token);else set.delete(token);
        this.className=[...set].join(' ');return enabled;}
    };
  }
  append(...nodes){this.children.push(...nodes);}
  prepend(...nodes){this.children.unshift(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  querySelectorAll(selector){
    if(selector!=='button')return [];
    const all=[];
    const visit=node=>{for(const child of node.children){if(child.tagName==='BUTTON')all.push(child);visit(child);}};
    visit(this);return all;
  }
  addEventListener(name,fn){const old=this.handlers.get(name)||[];this.handlers.set(name,[...old,fn]);}
  removeEventListener(name,fn){this.handlers.set(name,(this.handlers.get(name)||[]).filter(f=>f!==fn));}
  emit(name,event={}){for(const fn of this.handlers.get(name)||[])fn(event);}
  focus(){this.focused=true;}
  select(){this.selected=true;}
  setAttribute(name,value){this.attributes[name]=value;}
}
function allDescendants(node){
  const result=[];const visit=n=>{for(const child of n.children){result.push(child);visit(child);}};visit(node);
  return result;
}
function buttonByText(root,text){
  const button=allDescendants(root).find(node=>node.tagName==='BUTTON'&&node.textContent===text);
  assert(button,'missing clickable '+text);return button;
}
async function fixture(){
  const [html,main,modelSource]=await Promise.all([
    readFile(tool+'/src/index.html','utf8'),readFile(tool+'/src/main.js','utf8'),
    readFile(tool+'/trusted/model.js','utf8')
  ]);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  const nodes=Object.fromEntries(ids.map(id=>[id,new FakeNode('div',id)]));
  for(const id of ['ps-edit','ps-leave','ps-copy','ps-empty','ps-error'])nodes[id].hidden=true;
  nodes['ps-body'].tagName='TEXTAREA';
  nodes['ps-label'].tagName='INPUT';nodes['ps-name'].tagName='INPUT';
  nodes['ps-enabled'].checked=true;nodes['ps-web'].checked=true;
  const shapes={square:new FakeNode('input'),round:new FakeNode('input')};
  shapes.square.value='square';shapes.square.checked=true;shapes.round.value='round';
  const root={
    ownerDocument:{createElement:tag=>new FakeNode(tag)},
    querySelector(selector){
      if(selector.startsWith('#'))return nodes[selector.slice(1)]||null;
      if(selector.startsWith('.'))return allDescendants(nodes['ps-list'])
        .find(node=>node.classList.contains(selector.slice(1)))||null;
      if(selector==='input[name="ps-shape"]:checked')
        return shapes.round.checked?shapes.round:shapes.square;
      const match=selector.match(/^input\[name="ps-shape"\]\[value="(square|round)"\]$/);
      return match?shapes[match[1]]:null;
    },
    addEventListener(){},
  };
  let stored=null,version='a'.repeat(64),writes=0;
  const states=[],requests=[];
  const request=async(op,payload={})=>{
    requests.push({op,payload});
    if(op==='storage.get'){
      assert.equal(payload.key,'library');
      return {value:stored===null?null:structuredClone(stored),etag:version};
    }
    if(op==='storage.set'){
      assert.equal(payload.key,'library');assert.equal(payload.ifMatch,version);
      stored=structuredClone(payload.value);writes++;
      version=String(writes).padStart(64,'0');return {saved:true,etag:version};
    }
    if(op==='clipboard.writeText')return {copied:true};
    throw Error('unexpected operation: '+op);
  };
  const sandbox={
    Intl,TextEncoder,crypto:webcrypto,
    OpenDeskTool:{root,request,setState:row=>states.push({...row})},
    OpenDeskSDK:{browser:{contextMenu:{
      getStatus:async()=>({enabled:false,approvedOrigins:[],browserPermission:false}),
      register:async()=>({registered:true}),unregister:async()=>({registered:false})
    },launch:{consume:async()=>{throw Error('ordinary opening without menu ticket')}}}}
  };
  runInNewContext(modelSource,sandbox,{filename:'trusted/model.js'});
  runInNewContext(main,sandbox,{filename:'src/main.js'});
  await settle();
  return {nodes,root,requests,states,shapes,
    stored:()=>stored,writes:()=>writes,
    chooseShape:value=>{shapes.square.checked=value==='square';shapes.round.checked=value==='round';}
  };
}
test('R1.7 actual Sandbox UI: content-first create, inline confirm, draft guard and quota recovery',async()=>{
  const f=await fixture(),n=f.nodes;
  assert.equal(n['ps-index'].hidden,false);
  assert.equal(n['ps-edit'].hidden,true);
  assert.equal(n['ps-count'].textContent,'0 个 · 0 个启用');
  n['ps-new'].emit('click');
  assert.equal(n['ps-edit'].hidden,false);
  assert.equal(n['ps-body'].focused,true);
  n['ps-body'].value=' 中文项目\n第二行';n['ps-form'].emit('input');
  assert.equal(f.states.at(-1).dirty,true);
  assert.deepEqual(n['ps-preview-glyph'].children.map(x=>x.textContent),['中','文']);
  assert.equal(n['ps-preview-name'].textContent,'中文');
  assert.match(n['ps-quota-value'].textContent,/^\d+ \/ 8192 B$/);
  assert.equal(n['ps-quota'].dataset.error,'false');
  n['ps-form'].emit('submit',{preventDefault(){}});
  await settle();
  assert.equal(f.writes(),1);
  const saved=f.stored();
  assert.equal(saved.items[0].body,' 中文项目\n第二行');
  assert.equal(saved.items[0].label,'中文');
  assert.equal(saved.items[0].name,'中文');
  assert.equal(saved.items[0].labelAuto,true);
  assert.equal(saved.items[0].enabled,true);
  assert.equal(n['ps-index'].hidden,false);
  assert.equal(f.states.at(-1).dirty,false);

  // Reopen and edit the content, protect unsaved changes on Back.
  buttonByText(n['ps-list'],'编辑').emit('click');
  assert.equal(n['ps-label'].value,'','automatic label stays unset during editing');
  n['ps-body'].value='覆盖前的未保存正文';n['ps-form'].emit('input');
  n['ps-cancel'].emit('click');
  assert.equal(n['ps-leave'].hidden,false,'back is deferred to explicit review');
  n['ps-stay'].emit('click');
  assert.equal(n['ps-body'].value,'覆盖前的未保存正文');
  n['ps-cancel'].emit('click');n['ps-discard'].emit('click');
  assert.equal(n['ps-index'].hidden,false);
  assert.equal(f.stored().items[0].body,' 中文项目\n第二行','discard cannot modify saved content');

  // User switches web buttons off without losing any content.
  n['ps-web'].checked=false;n['ps-web'].emit('change');await settle();
  assert.equal(f.stored().settings.webButtons,false);
  assert.equal(f.stored().items.length,1);

  buttonByText(n['ps-list'],'⋯').emit('click');
  buttonByText(n['ps-list'],'停用').emit('click');await settle();
  assert.equal(f.stored().items[0].enabled,false);

  // Oversized body cannot silently truncate or overwrite the earlier item.
  n['ps-new'].emit('click');
  n['ps-body'].value='多'.repeat(4000);n['ps-form'].emit('input');
  assert.equal(n['ps-quota'].dataset.error,'true','oversized complete JSON flagged before save');
  const earlier=f.writes();
  n['ps-form'].emit('submit',{preventDefault(){}});await settle();
  assert.equal(f.writes(),earlier);
  assert.equal(n['ps-edit'].hidden,false);
  assert.equal(n['ps-body'].value.length,4000);
  assert.match(n['ps-error'].textContent,/8 KiB/);
  n['ps-cancel'].emit('click');n['ps-discard'].emit('click');
  assert.equal(f.stored().items.length,1);

  if(!allDescendants(n['ps-list']).some(item=>item.tagName==='BUTTON'&&item.textContent==='删除'))
    buttonByText(n['ps-list'],'⋯').emit('click');
  buttonByText(n['ps-list'],'删除').emit('click');
  const confirmation=allDescendants(n['ps-list']).find(node=>node.classList.contains('ps-confirm'));
  assert(confirmation,'delete confirmation must appear inside the prompt card');
  assert.match(confirmation.children[0].textContent,/确认删除/);
  const action=buttonByText(confirmation,'确认删除');
  assert.equal(action.disabled,false);
  action.emit('click');await settle();
  assert.equal(f.stored().items.length,0);
  assert.equal(n['ps-count'].textContent,'0 个 · 0 个启用');
  assert.equal(n['ps-empty'].hidden,false);
});

test('R1.13 management is content-first, one-click copy and no redundant grant widgets',async()=>{
  const [html,preview,host]=await Promise.all([
    readFile(tool+'/src/index.html','utf8'),
    readFile(tool+'/preview/index.html','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8')
  ]);
  assert.doesNotMatch(html,/ps-grant|ps-permission-strip|id="ps-menu"|ps-shapes/);
  assert.doesNotMatch(preview,/permissionView|mockRevoke|openPermissions/);
  assert.match(preview,/id="settingsView"/);
  assert.match(host,/promptNativeAction/);
  assert.match(host,/siteCapability\(active\)&&!promptSettings/);
  const f=await fixture(),n=f.nodes;
  n['ps-new'].emit('click');n['ps-body'].value='第一行\n\n第二行';
  n['ps-form'].emit('input');
  n['ps-form'].emit('submit',{preventDefault(){}});await settle();
  const first=allDescendants(n['ps-list']).find(v=>v.classList.contains('ps-card-use'));
  assert(first,'first visual tier must be a clickable full-body button');
  assert.equal(first.children[0]?.textContent,'第一行\n\n第二行');
  first.emit('click');await settle();
  assert(f.requests.some(v=>v.op==='clipboard.writeText'&&v.payload.text==='第一行\n\n第二行'));
});
