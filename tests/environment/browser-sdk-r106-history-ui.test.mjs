import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BROWSER_OPERATIONS,BROWSER_HOST_PROTOCOL} from '../../src/framework/sdk/browser-contract.js';
import {createTrustedHistoryWorkbench,normalizeTrustedHistoryForm} from '../../src/ui/trusted-history-workbench.js';

const hostInstanceId='01234567-89ab-4def-8123-456789abcdef';

class Node{
  constructor(tag='div',id=''){
    this.tag=tag;this.id=id;this.children=[];this.listeners=new Map();
    this.dataset={};this.className='';this.textContent='';this.value='';
    this.disabled=false;this.hidden=false;this.attributes={};
  }
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  addEventListener(name,fn){this.listeners.set(name,[...(this.listeners.get(name)||[]),fn]);}
  removeEventListener(name,fn){
    this.listeners.set(name,(this.listeners.get(name)||[]).filter(item=>item!==fn));
  }
  emit(name,isTrusted=true){for(const fn of this.listeners.get(name)||[])fn({isTrusted});}
  setAttribute(key,value){this.attributes[key]=value;}
  querySelectorAll(selector){
    const self=selector.startsWith('.')&&this.className.split(/\s+/).includes(selector.slice(1))||
      selector===this.tag||selector==='#'+this.id?[this]:[];
    return self.concat(this.children.flatMap(child=>child.querySelectorAll(selector)));
  }
}

function makeDom(width=360){
  const root=new Node('section','trusted-history-panel');
  root.clientWidth=width;
  const nodes=new Map([[root.id,root]]);
  const add=(id,tag='input')=>{const node=new Node(tag,id);nodes.set(id,node);root.append(node);return node;};
  for(const id of ['trusted-history-text','trusted-history-start','trusted-history-end','trusted-history-limit'])
    add(id,'input');
  add('trusted-history-search','button');
  add('trusted-history-status','p');
  add('trusted-history-results','div');
  const doc={getElementById:id=>nodes.get(id)||null,createElement:tag=>new Node(tag)};
  return {doc,root,get:id=>nodes.get(id)};
}

const flush=()=>new Promise(resolve=>setImmediate(resolve));

function fixture({granted=false,width=360}={}){
  const dom=makeDom(width),calls=[];
  dom.get('trusted-history-text').value='example';
  dom.get('trusted-history-start').value='2026-10-01';
  dom.get('trusted-history-end').value='2026-10-07';
  dom.get('trusted-history-limit').value='3';
  const api={
    permissions:{
      contains:async request=>{calls.push(['contains',structuredClone(request)]);return granted;},
      request(request){calls.push(['request',structuredClone(request)]);granted=true;return Promise.resolve(true);}
    },
    runtime:{sendMessage:async envelope=>{
      calls.push(['sendMessage',structuredClone(envelope)]);
      return {ok:true,data:{visits:[{url:'https://example.com/path',title:'Example',lastVisitTime:Date.UTC(2026,9,3)}]}};
    }}
  };
  const ui=createTrustedHistoryWorkbench({api,doc:dom.doc,hostInstanceId});
  return {...dom,api,calls,ui};
}

test('R10.6 trusted History workbench is optional when DOM is absent',()=>{
  assert.doesNotThrow(()=>createTrustedHistoryWorkbench({doc:{getElementById:()=>null}}).dispose());
});

test('R10.6 trusted History query requires explicit text, date range and bounded limit',()=>{
  assert.deepEqual(normalizeTrustedHistoryForm({
    text:' example ',startDate:'2026-10-01',endDate:'2026-10-31',limit:'25'
  }),{
    text:'example',
    startTime:Date.parse('2026-10-01T00:00:00'),
    endTime:Date.parse('2026-10-31T00:00:00')+24*60*60*1000-1,
    limit:25
  });
  assert.throws(()=>normalizeTrustedHistoryForm({text:'x',startDate:'2026-10-01',endDate:'2026-11-01',limit:5}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeTrustedHistoryForm({text:'x',startDate:'',endDate:'2026-10-01',limit:5}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeTrustedHistoryForm({text:'x',startDate:'2026-10-02',endDate:'2026-10-01',limit:5}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeTrustedHistoryForm({text:'x',startDate:'2026-10-01',endDate:'2026-10-02',limit:101}),{code:'E_SCHEMA'});
});

test('R10.6 real click synchronously requests optional history permission then calls Host route',async()=>{
  const f=fixture();
  await flush();
  f.calls.length=0;
  f.get('trusted-history-search').emit('click',true);
  assert.deepEqual(f.calls[0],['request',{permissions:['history']}],
    'chrome.permissions.request must start in the trusted click handler');
  await flush();await flush();
  const envelope=f.calls.find(([name])=>name==='sendMessage')?.[1];
  assert.equal(envelope.protocol,BROWSER_HOST_PROTOCOL);
  assert.equal(envelope.kind,'host');
  assert.equal(envelope.operation,'browser.history.searchTrusted');
  assert.equal(envelope.hostInstanceId,hostInstanceId);
  assert.deepEqual(envelope.args.text,'example');
  assert.equal(f.get('trusted-history-results').querySelectorAll('.trusted-history-result').length,1);
  f.ui.dispose();
});

test('R10.6 synthetic click and invalid ranges never request permission or reach Host',async()=>{
  const synthetic=fixture();await flush();synthetic.calls.length=0;
  synthetic.get('trusted-history-search').emit('click',false);
  await flush();
  assert.deepEqual(synthetic.calls,[]);
  synthetic.ui.dispose();

  const invalid=fixture();await flush();invalid.calls.length=0;
  invalid.get('trusted-history-end').value='2026-11-10';
  invalid.get('trusted-history-search').emit('click',true);
  await flush();
  assert.deepEqual(invalid.calls,[]);
  assert.match(invalid.get('trusted-history-status').textContent,/最多 31 天/);
  invalid.ui.dispose();
});

test('R10.6 trusted History UI is not exposed through ordinary Browser SDK tool operations',async()=>{
  assert.equal(Object.keys(BROWSER_OPERATIONS).some(name=>name.startsWith('browser.history.')),false);
  const source=await readFile('src/ui/trusted-history-workbench.js','utf8');
  assert.match(source,/kind:'host'/);
  assert.match(source,/browser\.history\.searchTrusted/);
  assert.doesNotMatch(source,/kind:'tool'|iframe|createElement\('script'\)|innerHTML|eval\(|new Function/);
});

test('R10.6 static 320/360/460 component contract uses od primitives without fixed widths',async()=>{
  const source=await readFile('src/ui/trusted-history-workbench.js','utf8');
  assert.doesNotMatch(source,/style\.(?:width|minWidth|maxWidth)|width:\s*\d/);
  for(const width of [320,360,460]){
    const f=fixture({granted:true,width});
    await flush();
    assert.equal(f.root.dataset.trustedHistoryWorkbench,'mounted');
    f.get('trusted-history-search').emit('click',true);
    await flush();await flush();
    assert.equal(f.get('trusted-history-search').disabled,false);
    assert.equal(f.get('trusted-history-results').querySelectorAll('.od-surface').length,1);
    assert.equal(f.get('trusted-history-results').querySelectorAll('.od-stack').length,1);
    f.ui.dispose();
  }
});
