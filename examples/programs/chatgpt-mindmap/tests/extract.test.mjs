import test from 'node:test';
import assert from 'node:assert/strict';
import {extractAnswerTree} from '../src/extract.js';

// Small semantic DOM fixture, not a browser acceptance substitute.
class Block {
  constructor(tag,parts=[],attrs={}){
    this.tagName=tag.toUpperCase();this.parts=parts;this.children=parts.filter(x=>x instanceof Block);
    this.childNodes=parts.map(x=>typeof x==='string'?{nodeType:3,textContent:x}:x);
    this.nodeType=1;this.hidden=false;this.className=attrs.className||'';
    this.attrs=attrs;
  }
  get textContent(){return this.parts.map(p=>typeof p==='string'?p:p.textContent).join('');}
  getAttribute(name){return this.attrs[name]??null;}
  matches(selector){
    return selector.split(',').some(raw=>{
      const sel=raw.trim();
      return /^[a-z]+$/.test(sel)&&sel.toUpperCase()===this.tagName;
    });
  }
  querySelectorAll(selector){
    const found=[];const parts=selector.split(' ');
    const match=x=>x.tagName.toLowerCase()===parts.at(-1);
    const walk=(node,ancestors)=>{
      for(const child of node.children){
        if(match(child)&&(
          parts.length===1||ancestors.some(a=>a.tagName.toLowerCase()===parts[0])||
          node.tagName.toLowerCase()===parts[0]))found.push(child);
        walk(child,[...ancestors,node]);
      }
    };
    walk(this,[]);return found;
  }
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
}
const e=(tag,...parts)=>new Block(tag,parts);
const flatten=(tree)=>[tree,...tree.children.flatMap(flatten)];

test('headings, nested lists, code and body text preserve their own semantics',()=>{
  const source=e('div',
    e('h2','部署流程'),e('p','仅属于部署流程的一条正文说明。'),
    e('ul',e('li','准备',e('ul',e('li','校验权限'))),e('li','执行')),
    e('pre',e('code','# 不可解析为标题\n- 不可解析为列表')),
    e('h3','结果'),e('p','真实验收需另做。'));
  const {tree,nodeCount,truncated}=extractAnswerTree(source);
  const nodes=flatten(tree);
  assert.equal(nodeCount,6);
  assert.equal(truncated,false);
  assert.equal(tree.children[0].title,'部署流程');
  assert.match(tree.children[0].content,/正文说明/);
  assert.equal(tree.children[0].children[0].children[0].title,'校验权限');
  assert.equal(nodes.filter(n=>n.kind==='heading').length,2);
  assert.equal(nodes.filter(n=>n.kind==='code').length,1);
  assert.ok(!nodes.some(n=>n.title.includes('不可解析为标题')));
});

test('no-heading paragraphs become nodes; identical content has no shared identities',()=>{
  const source=()=>e('div',e('p','相同内容'),e('p','另一段'));
  const a=extractAnswerTree(source()),b=extractAnswerTree(source());
  assert.equal(a.nodeCount,2);
  assert.notEqual(a.tree,b.tree);
  assert.notEqual(a.tree.children[0],b.tree.children[0]);
  a.tree.children[0].title='只改 A';
  assert.equal(b.tree.children[0].title,'相同内容');
});

test('long or unsafe text remains plain bounded data; never parsed as HTML',()=>{
  const payload='<img src=x onerror=alert(1)> '+('长'.repeat(10000));
  const {tree,truncated}=extractAnswerTree(e('div',e('h1','主标题'),e('p',payload)));
  assert.equal(truncated,true);
  assert.ok(tree.children[0].content.startsWith('<img src=x onerror=alert(1)>'));+  assert.ok(tree.children[0].content.length<=1200);
});

test('large lists never exceed the fixed node quota',()=>{
  const lines=Array.from({length:240},(_,i)=>e('li','节点 '+i));
  const out=extractAnswerTree(e('div',e('ul',...lines)));
  assert.equal(out.nodeCount,159);
  assert.equal(out.truncated,true);
});
