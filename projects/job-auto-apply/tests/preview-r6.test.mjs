import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../preview/index.html',import.meta.url),'utf8');
const behavior=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const scenarios=['normal','restricted','contacted','missing','partial','sideclosed',
  'reopened','rules','empty','loading','noaccess','navigation','workflow'];

class MockNode {
  constructor(tag='div'){
    this.tagName=tag.toLowerCase();this.children=[];this.listeners={};
    this.attributes={};this.dataset={};this.hidden=false;this.disabled=false;
    this.value='';this.className='';this._text='';this.checked=false;
    const el=this;
    this.classList={toggle(cls,force){
      const parts=new Set(el.className.split(/\s+/).filter(Boolean));
      const active=force===undefined?!parts.has(cls):!!force;
      if(active)parts.add(cls);else parts.delete(cls);
      el.className=[...parts].join(' ');return active;
    }};
  }
  set textContent(v){this._text=String(v??'');this.children=[];}
  get textContent(){return this._text+this.children.map(x=>x.textContent??String(x)).join('');}
  setAttribute(k,v){this.attributes[k]=String(v);}
  removeAttribute(k){delete this.attributes[k];}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this._text='';this.children=[...nodes];}
  async emit(type,overrides={}){
    const event={target:this,currentTarget:this,preventDefault(){},key:'',...overrides};
    for(const fn of this.listeners[type]||[])await fn(event);
  }
  focus(){this.focused=true;}
  select(){this.selected=true;}
}

function mount(){
  assert.ok(behavior,'preview must provide exactly one inline behavior script');
  const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(m=>[m[1],new MockNode()]));
  const tabs=[...html.matchAll(/data-tab="(jobs|queue|prefs)"/g)]
    .map(m=>Object.assign(new MockNode('button'),{dataset:{tab:m[1]}}));
  for(const id of ['page-addon','site-state','draft','page-fallback','tab-queue','tab-prefs'])
    elements.get(id).hidden=true;
  const f=elements.get('prefs-form');
  f.elements={
    roles:{value:'Android,前端,全栈'},cities:{value:'北京'},salary:{value:'20'},
    exclude:{value:'外包,驻场,培训'},skills:{value:'Kotlin,Java'},
    noHeadhunter:{checked:true},noContacted:{checked:true}
  };
  let timers=[],copies=[];
  const document={
    createElement:tag=>new MockNode(tag),
    getElementById:id=>{
      if(!elements.has(id))throw Error('preview references nonexistent #'+id);
      return elements.get(id);
    },
    querySelectorAll:selector=>{
      if(selector!=='[data-tab]')throw Error('unexpected selector '+selector);
      return tabs;
    }
  };
  const window={setTimeout(fn,ms){timers.push({fn,ms});}};
  const navigator={clipboard:{async writeText(v){copies.push(v);}}};
  const context=vm.createContext({document,window,navigator});
  new vm.Script(behavior,{filename:'job-auto-apply-preview-r6.js'}).runInContext(context);
  return {
    el:id=>elements.get(id),
    tabs,
    copies,
    async settle(){while(timers.length){const pending=timers;timers=[];for(const t of pending)t.fn();await Promise.resolve();}},
    async scenario(mode){assert.ok(scenarios.includes(mode));const selector=elements.get('scenario');selector.value=mode;await selector.emit('change');},
    async click(id){const el=elements.get(id);assert.equal(el.disabled,false,id+' is disabled');await el.emit('click');},
    async submitPrefs(){await f.emit('submit');},
    async selectJob(index){
      const card=elements.get('site-jobs').children[index+1];
      assert.ok(card,'missing card #'+index);await card.emit('click');
    },
    buttons(rootId,label){
      const found=[];function visit(n){if(n.tagName==='button'&&n.textContent.includes(label))found.push(n);
        for(const child of n.children)visit(child);}
      visit(elements.get(rootId));return found;
    },
    chips(){
      const found=[];function visit(n){if(n.className?.includes('quicktag'))found.push(n);
        for(const child of n.children)visit(child);}
      visit(elements.get('site-jobs'));return found;
    }
  };
}
async function ready(mode='normal'){
  const app=mount();
  if(mode!=='normal')await app.scenario(mode);
  await app.settle();return app;
}

