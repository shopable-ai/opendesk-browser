import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';

// Execute the product components without a browser or SDK. Only React's
// scheduling is replaced so refs and user handlers can be inspected directly.
const require=createRequire(import.meta.url);
const React={
  Fragment:Symbol('fragment'),
  createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),
  useState:value=>[value,()=>{}],useRef:value=>({current:value}),
  useEffect(){},useLayoutEffect(){}
};
const built=buildSync({
  stdin:{contents:[
    "export {CookieAccounts} from './examples/sidebar-tools/cookie-editor/app/components/CookieAccounts.jsx';",
    "export {CookieEnterprisePanel} from './examples/sidebar-tools/cookie-editor/app/components/CookieBusinessPanels.jsx';"
  ].join('\n'),resolveDir:new URL('../../',import.meta.url).pathname},
  bundle:true,write:false,format:'cjs',platform:'node',external:['react'],jsx:'transform'
});
const module={exports:{}};
new Function('require','module','exports',built.outputFiles[0].text)(
  name=>name==='react'?React:require(name),module,module.exports);
const {CookieAccounts,CookieEnterprisePanel}=module.exports;
function nodes(node){
  if(!node||typeof node!=='object')return [];
  if(typeof node.type==='function')return nodes(node.type({...node.props,children:node.children}));
  return [node,...node.children.flatMap(nodes)];
}
const text=node=>!node||typeof node!=='object'?String(node??''):node.children.map(text).join('');
const find=(tree,predicate)=>nodes(tree).find(predicate);

test('first use retains three inert account examples without claiming saved snapshots',()=>{
  const tree=CookieAccounts({accountReady:true,onCreate(){}});
  const examples=find(tree,n=>n.props['aria-label']==='账号布局示例');
  assert.ok(examples);
  assert.match(text(examples),/仅展示布局 · 非真实账号/);
  const controls=nodes(examples).filter(n=>n.type==='button');
  assert.equal(controls.length,6);
  for(const control of controls){
    assert.equal(control.props.disabled,true);
    assert.equal(control.props.onClick,undefined);
  }
  assert.equal(nodes(examples).some(n=>n.props['data-account-alias']),false);
  assert.match(text(find(tree,n=>n.props['aria-label']==='已保存账号操作')),/已保存账号 0/);
  assert.equal(find(tree,n=>n.type==='input'&&n.props.type==='password'),undefined);
  assert.equal(find(tree,n=>n.props.className==='cookie-account-vault'),undefined);
  assert.equal(find(tree,n=>n.props['aria-label']==='锁定账号仓库'),undefined);
  assert.equal(find(tree,n=>n.props['aria-label']==='保存当前 Cookie 为账号').props.disabled,false);
});

test('save stays unavailable until trusted account metadata is ready',()=>{
  let operations=0;
  const tree=CookieAccounts({onCreate(){operations++;},onSwitch(){operations++;}});
  const save=find(tree,n=>n.props['aria-label']==='保存当前 Cookie 为账号');
  assert.equal(save.props.disabled,true);
  assert.equal(operations,0);
  assert.match(text(tree),/正在读取账号/);
});

test('unreadable legacy snapshots are disclosed without restoring password management',()=>{
  const tree=CookieAccounts({accountReady:true,legacyLocked:true,onCreate(){}});
  assert.match(text(tree),/旧版加密快照.*保留.*未迁移/);
  assert.equal(find(tree,n=>n.type==='input'&&n.props.type==='password'),undefined);
  assert.equal(find(tree,n=>n.props['aria-label']==='保存当前 Cookie 为账号').props.disabled,false);
});

test('real account metadata replaces examples and preserves locked switch controls',()=>{
  const account={alias:'fixture_account',displayName:'Saved fixture'};
  const tree=CookieAccounts({accounts:[account],accountReady:true,switchReady:false,onSwitch(){}});
  assert.equal(find(tree,n=>n.props['aria-label']==='账号布局示例'),undefined);
  assert.ok(find(tree,n=>n.props['data-account-alias']===account.alias));
  assert.equal(find(tree,n=>n.type==='button'&&text(n)==='切换').props.disabled,true);
  assert.equal(find(tree,n=>n.type==='details'),undefined);
});

test('enterprise keeps all four fictional resource rows outside preview mode',()=>{
  const tree=CookieEnterprisePanel({});
  const overview=find(tree,n=>n.props['aria-label']==='虚构企业席位与预算数据');
  const rows=nodes(overview).filter(n=>n.type==='article');
  assert.equal(rows.length,4);
  assert.deepEqual(nodes(overview).filter(n=>n.type==='progress').map(n=>[n.props.value,n.props.max]),
    [[6,10],[3,8],[1280,2000]]);
  assert.match(text(rows[3]),/研发团队未接入暂无可用管理数据/);
  const rendered=nodes(tree).map(n=>n.children.filter(x=>typeof x==='string').join('')).join(' ');
  assert.match(rendered,/虚构示例 · 非实时/);
  assert.match(rendered,/未接入真实企业账号、后台或用量数据/);
});
