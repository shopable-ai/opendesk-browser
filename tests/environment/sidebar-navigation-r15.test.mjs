import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeToolNavigation} from '../../src/sidebar-tools/navigation-state.js';

test('R1.5 display navigation has a small closed schema and never carries authority',()=>{
  assert.deepEqual(normalizeToolNavigation({page:'list',title:' 知识收件箱 ',canBack:false}),
    {page:'list',title:'知识收件箱',canBack:false,primary:null});
  assert.deepEqual(normalizeToolNavigation({page:'edit',title:'编辑知识',canBack:true,primary:'save'}),
    {page:'edit',title:'编辑知识',canBack:true,primary:'save'});
  for(const bad of [null,[],{page:'list',title:'标题'},
    {page:'../settings',title:'设置',canBack:true},
    {page:'list',title:'x'.repeat(41),canBack:false},
    {page:'list',title:'a\u202ealert',canBack:false},
    {page:'list',title:'标题',canBack:'true'},
    {page:'list',title:'标题',canBack:false,operation:'browser.cookies.set'},
    {page:'list',title:'标题',canBack:false,primary:'delete'},
    {page:'list',title:'标题',canBack:false,primary:{action:'save'}}])
    assert.equal(normalizeToolNavigation(bad),null);
});
test('R1.5 host verifies release bytes and sandbox/session before accepting navigation',async()=>{
  const [host,bridge]=await Promise.all([
    readFile('src/ui/sidebar-tools.js','utf8'),readFile('src/sidebar-tools/bridge.js','utf8')]);
  assert.match(host,/await matchesOfficialRelease\(release,tool\)/);
  assert.match(host,/event\.origin!=='null'\|\|!sameInstance/);
  assert.match(host,/navigationAllowed:approvedNavigation/);
  assert.match(host,/normalizeToolNavigation\(message\.state\)/);
  assert.match(bridge,/navigationAllowed=message\.navigationAllowed===true/);
  assert.match(bridge,/normalizeToolNavigation\(value\)/);
  assert.match(bridge,/opendesk-tool-navigation/);
});
test('R1.5 Markdown Workbench omits a duplicate official header without changing its editor',async()=>{
  const [js,css,config]=await Promise.all([
    readFile('examples/sidebar-tools/markdown-workbench/src/main.js','utf8'),
    readFile('examples/sidebar-tools/markdown-workbench/src/style.css','utf8'),
    readFile('examples/sidebar-tools/markdown-workbench/tool.config.json','utf8')]);
  assert.equal(JSON.parse(config).version,'1.0.5');
  assert.match(js,/setNavigation\?\.\(\{page:'home',title:'Markdown 工作台',canBack:false\}\)===true/);
  assert.match(css,/\.mdw\.mdw-host-nav \.mdw-bar strong\{display:none/);
});

test('R1.5 knowledge child back uses original save/discard controllers; fallback UI remains',async()=>{
  const [js,css,html,config]=await Promise.all([
    readFile('examples/sidebar-tools/knowledge-inbox/src/main.js','utf8'),
    readFile('examples/sidebar-tools/knowledge-inbox/src/style.css','utf8'),
    readFile('examples/sidebar-tools/knowledge-inbox/src/index.html','utf8'),
    readFile('examples/sidebar-tools/knowledge-inbox/tool.config.json','utf8')]);
  assert.equal(JSON.parse(config).version,'1.2.9');
  for(const page of ['list','detail','edit','create'])assert.match(js,new RegExp(page));
  assert.match(js,/setNavigation\(\{page,title,canBack:page!=='list'\}\)===true/);
  assert.match(js,/if\(creating\)void cancelCreate\(\)/);
  assert.match(js,/else if\(editing\)void action\(toggleEdit\)\(\)/);
  assert.match(js,/else if\(!q\('detail'\)\.hidden\)void goBack\(\)/);
  assert.match(js,/const discard=\(\)=>!dirty\?Promise\.resolve\(true\):ask/);
  assert.match(css,/\.ki\.ki-host-nav #ki-back/);
  assert.match(html,/id="ki-back"/);
  assert.match(html,/id="ki-create-cancel"/);
});
