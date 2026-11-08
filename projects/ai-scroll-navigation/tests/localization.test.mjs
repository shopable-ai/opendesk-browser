import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {scrollNavigationCatalog,scrollNavigationAICatalog,scrollNavigationText,scrollNavigationMessageText} from '../trusted/host-localization.js';
import {compileToolLocaleCatalog,uiMessage} from '../../../src/ui/app-localization.js';
import {createExtensionCenterDOM} from '../../../tests/helpers/extension-center-react-dom.mjs';

const result=await build({entryPoints:[fileURLToPath(new URL('../trusted/react-controls.tsx',import.meta.url))],
  bundle:true,write:false,packages:'external',format:'esm',jsx:'transform',loader:{'.css':'text'}});
let code=result.outputFiles[0].text;
for(const name of ['react','react-dom','react-aria-components'])code=code.replaceAll(JSON.stringify(name),JSON.stringify(import.meta.resolve(name)));
const {ScrollSiteManager}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const locales=['zh-CN','en','ja','zh-TW'];

for(const catalog of [scrollNavigationCatalog,scrollNavigationAICatalog])test('reviewed four-language catalog validates every message and placeholder',()=>{
  const {sourceLocale,messages}=catalog;
  const reviewed={sourceLocale,messages:{[sourceLocale]:messages[sourceLocale]}};
  for(const locale of locales.filter(x=>x!==sourceLocale))reviewed.messages[locale]=Object.fromEntries(
    Object.entries(messages[locale]).map(([key,text])=>[key,{source:messages[sourceLocale][key],text}]));
  assert.doesNotThrow(()=>compileToolLocaleCatalog(reviewed));
  const parameters={detail:'RAW 原始错误',code:'E_TEST',origin:'https://用户.example',host:'用户.example',
    path:'/chat/中文',label:'CSS',count:3,installation:'install-raw',version:8,fields:'floatingTop',etag:'etag-raw'};
  for(const locale of locales){
    assert.deepEqual(Object.keys(messages[locale]).sort(),Object.keys(messages[sourceLocale]).sort());
    for(const key of Object.keys(messages[sourceLocale])){
      const text=scrollNavigationText(locale,key,parameters);
      assert(text,key);assert.doesNotMatch(text,/\{[A-Za-z]+\}/,key);
      assert.equal(text,uiMessage(catalog,locale,key,parameters));
    }
  }
});

test('locale variants and absent translations retain framework fallback',()=>{
  assert.equal(scrollNavigationText('en-GB','settingsTitle'),'Navigation settings');
  assert.equal(scrollNavigationText('ja-JP','settingsTitle'),scrollNavigationText('ja','settingsTitle'));
  assert.equal(scrollNavigationText('fr','settingsTitle'),'导航设置');
  const missing={...scrollNavigationCatalog,messages:{...scrollNavigationCatalog.messages,en:{}}};
  assert.equal(uiMessage(missing,'en','unknownWrite',{detail:'raw'}),'写入结果尚未确认，请先重新读取核对：raw');
});

test('interpolation preserves raw origins, paths, errors and brand names as text',()=>{
  const origin='https://用户.example',path='/chat/中文',detail='<img src=x onerror=alert(1)>';
  for(const locale of locales){
    assert(scrollNavigationText(locale,'editOrigin',{origin}).includes(origin));
    assert(scrollNavigationText(locale,'deleteConfirm',{host:origin,path}).includes(path));
    assert(scrollNavigationText(locale,'unknownWrite',{detail}).includes(detail));
    assert.equal(scrollNavigationText(locale,'originPlaceholder'),'https://example.ai');
  }
});

function componentFixture(t,options={}){
  let reads=0,picks=0,nav;
  const model={identityKey:'same-install',locale:'zh-CN',onRead:async()=>{
    reads++;return options.read?options.read():{value:{version:1,sites:[]},etag:'same-etag'};
  },onDraftChange(){},isApproved:()=>true,onCurrentPageDetails:async()=>null,
  onPick:async()=>{picks++;return options.pick();},...options.model};
  const f=createExtensionCenterDOM(t,{component:ScrollSiteManager,props:{model,onNavigation:value=>{nav=value;}}});
  return {...f,get reads(){return reads;},get picks(){return picks;},get navigation(){return nav;},
    language(locale){f.state.model={...f.state.model,locale};f.paint();}};
}

