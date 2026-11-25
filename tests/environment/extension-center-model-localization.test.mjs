import test from 'node:test';
import assert from 'node:assert/strict';
import {describeInstalledPageControl} from '../../src/ui/extension-center-model.js';

test('installed Page identifies the switch without conflating suspended, disabled, or unknown state',()=>{
  for(const programId of ['test-page','opendesk.ai-scroll-navigation']){
    const page={programId,enabled:true,nativeState:'blocked',authorization:{status:'active'},
      error:{code:'E_USER_SCRIPTS_UNAVAILABLE'},pageRules:{matches:['https://example.com/*']}};
    const state=describeInstalledPageControl(page);
    assert.equal(state.state,'restricted');
    assert.match(state.note,/允许用户脚本.*刷新可信状态/);
    // Authority can suspend the installation specifically because the
    // browser switch is off. Keep that cause distinct from a withdrawn site grant.
    const browserBlocked=describeInstalledPageControl({...page,authorization:{status:'suspended'}});
    assert.match(browserBlocked.note,/允许用户脚本/);
    const siteBlocked=describeInstalledPageControl({...page,authorization:{status:'suspended'},error:{code:'E_PERMISSION'}});
    assert.match(siteBlocked.note,/恢复已安装网站的访问权限/);
    for(const override of [{enabled:false},{error:{code:'E_EFFECT_UNKNOWN'}}]){
      const result=describeInstalledPageControl({...page,...override});
      assert.doesNotMatch(result.note,/允许用户脚本/);
    }
  }
});

test('state translation keeps permission and cleanup decisions unchanged',()=>{
  const page={programId:'reader',enabled:true,nativeState:'registered',authorization:{status:'active'},pageRules:{matches:['https://example.com/*']}};
  const zh=describeInstalledPageControl(page),en=describeInstalledPageControl(page,[],'en');
  assert.equal(en.status,'Auto-run requirements are ready');
  for(const key of ['state','enabled','enabledKnown','canRestore','legacyProgramId'])assert.equal(en[key],zh[key]);
});

test('approved Page installations waiting for browser capability or readback do not ask for access again',()=>{
  for(const programId of ['test-page','opendesk.ai-scroll-navigation']){
    const page={programId,enabled:true,authorization:{status:'active'},pageRules:{matches:['https://example.com/*']}};
    const waiting=describeInstalledPageControl({...page,nativeState:'waiting-user-scripts'});
    assert.equal(waiting.state,'pending');assert.equal(waiting.canRestore,false);
    assert.match(waiting.note,/允许用户脚本.*无需重新安装或授权/);
    const unknown=describeInstalledPageControl({...page,nativeState:'activation-unconfirmed'});
    assert.equal(unknown.canRestore,false);assert.match(unknown.note,/不会自动重新提交/);
    const revoked=describeInstalledPageControl({...page,nativeState:'waiting-user-scripts',authorization:{status:'suspended'}});
    assert.equal(revoked.canRestore,true);assert.equal(revoked.state,'restricted');
  }
});


test('all framework message keys resolve in four locales with existing fallback and plain parameters',async()=>{
  const {extensionCenterText:t,extensionCenterMessageKeys:keys}=await import('../../src/ui/extension-center-localization.js');
  for(const locale of ['zh-CN','en','ja','zh-TW'])for(const key of keys){
    const text=t(locale,key,{title:'<user>',id:'<id>',action:'<action>',reason:'<reason>',state:'<state>',count:3});
    assert.ok(text,`${locale}:${key}`);assert.doesNotMatch(text,/\{[a-zA-Z]+\}/);
    if(locale==='en')assert.doesNotMatch(text,/\p{Script=Han}/u, key);
  }
  assert.equal(t('en-US','search'),t('en','search'));
  assert.equal(t('ja-JP','search'),t('ja','search'));
  assert.equal(t('fr','search'),t('zh-CN','search'));
  assert.ok(t('en','manageTitle',{title:'<img src=x>'}).includes('<img src=x>'));
});

test('all state branches retain restore fences across languages and preserve input records',()=>{
  const base={enabled:true,nativeState:'registered',authorization:{status:'active'},pageRules:{matches:['https://example.com/*']}};
  for(const programId of ['reader','opendesk.ai-scroll-navigation','opendesk.ai-reply-mindmap']){
    for(const override of [{},{enabled:undefined},{enabled:false},{enabled:false,nativeState:'disabled',authorization:{status:'disabled'}},
      {nativeState:'blocked'},{nativeState:'unregistered'},{authorization:{status:'suspended'}},{authorization:{status:'needs-confirmation'}},
      {error:'E_REGISTER'},{managedCleanup:{state:'unknown'}},{pageRules:{matches:[]}},
      {error:'E_REGISTER',managedCleanup:{state:'unknown'}}]){
      const page={...base,programId,...override},before=structuredClone(page),zh=describeInstalledPageControl(page);
      for(const locale of ['en','ja','zh-TW']){
        const result=describeInstalledPageControl(page,[],locale);
        for(const key of ['state','enabled','enabledKnown','canRestore','legacyProgramId'])assert.equal(result[key],zh[key]);
        assert.ok(result.status);if(locale==='en')assert.doesNotMatch([result.status,result.note,result.evidenceNote].join(' '),/\p{Script=Han}/u);
      }
      assert.deepEqual(page,before);
    }
  }
});

