// Source-bound Prompt preview regressions, not installed Chrome acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const path='examples/sidebar-tools/prompt-shortcuts/preview/index.html';
async function source(){
  const html=await readFile(path,'utf8');
  const match=html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/);
  assert.ok(match,'preview has its own script');
  const script=match[1];
  const slice=(begin,end)=>{
    const start=script.indexOf(begin),stop=script.indexOf(end,start+begin.length);
    assert.ok(start>=0&&stop>start,begin);
    return script.slice(start,stop);
  };
  return {html,script,slice};
}
async function fixture(savedValue){
  const {slice}=await source(),saved=new Map();
  if(savedValue!==undefined)saved.set('settings',JSON.stringify(savedValue));
  let failWrite=false;
  const context={localStorage:{
    getItem:key=>saved.get(key)??null,
    setItem(key,value){if(failWrite)throw new Error('quota');saved.set(key,value);}
  }};
  runInNewContext(`const IMAGE_SIZES=['compact','standard','large'];
    const DEMO_SETTINGS_KEY='settings';
    ${slice('function restoreDemoSettings()', 'function restoreDemoItems()')}
    let state={settings:restoreDemoSettings()};
    ${slice('function persistDemoSettings(', 'let state=')}
    globalThis.api={restoreDemoSettings,persistDemoSettings,settings:()=>state.settings,
      change:(name,value)=>{state.settings[name]=value}};
  `,context);
  return {api:context.api,saved,setFailure:value=>{failWrite=value;}};
}
test('R1.2.2 older preview settings ignore navigation without losing Prompt toggles',async()=>{
  const f=await fixture({showBar:false,contextMenu:true,imageSize:'compact',
    scrollNavigation:{regionTop:false,conversationBottom:false}});
  const settings=f.api.restoreDemoSettings();
  assert.equal(settings.showBar,false);
  assert.equal(settings.contextMenu,true);
  assert.equal(settings.imageSize,'compact');
  assert.equal(Object.hasOwn(settings,'scrollNavigation'),false);
  assert.equal(f.api.persistDemoSettings(),true);
  const stored=JSON.parse(f.saved.get('settings'));
  assert.equal(Object.hasOwn(stored,'scrollNavigation'),false);
  assert.equal(stored.showBar,false);
  assert.equal(stored.contextMenu,true);
});
test('R1.2.2 preview storage failure does not destroy earlier saved Prompt settings',async()=>{
  const f=await fixture({showBar:true,contextMenu:false,imageSize:'standard'});
  f.api.change('showBar',false);
  f.setFailure(true);
  assert.equal(f.api.persistDemoSettings(),false);
  assert.equal(JSON.parse(f.saved.get('settings')).showBar,true);
  f.setFailure(false);
  assert.equal(f.api.persistDemoSettings(),true);
  assert.equal(JSON.parse(f.saved.get('settings')).showBar,false);
  assert.equal(Object.hasOwn(JSON.parse(f.saved.get('settings')),'scrollNavigation'),false);
});
test('R1.2.2 Prompt preview contains no Navigation program UI or listeners',async()=>{
  const {html,script}=await source();
  for(const obsolete of ['mockConversationNav','demoReplyTop','demoReplyBottom',
    'previewScrollAdvanced','previewScrollRestore','scrollNavPreview','demoScroll(',
    'updateDemoFloating(','settings.scrollNavigation']){
    assert.equal(html.includes(obsolete),false,obsolete);
  }
  for(const expected of ['id="pageRail"','id="mockDraft"','id="siteDetails"',
    'id="contextSwitch"','id="showBarSwitch"','id="toolEnabledSwitch"']){
    assert.ok(html.includes(expected),expected);
  }
  assert.match(script,/usePrompt=async function\(item\)/);
  assert.match(script,/function renderSiteFixture\(/);
  assert.match(script,/addEventListener\('compositionstart'/);
});