test('async controller error descriptions recursively translate without another read',async t=>{
  let reject;
  const f=componentFixture(t,{read:()=>new Promise((_,fail)=>{reject=fail;})});await tick();
  f.language('en');
  reject(Object.assign(new Error('旧中文不应缓存'),{code:'E_CONFIG_UNKNOWN',scrollMessage:{key:'unknownWrite',parameters:{
    detail:{key:'mismatchedReceipt',parameters:{}}}}}));await tick();
  const error=()=>f.doc.querySelector('.ec-scroll-error').textContent;
  assert.match(error(),/write outcome is unconfirmed/);assert.match(error(),/receipt does not match/);
  for(const locale of locales){
    f.language(locale);await tick();
    assert.equal(error(),scrollNavigationText(locale,'readFailed',{detail:scrollNavigationText(locale,'unknownWrite',{
      detail:scrollNavigationText(locale,'mismatchedReceipt')})}));
  }
  assert.equal(f.reads,1);
});

test('internal async picker errors and notices change language in place',async t=>{
  let finish;
  const f=componentFixture(t,{model:{resumeDraft:{origin:'https://custom.example',pathScope:'/',mainSelector:'main',
    scrollSelector:'#scroll',messageSelector:'',anchorSelector:'',enabled:true}},
    pick:()=>new Promise(resolve=>{finish=resolve;})});await tick();
  const input=f.doc.getElementById('scroll-mainSelector');
  const pick=()=>f.doc.querySelector('.ec-scroll-picker').dispatch('click');
  pick();await tick();f.language('en');await tick();
  assert.match(f.doc.querySelector('.ec-scroll-notice').textContent,/Select a target/);
  finish({state:'timeout'});await tick();f.paint();
  assert.match(f.doc.querySelector('.ec-scroll-error').textContent,/Selection timed out/);
  f.language('ja');await tick();
  assert.match(f.doc.querySelector('.ec-scroll-error').textContent,/タイムアウト/);
  pick();await tick();finish({state:'cancelled'});await tick();f.paint();
  f.language('en');await tick();
  assert.equal(f.doc.querySelector('.ec-scroll-notice').textContent,scrollNavigationText('en','pickCancelled'));
  assert.equal(f.doc.getElementById('scroll-mainSelector'),input);
  assert.equal(f.navigation.backLabel,'Back to app home');
  assert.equal(f.navigation.settingsLabel,'Navigation settings');
  assert.equal(f.navigation.addSiteLabel,'Add website');
  assert.equal(f.reads,1);assert.equal(f.picks,2);
});

test('external async error messages remain escaped raw text across locale changes',async t=>{
  const raw='<img src=x onerror=alert(1)> 原始错误';
  const f=componentFixture(t,{read:async()=>{throw new Error(raw);}});await tick();f.paint();
  for(const locale of locales){
    f.language(locale);await tick();
    assert.equal(f.doc.querySelector('.ec-scroll-error').textContent,scrollNavigationText(locale,'readFailed',{detail:raw}));
    assert.equal(f.doc.querySelector('img'),null);
  }
  assert.equal(f.reads,1);
});


test('shared project description formatter handles nested semantic and raw details',()=>{
  const raw='外部 <raw> error';
  for(const locale of locales){
    assert.equal(scrollNavigationMessageText(locale,{key:'unknownWrite',parameters:{detail:{key:'mismatchedReceipt',parameters:{}}}}),
      scrollNavigationText(locale,'unknownWrite',{detail:scrollNavigationText(locale,'mismatchedReceipt')}));
    assert.equal(scrollNavigationMessageText(locale,raw),raw);
    assert.equal(scrollNavigationMessageText(locale,null),'');
    assert.match(scrollNavigationText(locale,'packageDescription'),/ChatGPT/);
    assert.match(scrollNavigationText(locale,'packageDescription'),/DeepSeek/);
    assert.match(scrollNavigationText(locale,'packageDescription'),/Gemini/);
  }
});
