import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve('examples/sidebar-tools/adblock');
const read=path=>readFile(resolve(root,path),'utf8');

test('AdBlock picker stays textual while secondary rule operations use host-owned icons',async()=>{
  const [jsx,css]=await Promise.all([read('src/App.jsx'),read('src/layout.css')]);
  assert.match(jsx,/Card,CardContent,Switch,Button,IconButton/);
  assert.match(jsx,/选择网页元素<\/Button>/);
  assert.match(jsx,/adblock\.cosmetic\.pick/);
  assert.match(jsx,/取消选择<\/Button>/);
  assert.match(jsx,/>撤销<\/Button>/);
  for(const word of ['locate','show','hide','edit','remove'])
    assert.match(jsx,new RegExp("kind==='"+word+"'|kind=\\{.*'"+word+"'"));
  assert.equal((jsx.match(/<IconButton className="adblock-rule-action/g)||[]).length,4);
  for(const word of ['定位网页元素','临时显示','重新隐藏','编辑屏蔽规则','永久删除屏蔽规则'])
    assert.ok(jsx.includes(word),word+' accessible action missing');
  assert.match(jsx,/label=\{'永久删除屏蔽规则：'\+rule\.selector\}/);
  assert.match(css,/\.adblock-rule-actions--icons\{flex-wrap:nowrap/);
  assert.match(css,/--od-icon-size:34px/);
  assert.match(css,/@media\(pointer:coarse\).*--od-icon-size:44px/);
  assert.match(jsx,/adblock-rule-action od-icon-button--danger/);
  assert.doesNotMatch(jsx,/chrome\.declarativeNetRequest|chrome\.permissions/);
});
test('standalone DOM review makes all four rule actions interactive without Chrome claims',async()=>{
  const html=await read('preview/adblock-element-picker-r2-review.html');
  for(const kind of ['locate','display','edit','remove'])
    assert.ok(html.includes("ruleAction('"+kind+"'"),kind+' preview action missing');
  assert.match(html,/class="primary grow" id="pick-start"/);
  for(const id of ['rule-list','rule-editor','rule-editor-save','pick-start','pick-cancel','undo-last','notice'])
    assert.ok(html.includes('id="'+id+'"'),id+' missing');
  assert.match(html,/button\.setAttribute\('aria-label',label\)/);
  assert.match(html,/button\.title=title/);
  assert.match(html,/temporaryVisible\.has/);
  assert.match(html,/clearLocate\(\)/);
  assert.match(html,/离线演示仅能使用此网站预设的完整选择器/);
  assert.doesNotMatch(html,/id="page-banner"|id="page-banner-text"/);
});
