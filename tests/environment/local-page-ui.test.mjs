import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pageProgramUrlMatches,validatePageProgramRules} from '../../src/scripting/user-scripts/page-program-rules.js';
import {render} from '../../examples/programs/local-page-ui/src/view.js';

const project='examples/programs/local-page-ui';
const manifest=JSON.parse(await readFile(project+'/package.json','utf8'));

class Element extends EventTarget {
  constructor(tag,doc){
    super();this.tag=tag;this.ownerDocument=doc;this.children=[];
    this.className='';this.dataset={};this.attributes={};this.textContent='';this.style={};
  }
  setAttribute(key,value){this.attributes[key]=value;}
  append(...children){this.children.push(...children);}
  click(){this.dispatchEvent(new Event('click'));}
}
function harness(host='docs.example.test') {
  const doc={defaultView:{location:{host}}};
  doc.createElement=tag=>new Element(tag,doc);
  const content=doc.createElement('div');
  let disposed=0;
  const ui={
    content,
    getAsset:path=>{assert.equal(path,'assets/mark.png');return 'data:image/png;base64,AA==';},
    on:(target,type,handler)=>target.addEventListener(type,handler),
    destroy:()=>{disposed++;}
  };
  const find=(predicate,node=content)=>{
    if(predicate(node))return node;
    for(const child of node.children){const found=find(predicate,child);if(found)return found;}
    return null;
  };
  return {ui,find,get disposed(){return disposed;}};
}

test('local-page-ui remains a top-frame, on-demand USER_SCRIPT with standard HTTP(S) eligibility',()=>{
  const meta=manifest.opendesk;
  assert.equal(meta.id,'sample.local-page-ui');
  assert.equal(meta.runtimeKind,'page-userscript');
  assert.deepEqual(validatePageProgramRules(meta.pageRules).matches,['*://*/*']);
  assert.equal(meta.pageRules.allFrames,false);
  assert.equal(meta.pageRules.world,'USER_SCRIPT');
  assert.equal(meta.pageRules.runAt,'document_idle');
  for(const url of ['http://127.0.0.1:43111/demo-form.html','http://localhost:9123/',
    'https://docs.example.test/articles/1','https://another.test/'])
    assert.equal(pageProgramUrlMatches(meta.pageRules,url),true,url);
  for(const url of ['chrome://extensions/','file:///tmp/a.html','about:blank','data:text/html,x',
    'https://user:secret@docs.example.test/'])
    assert.equal(pageProgramUrlMatches(meta.pageRules,url),false,url);
});

test('floating view works without host-page headings or special DOM; actions affect only its own nodes',()=>{
  assert.match(await readFile(project+'/assets/ui.css','utf8'),/background:rgb\(31,102,178\)/);
  const h=harness('shop.example.test:8443');
  render(h.ui,{label:'测试点击',step:3});
  const card=h.find(node=>node.className==='od-card local-page-ui');
  assert.ok(card);
  assert.equal(h.find(node=>node.className==='local-ui-site').textContent,'已挂载 · shop.example.test:8443');
  assert.equal(h.find(node=>node.className?.includes('local-ui-action')).type,'button');
  const counter=h.find(node=>node.tag==='output');
  const action=h.find(node=>node.className==='local-ui-action' || node.className?.includes('local-ui-action'));
  assert.equal(counter.textContent,'0');
  action.click();action.click();
  assert.equal(counter.textContent,'6');
  assert.equal(counter.dataset.count,'6');
  const close=h.find(node=>node.className==='od-button local-ui-close');
  assert.equal(close.type,'button');
  assert.equal(close.dataset.action,'close');
  assert.equal(action.dataset.action,'count');
  close.click();assert.equal(h.disposed,1);
});

test('site label is text-only, cannot inject markup, and does not require window.location',()=>{
  const h=harness('<img src=x onerror=alert(1)>');
  render(h.ui,{label:'<b>Test</b>',step:1});
  assert.equal(h.find(node=>node.className==='local-ui-site').textContent,
    '已挂载 · <img src=x onerror=alert(1)>');
  assert.equal(h.find(node=>node.className?.includes('local-ui-action')).textContent,'<b>Test</b>');
  assert.equal(h.find(node=>node.tag==='img').alt,'');
});
