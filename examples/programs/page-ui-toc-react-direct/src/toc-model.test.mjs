import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTocTree, chooseActiveTocItem, createTocScanner, sameToc, selectTocItems} from './toc-model.js';

const row = (id, level, top) => ({id, level, label:id, element:{isConnected:true,
  getBoundingClientRect:()=>({top})}});

test('levels and missing H1 use real heading hierarchy', () => {
  const result = buildTocTree([row('a',2,10),row('b',3,30),row('c',2,50),row('d',4,70)]);
  assert.deepEqual(result.map(item => [item.id,item.depth,item.parentId,item.topId]), [
    ['a',0,null,'a'],['b',1,'a','a'],['c',0,null,'c'],['d',1,'c','c']
  ]);
});

test('active position reflects scroll, not duplicate heading ids or text', () => {
  const result = buildTocTree([row('first',1,-100),row('dup-A',2,-10),row('dup-B',2,320)]);
  assert.equal(chooseActiveTocItem(result), 'dup-A');
  assert.equal(chooseActiveTocItem(result, -200), 'first');
});

test('single H1 with 20 H2 displays current chapter in compact views', () => {
  const data = buildTocTree([row('root',1,-100),...Array.from({length:20},(_,i)=>row('h'+(i+1),2,i*100))]);
  assert.equal(selectTocItems(data, 'h20', 'full').length, 21);
  for (const mode of ['overview','focus']) {
    const visible = selectTocItems(data,'h20',mode);
    assert.ok(visible.length<=12);
    assert.equal(visible[0].id,'root');
    assert.ok(visible.some(item=>item.id==='h20'));
  }
});

test('unchanged rescans are ignored; changed heading labels are detected', () => {
  const node = row('same',1,0);
  const a=buildTocTree([node]),b=buildTocTree([node]);
  assert.equal(sameToc(a,b),true);
  assert.equal(sameToc(a,buildTocTree([{...node,label:'updated'}])),false);
  assert.deepEqual(selectTocItems([], '', 'focus'),[]);
});

test('parent re-grouping is observable even when labels and depth stay the same', () => {
  const heading = row('child', 3, 80);
  const before = buildTocTree([row('a', 2, 10), heading, row('b', 2, 30)]);
  const after = buildTocTree([row('a', 2, 10), row('b', 2, 30), heading]);
  assert.equal(sameToc(before, after), false);
  assert.equal(before[1].parentId, 'a');
  assert.equal(after[2].parentId, 'b');
});

test('DOM scanner preserves distinct heading identities without mutating page ids', () => {
  const headings = ['First section', 'Same', 'Same'].map((label, index) => ({
    tagName: index === 0 ? 'H1' : 'H2', textContent: label, isConnected: true,
    id: 'duplicated-id', getClientRects: () => [{top: index * 100}],
    closest: () => null
  }));
  const root = {isConnected: true, matches: selector => selector === 'article',
    closest: () => null, querySelectorAll: () => headings};
  const doc = {body: root, documentElement: root,
    defaultView: {getComputedStyle: () => ({display: 'block', visibility: 'visible'})},
    querySelectorAll: () => [root]};
  const scan = createTocScanner(doc);
  const first = scan();
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map(item => item.id)).size, 3);
  assert.equal(first[1].label, first[2].label);
  assert.ok(first.every(item => item.element.id === 'duplicated-id'));
  assert.equal(sameToc(first, scan()), true);
  headings[2].textContent = 'Changed heading';
  const edited = scan();
  assert.equal(edited[2].id, first[2].id);
  assert.equal(sameToc(first, edited), false);
});
