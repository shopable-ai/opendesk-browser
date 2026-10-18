import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOGS,SUPPORTED_LOCALES,normalizeLocale,resolveLocale,translate,localizeLiteral,
  getLocale,getLocalePreference,setLocalePreference,verifyLocaleCatalogs,subscribeLocale,formatFileSize,collator} from '../../src/i18n/index.js';

test('R23 four trusted locale catalogs are complete and have matching named parameters',()=>{
  const result=verifyLocaleCatalogs();
  assert.equal(result.valid,true,JSON.stringify(result));
  assert.deepEqual(Object.keys(CATALOGS).sort(),[...SUPPORTED_LOCALES].sort());
  assert.ok(Object.keys(CATALOGS.en).length>=150);
});
test('R23 browser language and region fallback never confuse Traditional and Simplified Chinese',()=>{
  for(const [tag,expected] of [['zh-HK','zh-TW'],['zh-Hant-HK','zh-TW'],['zh-MO','zh-TW'],['zh-SG','zh-CN'],
    ['zh-Hans-CN','zh-CN'],['zh','zh-CN'],['en-GB','en'],['ja-JP','ja'],['es-MX',null]]){
    assert.equal(normalizeLocale(tag),expected,tag);
  }
  assert.equal(resolveLocale('auto',['es-ES','ja-JP']),'ja');
  assert.equal(resolveLocale('auto',['fr-FR']),'en');
  assert.equal(resolveLocale('zh-TW',['ja-JP']),'zh-TW');
  assert.equal(resolveLocale('unsupported',['ja-JP']),'ja');
});
test('R23 switching UI languages changes translated labels without touching file bytes or protocol strings',()=>{
  const draft='你好\\n<opendesk-edit>\\n{"path":"中文.md","protocol":"opendesk.workspace.edit.v1"}';
  const notices=[];
  const unsubscribe=subscribeLocale(locale=>notices.push(locale));
  const before=getLocalePreference();
  try{
    setLocalePreference('en',{persist:false});
    assert.equal(getLocale(),'en');
    assert.equal(localizeLiteral('保存'),'Save');
    assert.equal(localizeLiteral(draft),draft);
    assert.equal(localizeLiteral('opendesk-edit'),'opendesk-edit');
    setLocalePreference('ja',{persist:false});
    assert.equal(localizeLiteral('保存'),'保存');
    assert.equal(localizeLiteral('磁盘版本已变化'),'ディスク上の版が変更されました');
    assert.deepEqual(notices,['en','ja']);
    assert.notEqual(translate('workspace.heading',{},'zh-CN'),translate('workspace.heading',{},'en'));
    assert.equal(translate('no.such.key'),'Translation unavailable');
    assert.match(formatFileSize(2048,'zh-CN'),/2 KiB/);
    assert.equal(collator('ja').compare('2','10')<0,true);
  }finally{unsubscribe();setLocalePreference(before,{persist:false});}
});

test('R23 trusted Workspace and Settings each expose one language chooser without changing Native write guards',async()=>{
  const {readFile}=await import('node:fs/promises');
  const workspace=await readFile('src/native-agent/workspace.html','utf8');
  const settings=await readFile('src/native-agent/settings.html','utf8');
  const bootstrap=await readFile('src/native-agent/settings.js','utf8');
  const controller=await readFile('src/native-agent/workspace.js','utf8');
  assert.equal((workspace.match(/id="workspace-locale"/g)||[]).length,1);
  assert.equal((settings.match(/id="settings-locale"/g)||[]).length,1);
  assert.match(bootstrap,/initTrustedPageLocale/);
  assert.match(controller,/formatFileSize\(count\)/);
  assert.match(controller,/assertAuthority\(authority\)/);
  assert.match(controller,/expectedSha256:record.sha256/);
  assert.match(controller,/result\.sha256!==await textSHA256\(content\)/);
  assert.match(controller,/const disk=await readFile\(record.workspaceId,record.path,authority\)/);
});
