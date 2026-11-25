import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html=readFileSync(new URL('../preview/index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

test('offline preview HTML has a single readable module and unique IDs',()=>{
  assert.match(html,/<!doctype html>/i);
  assert.ok(script,'one inline behavior script must exist');
  assert.equal((html.match(/<script\b/g)||[]).length,1);
  assert.doesNotMatch(html,/<script[^>]*\bsrc=/i);
  assert.doesNotMatch(html,/<iframe\b/i);
  assert.doesNotMatch(html,/@import\b/i);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.ok(ids.length>=25);
  assert.equal(ids.length,new Set(ids).size,'page and Sidebar must not reuse id values');
  assert.doesNotThrow(()=>new vm.Script(script));
});
test('both surfaces and all product states exist in one preview',()=>{
  for(const id of ['site-jobs','site-detail','page-addon','embed-score','page-add',
    'page-draft','page-open','scan','tab-jobs','tab-queue','tab-prefs',
    'draft','draft-text','draft-copy','scenario','prefs-form','status']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  for(const scenario of ['normal','contacted','missing','restricted','noaccess','empty','loading']){
    assert.match(html,new RegExp('value="'+scenario+'"'));
  }
  assert.match(script,/function renderCards\(/);
  assert.match(script,/function renderDetail\(/);
  assert.match(script,/function renderQueue\(/);
  assert.match(script,/function openDraft\(/);
});
test('preview cannot perform network or send commands and fences stale scans',()=>{
  assert.doesNotMatch(script,/\bfetch\s*\(/);
  assert.doesNotMatch(script,/\bXMLHttpRequest\b/);
  assert.doesNotMatch(script,/\bWebSocket\s*\(/);
  assert.doesNotMatch(script,/\bOpenDeskTool\.request\b/);
  assert.doesNotMatch(script,/\bOpenDeskAppPage\b/);
  assert.doesNotMatch(script,/\bchrome\./);
  assert.match(script,/epoch!==state\.epoch/);
  assert.match(script,/state\.epoch\+\+/);
  assert.match(script,/state\.scenario==='noaccess'/);
  assert.match(script,/navigator\.clipboard/);
});
test('rules and draft display caution about unknown facts and human review',()=>{
  assert.match(script,/完整 JD 未核实/);
  assert.match(script,/缺少稳定职位 ID/);
  assert.match(script,/已沟通/);
  assert.match(script,/状态/);
  assert.match(html,/不发送消息/);
  assert.match(html,/离线模拟/);
});
