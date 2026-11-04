import test from 'node:test';
import assert from 'node:assert/strict';
import {createLegacyChatGPTTaskPanel} from '../trusted/legacy-chatgpt-panel.js';

function fixture(){
  const nodes=[];
  const element=tag=>{
    const node={tag,style:{},children:[],classList:{toggle(){}},listeners:{},
      setAttribute(key,value){this[key]=value;},
      append(...values){this.children.push(...values);},
      attachShadow(){return element('shadow');},
      addEventListener(type,callback){this.listeners[type]=callback;},
      remove(){this.removed=true;}};
    nodes.push(node);return node;
  };
  const doc={createElement:element,body:element('body')};
  return {doc,nodes};
}
const fields={fixedTaskId:'page.read.fixed',baiduTaskId:'baidu.search.top3',installedChoice:'__installed__'};
test('legacy ChatGPT page UI is detached by default while trusted projections remain alive',()=>{
  const {doc,nodes}=fixture();
  const panel=createLegacyChatGPTTaskPanel({doc,...fields});
  assert.equal(doc.body.children.length,0,'ordinary chat must not receive the legacy floating UI');
  assert.equal(panel.root.id,'opendesk-fixed-bridge-r12');
  assert.equal(panel.status.getAttribute?.('role')??panel.status.role,'status');
  assert.ok(panel.taskSelect);
  assert.ok(panel.runButton);
  assert.ok(panel.result);
  assert.ok(nodes.some(node=>node.tag==='shadow'));
});
test('legacy panel can be mounted only by an explicit reviewed caller',()=>{
  const {doc}=fixture();
  const panel=createLegacyChatGPTTaskPanel({doc,visible:true,...fields});
  assert.deepEqual(doc.body.children,[panel.root]);
  assert.equal(panel.taskSelect.children.length,3);
  assert.equal(panel.taskSelect.children[1].value,'baidu.search.top3');
});
