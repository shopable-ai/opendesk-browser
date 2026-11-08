import test from 'node:test';
import assert from 'node:assert/strict';
import {promptHostCatalog,promptHostText} from '../trusted/host-localization.js';
import {toolManagementCatalog,toolManagementText} from '../../../src/ui/tool-management-localization.js';
import {uiMessage} from '../../../src/ui/app-localization.js';

test('fixed host catalogs cover supported locales and retain the existing locale fallback',()=>{
  for(const [catalog,text] of [[promptHostCatalog,promptHostText],[toolManagementCatalog,toolManagementText]]){
    const keys=Object.keys(catalog.messages[catalog.sourceLocale]);
    for(const locale of ['zh-CN','en','ja','zh-TW']){
      assert.deepEqual(Object.keys(catalog.messages[locale]),keys);
      for(const key of keys)assert.ok(text(locale,key).trim(),locale+': '+key);
    }
    const key=keys[0];
    for(const [variant,base] of [['en-US','en'],['ja-JP','ja'],['fr-FR','zh-CN']])
      assert.equal(text(variant,key),text(base,key));
    assert.equal(text('en','unknownKey'),'');
  }
  const partial={...promptHostCatalog,messages:{...promptHostCatalog.messages,en:{}}};
  assert.equal(uiMessage(partial,'en','webButtonsLabel'),promptHostText('zh-CN','webButtonsLabel'));
});

test('management interpolates the original tool title as text',()=>{
  const title='<img src=x> & 私人工具';
  for(const locale of ['zh-CN','en','ja','zh-TW']){
    const text=toolManagementText(locale,'uninstall',{title});
    assert.ok(text.includes(title));
    assert.ok(!text.includes('{title}'));
  }
});
