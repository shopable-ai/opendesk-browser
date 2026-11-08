import test from 'node:test';
import assert from 'node:assert/strict';
import {describeInstalledPageControl} from '../../src/ui/extension-center-model.js';

test('state translation keeps permission and cleanup decisions unchanged',()=>{
  const page={programId:'reader',enabled:true,nativeState:'registered',authorization:{status:'active'},pageRules:{matches:['https://example.com/*']}};
  const zh=describeInstalledPageControl(page),en=describeInstalledPageControl(page,[],'en');
  assert.equal(en.status,'Auto-run requirements are ready');
  for(const key of ['state','enabled','enabledKnown','canRestore','legacyProgramId'])assert.equal(en[key],zh[key]);
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

