import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';

// Render the actual leaf component with React, without a browser or Cookie SDK.
const result=await build({entryPoints:[fileURLToPath(new URL('../app/components/CookieAccounts.jsx',import.meta.url))],
  bundle:true,write:false,platform:'node',format:'cjs',packages:'external',logLevel:'silent'});
const module={exports:{}};
const require=createRequire(import.meta.url);
const dependencies=name=>name==='@opendesk/ui'
  ?{Button:()=>{throw Error('Unexpected shared Button in account leaf');}}:require(name);
new Function('require','module','exports',result.outputFiles[0].text)(dependencies,module,module.exports);
const {CookieAccounts}=module.exports;
const accounts=[{alias:'alpha',displayName:'工作账号',cookieCount:2},
  {alias:'beta',displayName:'个人账号',cookieCount:2}];
const render=props=>renderToStaticMarkup(React.createElement(CookieAccounts,{
  origin:'https://synthetic.invalid',accounts,accountReady:true,switchReady:true,
  onSwitch(){},onUpdate(){},...props
}));

test('applied history renders one selected card while its snapshot update stays disabled',()=>{
  const html=render({currentAlias:'alpha',currentKind:'applied',snapshotMatches:false});
  assert.match(html,/>当前快照<\/small>/);
  assert.equal((html.match(/aria-current="true"/g)||[]).length,1);
  assert.equal((html.match(/aria-label="此快照最近已应用"/g)||[]).length,1);
  assert.doesNotMatch(html,/待核对|未确认<\/span>/);
  assert.match(html,/网站登录身份未自动验证/);
  assert.match(html.match(/<button[^>]*aria-label="更新工作账号的 Cookie 快照"[^>]*>/)?.[0]||'',/disabled=""/);
});

test('pending switch names the requested account and exposes busy feedback',()=>{
  const html=render({switchingAlias:'beta',busy:true});
  assert.match(html,/正在切换：个人账号/);
  assert.match(html,/aria-busy="true"/);
  assert.match(html,/切换中…/);
  assert.doesNotMatch(html,/aria-current="true"|cookie-account-current-mark/);
});

test('matched snapshot retains the explicit update affordance',()=>{
  const html=render({currentAlias:'alpha',currentKind:'matched',snapshotMatches:true});
  const button=html.match(/<button[^>]*aria-label="更新工作账号的 Cookie 快照"[^>]*>/)?.[0];
  assert.ok(button);
  assert.doesNotMatch(button,/disabled/);
  assert.match(html,/aria-label="此快照已核对"/);
});

test('selection follows Alpha to Beta and retires during pending, failed and unknown outcomes',()=>{
  const states=[
    {currentAlias:'alpha',expected:'alpha'},
    {currentAlias:'alpha',switchingAlias:'beta',busy:true,expected:null},
    {currentAlias:'beta',expected:'beta'},
    {currentAlias:null,feedback:{kind:'error',text:'切换失败'},expected:null},
    {currentAlias:null,feedback:{kind:'error',text:'结果未知，请核对'},expected:null}
  ];
  for(const {expected,...props} of states){
    const html=render(props);
    const cards=[...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match=>match[0]);
    const selected=cards.filter(card=>card.includes('aria-current="true"'));
    assert.equal(selected.length,expected?1:0,JSON.stringify(props));
    assert.equal(cards.filter(card=>card.includes('cookie-account-current-mark')).length,expected?1:0);
    assert.equal(cards.filter(card=>card.includes(' is-current')).length,expected?1:0);
    if(expected)assert.match(selected[0],new RegExp('data-account-alias="'+expected+'"'));
    if(props.switchingAlias){
      const header=html.match(/<div class="cookie-account-current[\s\S]*?<\/strong>/)?.[0]||'';
      assert.match(header,/正在切换账号/);
      assert.match(header,/正在切换：个人账号/);
      assert.match(header,/>个<\/span>/);
      assert.doesNotMatch(header,/最近已切换|>工<\/span>/);
      for(const button of html.matchAll(/<button[^>]*cookie-button--row-action[^>]*>/g))
        assert.match(button[0],/disabled=""/);
    }
  }
});

test('selected account exposes an accessible icon action and a full name for truncated labels',()=>{
  const name='非常长的工作账号名称，用于验证窄侧栏中的完整账号身份';
  const html=render({accounts:[{...accounts[0],displayName:name},accounts[1]],currentAlias:'alpha'});
  const selected=html.match(/<article[^>]*aria-current="true"[\s\S]*?<\/article>/)?.[0]||'';
  assert.match(selected,new RegExp('<strong title="'+name+'">'));
  assert.match(selected,new RegExp('aria-label="应用'+name+'的 Cookie 快照"'));
  assert.match(selected,/aria-describedby="cookie-account-selection-note"/);
  const button=selected.match(/<button[^>]*title="应用此快照"[\s\S]*?<\/button>/)?.[0]||'';
  assert.match(button,/<svg/);
  assert.doesNotMatch(button,/>[^<\s]+</);
  assert.doesNotMatch(selected,/✓ 已应用|✓ 已核对|重新应用/);
  assert.match(html,/role="status" aria-live="polite" aria-atomic="true"/);
});

test('failed account reads stop announcing a loading state and do not invent a selection',()=>{
  const html=render({accounts:[],accountReady:false,
    feedback:{kind:'error',text:'账号服务不可用（E_ACCOUNT_HOST）。'}});
  assert.match(html,/账号读取失败/);
  assert.match(html,/读取失败/);
  assert.doesNotMatch(html,/正在读取账号|>读取中<|aria-current="true"/);
  assert.match(html,/role="alert"/);
});