test('R6 contract: 13 external scenarios, one isolated script, stable UI controls',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size);
  assert.equal((html.match(/<script\b/g)||[]).length,1);
  for(const scenario of scenarios)assert.match(html,new RegExp('value="'+scenario+'"'));
  for(const id of ['toggle-sidebar','preview-sidebar','preview-workspace',
    'page-fallback','page-inline-draft','page-inline-text','page-inline-copy','detail-jd-state','embed-facts','preview-state'])
    assert.ok(ids.includes(id),id);
  assert.doesNotMatch(behavior,/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|\bchrome\.|OpenDeskTool\.request/);
});
test('01 multiple jobs: autonomous scan, single lightweight tag per card, rules not AI',async()=>{
  const a=await ready();
  assert.equal(a.chips().length,4);
  assert.equal(a.el('page-addon').hidden,false);
  assert.match(a.el('embed-label').textContent,/非 AI 简历匹配/);
  assert.equal(a.el('queue-count').textContent,'0');
});
test('02 excluded job exposes hard condition and prevents adding',async()=>{
  const a=await ready('restricted');
  assert.match(a.el('embed-score').textContent,/条件不符/);
  assert.equal(a.el('page-add').disabled,true);
});
test('03 contacted job shows historical status and blocks duplicate contact',async()=>{
  const a=await ready('contacted');
  assert.match(a.chips()[0].textContent,/已沟通/);
  assert.equal(a.el('page-add').disabled,true);
});
test('04 no stable identity: show unknown, disable queue action',async()=>{
  const a=await ready('missing');
  assert.match(a.chips()[0].textContent,/暂无法识别/);
  assert.equal(a.el('page-add').disabled,true);
});
test('05 unloaded JD must be labelled unknown, not completed',async()=>{
  const a=await ready('partial');
  assert.match(a.el('detail-jd-state').textContent,/详情尚未加载/);
  assert.match(a.el('embed-facts').textContent,/完整 JD：待确认/);
});
test('06 closed Side Panel: page still scans, queues; fallback does not fake opening',async()=>{
  const a=await ready('sideclosed');
  assert.equal(a.el('preview-sidebar').hidden,true);
  assert.equal(a.el('page-addon').hidden,false);
  await a.click('page-add');
  assert.equal(a.el('queue-count').textContent,'1');
  await a.click('page-open');
  assert.equal(a.el('page-fallback').hidden,false);
  assert.equal(a.el('preview-sidebar').hidden,true);
  await a.click('page-draft');
  assert.equal(a.el('page-inline-draft').hidden,false);
  a.el('page-inline-text').value='当前岗位经人工核对的消息';
  await a.el('page-inline-text').emit('input');
  await a.click('page-inline-copy');
  assert.equal(a.copies[0],'当前岗位经人工核对的消息');
  await a.click('page-inline-close');
  assert.equal(a.el('page-inline-draft').hidden,true);
});
test('07 reopening Side Panel preserves queue and selected Tab',async()=>{
  const a=await ready('sideclosed');
  await a.click('page-add');await a.click('toggle-sidebar');
  assert.equal(a.el('preview-sidebar').hidden,false);
  assert.equal(a.el('queue-count').textContent,'1');
  await a.tabs[1].emit('click');
  assert.equal(a.el('tab-queue').hidden,false);
  await a.scenario('reopened');await a.settle();
  assert.equal(a.el('tab-queue').hidden,false,'panel opening must preserve current tab');
  assert.equal(a.el('queue-count').textContent,'1');
  assert.match(a.el('side-queue').textContent,/Android 开发/);
});
test('08 changed rules recompute page and flag saved queue, never silently delete',async()=>{
  const a=await ready();
  await a.click('page-add');await a.scenario('rules');await a.settle();
  assert.equal(a.el('queue-count').textContent,'1');
  assert.match(a.el('side-queue').textContent,/规则变化/);
  assert.match(a.el('embed-score').textContent,/待审·需复核/);
  assert.equal(a.el('page-add').disabled,true);
  assert.equal(Number(a.el('prefs-form').elements.salary.value),42);
});
test('09 empty results show no fabricated job, avoid stale page addon',async()=>{
  const a=await ready('empty');
  assert.equal(a.chips().length,0);
  assert.equal(a.el('page-addon').hidden,true);
  assert.match(a.el('side-empty').textContent,/尚无|没有/);
});
test('10 async loading maintains pending state; stale result cannot overwrite revoke',async()=>{
  const a=mount();
  await a.scenario('loading');
  assert.equal(a.el('page-addon').hidden,true);
  await a.scenario('noaccess');await a.settle();
  assert.equal(a.el('page-addon').hidden,true);
  const b=await ready('loading');
  assert.equal(b.el('page-addon').hidden,false);
  assert.equal(b.chips().length,2);
});
test('11 permission revocation removes website addon; restore does not wipe queue',async()=>{
  const a=await ready();await a.click('page-add');
  await a.scenario('noaccess');await a.settle();
  assert.equal(a.el('page-addon').hidden,true);
  assert.equal(a.el('site-state').hidden,true);
  assert.equal(a.el('queue-count').textContent,'1');
  assert.equal(a.el('scan').disabled,true);
  await a.scenario('normal');await a.settle();
  assert.equal(a.el('page-addon').hidden,false);
  assert.equal(a.el('queue-count').textContent,'1');
});
test('12 navigation, keyboard selection and repeated scans do not duplicate markers',async()=>{
  const a=await ready();
  await a.scenario('navigation');await a.settle();
  assert.equal(a.chips().length,4);
  const card=a.el('site-jobs').children[2];
  assert.equal(card.tabIndex,0);assert.equal(card.attributes.role,'button');
  await card.emit('keydown',{key:'Enter'});
  await a.click('scan');await a.settle();
  assert.equal(a.chips().length,4);
  assert.equal(a.el('side-jobs').children.length,4);
});
test('13 queue, editable draft, close/reopen/copy and removal are real mock interactions',async()=>{
  const a=await ready('workflow');
  await a.click('page-add');await a.click('page-draft');
  assert.equal(a.el('tab-queue').hidden,false);
  a.el('draft-text').value='人工核对后的文本';
  await a.el('draft-text').emit('input');
  await a.click('draft-close');
  await a.buttons('side-queue','准备草稿')[0].emit('click');
  assert.equal(a.el('draft-text').value,'人工核对后的文本');
  await a.click('draft-copy');
  assert.equal(a.copies[0],'人工核对后的文本');
  await a.buttons('side-queue','移出清单')[0].emit('click');
  assert.equal(a.el('queue-count').textContent,'0');
});
