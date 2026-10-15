import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutMindTree} from '../src/mindmap-renderer.js';
const root={id:'root',title:'回复',depth:0,children:[
  {id:'a',title:'标题A',depth:1,children:[{id:'c',title:'子项',depth:2,children:[]}]},
  {id:'b',title:'标题B',depth:1,children:[]}]};
test('layout maintains distinct DOM-independent node identity and bounded geometry',()=>{
  const result=layoutMindTree(root);
  assert.equal(result.coords.length,4);
  assert.equal(new Set(result.coords.map(v=>v.node.id)).size,4);
  assert.equal(result.edges.length,3);
  assert.ok(result.width>0&&result.height>0);
  for(const {x,y,height} of result.coords)assert.ok([x,y,height].every(Number.isFinite));
});
test('folding one branch does not change another layout instance',()=>{
  const folded=layoutMindTree(root,new Set(['a']));
  const expanded=layoutMindTree(root,new Set());
  assert.equal(folded.coords.length,3);
  assert.equal(expanded.coords.length,4);
  assert.ok(folded.coords.some(v=>v.node.id==='b'));
});
