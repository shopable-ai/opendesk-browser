import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const requirePreview=createRequire(new URL('../preview/react/package.json',import.meta.url));
const {chromium}=requirePreview('playwright');

// Isolated UI test using actual React component + synthetic request receipts.
// No user Profile, extension, Cookie, network, live server, or native evidence.
test('original share UI exposes pending receipts and requires a read before another create',async()=>{
  const component=fileURLToPath(new URL('../app/components/CookieAccountSharing.jsx',import.meta.url));
  const bundle=await build({stdin:{contents:`
    import * as React from 'react';
    import {createRoot} from 'react-dom/client';
    import {CookieAccountShareLive} from ${JSON.stringify(component)};
    const root=createRoot(document.getElementById('root'));
    const origin='https://synthetic-account.invalid';
    const pending={ref:'synthetic-unknown-operation-001',url:'',phase:'creating',
      relayOrigin:'https://synthetic-relay.invalid',recoveryAvailable:false};
    let generation=0,current=null,recoveryReady=true;window.calls=[];
    const request=async(action,payload)=>{
      window.calls.push({action,payload});
      if(action==='shareList')return {invitations:current?.invite?[current]:[],...(recoveryReady?{creationRecoveryVersion:1,pendingInvitations:current&&!current.invite?[current]:[]}:{})};
      if(action==='shareCreate'){
        current={...pending,recoveryAvailable:true};
        throw Object.assign(Error('unknown'),{code:'E_OUTCOME_UNKNOWN'});
      }
      if(action==='shareStatus'){
        if(payload.ref!==pending.ref)throw Error('changed original identity');
        current={ref:pending.ref,url:'https://synthetic-relay.invalid/i/'+'a'.repeat(32),phase:'active',
          invite:{id:'a'.repeat(32),origin,displayName:'Synthetic',description:'',mode:'configuration',
            expiresAt:Date.now()+3600000,remainingClaims:1,revoked:false}};
        return current;
      }
      throw Error('unexpected action');
    };
    window.mountShare=scenario=>{
      recoveryReady=scenario!=='old-worker';
      if(scenario==='old-worker')current=null;
      if(scenario==='legacy')current={...pending};
      if(scenario==='revoking')current={...pending,phase:'revoking',pending:true};
      if(scenario==='own-revoking')current={...pending,phase:'revoking',pending:true,statusAvailable:true};
      if(scenario==='empty')current=null;
      root.render(<CookieAccountShareLive key={++generation} account={{alias:'acct_synthetic_001',
        version:1,cookieCount:0,displayName:'Synthetic'}} request={request} copy={async()=>({copied:true})} onBack={()=>{}}/>);
    };
    window.mountShare('legacy');
  `,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',
    define:{'process.env.NODE_ENV':'"test"'},logLevel:'silent'});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||
    (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
  try{
    const context=await browser.newContext();
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();page.setDefaultTimeout(5000);
    await page.setContent('<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'"><div id="root"></div>');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const create=page.getByRole('button',{name:'生成真实邀请',exact:true});
    const list=page.getByRole('button',{name:'查看已有邀请',exact:true});
    await create.waitFor();
    await page.getByRole('textbox',{name:'分享服务地址',exact:true}).fill('https://synthetic-relay.invalid');
    assert.equal(await create.isDisabled(),true,'re-entry must check durable receipts first');
    await list.click();
    await page.getByText('创建结果未知',{exact:true}).waitFor();
    assert.equal(await create.isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'只读查询创建结果',exact:true}).count(),0);
    assert.equal(await page.getByText('synthetic-unknown-operation-001',{exact:true}).count(),1);
    await page.evaluate(()=>window.mountShare('reenter'));
    await list.click();await page.getByText('创建结果未知',{exact:true}).waitFor();
    assert.equal(await create.isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.calls.some(c=>c.action==='shareCreate')),false);
    await page.evaluate(()=>window.mountShare('revoking'));
    await list.click();await page.getByText('撤销结果未知',{exact:true}).waitFor();
    assert.equal(await create.isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'只读查询创建结果',exact:true}).count(),0);
    await page.evaluate(()=>window.mountShare('own-revoking'));
    await list.click();await page.getByRole('button',{name:'只读查询邀请状态',exact:true}).waitFor();
    assert.equal(await create.isDisabled(),true);
    await page.getByRole('button',{name:'只读查询邀请状态',exact:true}).click();
    await page.getByRole('textbox',{name:'邀请链接',exact:true}).waitFor();
    await page.evaluate(()=>window.mountShare('old-worker'));
    await page.getByRole('textbox',{name:'分享服务地址',exact:true}).fill('https://synthetic-relay.invalid');
    await list.click();
    await page.getByText('分享功能需要更新 Browser 后再创建邀请。现有邀请仍可查看。',{exact:true}).waitFor();
    assert.equal(await create.isDisabled(),true,'an empty old-worker list cannot release a historical unknown fence');
    assert.equal(await page.evaluate(()=>window.calls.some(c=>c.action==='shareCreate')),false);
    await page.evaluate(()=>window.mountShare('empty'));
    await page.getByRole('textbox',{name:'分享服务地址',exact:true}).fill('https://synthetic-relay.invalid');
    await list.click();
    await page.getByText('没有已保存的邀请。',{exact:true}).waitFor();
    await create.click();
    await page.getByText('操作结果未知，已停止；不会自动重试或重复领取。请核对服务状态。',{exact:true}).waitFor();
    await list.click();
    await page.getByRole('button',{name:'只读查询创建结果',exact:true}).click();
    await page.getByRole('textbox',{name:'邀请链接',exact:true}).waitFor();
    assert.equal(await page.getByRole('textbox',{name:'邀请链接',exact:true}).inputValue(),
      'https://synthetic-relay.invalid/i/'+'a'.repeat(32));
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='shareCreate').length),1);
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='shareStatus').length),2);
  }finally{await browser.close();}
});
