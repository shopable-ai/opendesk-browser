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
  for(const id of ['ps-edit','ps-leave','ps-delete','ps-copy','ps-empty','ps-error'])nodes[id].hidden=true;
  nodes['ps-body'].tagName='TEXTAREA';
  nodes['ps-label'].tagName='INPUT';nodes['ps-name'].tagName='INPUT';
  nodes['ps-enabled'].checked=true;nodes['ps-web'].checked=true;
  const shapes={square:new FakeNode('input'),round:new FakeNode('input')};
  shapes.square.value='square';shapes.square.checked=true;shapes.round.value='round';
  const root={
    ownerDocument:{createElement:tag=>new FakeNode(tag)},
    querySelector(selector){
      if(selector.startsWith('#'))return nodes[selector.slice(1)]||null;
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
test('R1.4 actual Sandbox UI: body-only create, draft veto, copy, disable, delete and quota recovery',async()=>{
  const f=await fixture(),n=f.nodes;
  assert.equal(n['ps-index'].hidden,false);
  assert.equal(n['ps-edit'].hidden,true);
  assert.equal(n['ps-count'].textContent,'0 个快捷按钮');
  n['ps-new'].emit('click');
  assert.equal(n['ps-edit'].hidden,false);
  assert.equal(n['ps-body'].focused,true);
  n['ps-body'].value=' 中文项目\n第二行';n['ps-form'].emit('input');
  assert.equal(f.states.at(-1).dirty,true);
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
  n['ps-back'].emit('click');
  assert.equal(n['ps-leave'].hidden,false,'back is deferred to explicit review');
  n['ps-stay'].emit('click');
  assert.equal(n['ps-body'].value,'覆盖前的未保存正文');
  n['ps-back'].emit('click');n['ps-discard'].emit('click');
  assert.equal(n['ps-index'].hidden,false);
  assert.equal(f.stored().items[0].body,' 中文项目\n第二行','discard cannot modify saved content');

  // User switches web buttons off without losing any content.
  n['ps-web'].checked=false;n['ps-web'].emit('change');await settle();
  assert.equal(f.stored().settings.webButtons,false);
  assert.equal(f.stored().items.length,1);

  buttonByText(n['ps-list'],'更多').emit('click');
  buttonByText(n['ps-list'],'停用').emit('click');await settle();
  assert.equal(f.stored().items[0].enabled,false);

  // Oversized body cannot silently truncate or overwrite the earlier item.
  n['ps-new'].emit('click');
  n['ps-body'].value='多'.repeat(4000);n['ps-form'].emit('input');
  const earlier=f.writes();
  n['ps-form'].emit('submit',{preventDefault(){}});await settle();
  assert.equal(f.writes(),earlier);
  assert.equal(n['ps-edit'].hidden,false);
  assert.equal(n['ps-body'].value.length,4000);
  assert.match(n['ps-error'].textContent,/8 KiB/);
  n['ps-cancel'].emit('click');n['ps-discard'].emit('click');
  assert.equal(f.stored().items.length,1);

  if(!allDescendants(n['ps-list']).some(item=>item.tagName==='BUTTON'&&item.textContent==='删除'))
    buttonByText(n['ps-list'],'更多').emit('click');
  buttonByText(n['ps-list'],'删除').emit('click');
  assert.equal(n['ps-delete'].hidden,false);
  n['ps-delete-yes'].emit('click');await settle();
  assert.equal(f.stored().items.length,0);
});
