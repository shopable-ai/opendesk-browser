import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsReactFixture} from '../../../tests/helpers/trusted-settings-react-fixture.mjs';
import {createTimeReviewPermissionControls} from '../trusted/host-controls.js';
import {TIME_REVIEW_KEY} from '../trusted/model.js';
import {timeReviewCatalog,timeReviewText} from '../trusted/localization.js';
import {uiMessage,compileToolLocaleCatalog} from '../../../src/ui/app-localization.js';
import {createUiLocaleController} from '../../../src/ui/app-localization.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('trusted settings follow global locale without resetting reviews or writing',async t=>{
  const f=settingsReactFixture('timeReview',t),calls=[],notices=[];
  const locale=createUiLocaleController(null,{languages:['en-US'],storage:()=>null,eventTarget:null});
  t.after(()=>locale.dispose());
  const api={storage:{local:{get:async()=>{calls.push('read');return {[TIME_REVIEW_KEY]:{siteGrants:{allSites:false,origins:[]}}};}}},
    permissions:{contains:async()=>false,request:()=>{calls.push('permission');return Promise.resolve(true);}},
    windows:{getLastFocused:async()=>({focused:true,type:'normal',id:1})},
    tabs:{query:async()=>[{url:'https://example.com/page'}]}};
  const controls=createTimeReviewPermissionControls({api,ui:f.ui,localeController:locale,
    notice:(message,error)=>notices.push([message,error]),runOperation:async()=>{calls.push('write');}});
  t.after(()=>controls.dispose());
  controls.render({id:'time-review',capabilities:['time.review']});await tick();
  assert.equal(f.find('time-review-grant-idle').textContent,'Grant idle detection');
  assert.equal(f.model.siteStatus,'No websites authorized; time will not be recorded');
  await f.invoke('time-review-site-current-open');
  f.invoke('time-review-clear-open');f.invoke('time-review-minute-disable');f.invoke('time-review-site-all-open');
  const button=f.find('time-review-site-current-approve'),effect=f.model.effect;
  let focusCalls=0;button.focus=()=>{focusCalls++;};button.focus();
  const before=[...calls];
  for(const [language,label] of [['ja','アイドル検出を許可'],['zh-TW','授權閒置偵測'],['zh-CN','授权空闲检测'],['en','Grant idle detection']]){
    locale.setLocalePreference(language,{persist:false});
    assert.equal(f.find('time-review-grant-idle').textContent,label);
    assert.equal(f.find('time-review-site-current-approve'),button);
    assert.equal(f.model.effect,effect);
    assert.equal(f.model.siteReview,true);assert.equal(f.model.allReview,true);assert.equal(f.model.clearReview,true);assert.equal(f.model.minuteReview,true);
    assert.match(f.find('time-review-site-confirm-text').textContent,/https:\/\/example.com/);
  }
  assert.equal(focusCalls,1,'locale-only updates do not replay focus or scroll effects');
  assert.deepEqual(calls,before,'locale-only updates never read or write business state');
  assert.match(f.find('time-review-permission-settings').getAttribute('aria-label'),/Time Review/);
  f.invoke('time-review-trusted-start',{isTrusted:false});await tick();
  assert.deepEqual(calls,before);assert.match(notices.at(-1)[0],/trusted/);
  f.invoke('time-review-grant-idle');assert.equal(calls.at(-1),'permission','request stays in trusted click stack');
  await tick();assert.match(notices.at(-1)[0],/Idle detection/);
  controls.dispose();locale.setLocalePreference('ja',{persist:false});assert.equal(f.model,null);
});

test('four locale catalogs preserve interpolation and framework fallback',()=>{
  const {sourceLocale,messages}=timeReviewCatalog;
  const reviewed={sourceLocale,messages:{[sourceLocale]:messages[sourceLocale]}};
  for(const locale of ['en','ja','zh-TW'])reviewed.messages[locale]=Object.fromEntries(
    Object.entries(messages[locale]).map(([key,text])=>[key,{source:messages[sourceLocale][key],text}]));
  assert.doesNotThrow(()=>compileToolLocaleCatalog(reviewed),'all messages and placeholders are valid');
  for(const locale of ['zh-CN','en','ja','zh-TW']){
    for(const key of Object.keys(messages[sourceLocale])){
      const text=timeReviewText(locale,key,{origin:'https://example.com',count:2,code:'E_TEST',message:'raw error'});
      assert(text,key);assert.doesNotMatch(text,/\{[a-zA-Z]+\}/,key);
      assert.equal(text,uiMessage(timeReviewCatalog,locale,key,{origin:'https://example.com',count:2,code:'E_TEST',message:'raw error'}));
    }
  }
  assert.equal(timeReviewText('en-GB','grantIdle'),'Grant idle detection');
  assert.equal(timeReviewText('ja-JP','grantIdle'),'アイドル検出を許可');
  assert.equal(timeReviewText('fr','grantIdle'),'授权空闲检测');
  assert.equal(timeReviewText('zh-HK','grantIdle'),'授权空闲检测','retain resolveUiLocale fallback semantics');
  const missing={...timeReviewCatalog,messages:{...messages,en:{}}};
  assert.equal(uiMessage(missing,'en','revokeSite',{origin:'example'}),'撤销 example 的时间统计授权');
});

test('real component escapes origin in text, title and ARIA in all four locales',t=>{
  const f=settingsReactFixture('timeReview',t),origin='<img src=x onerror=alert(1)>',received=[];
  f.ui.connect({revokeSite:(...args)=>received.push(args)});
  for(const locale of ['zh-CN','en','ja','zh-TW']){
    f.ui.render({visible:true,locale,origins:[origin]});
    const button=f.find('time-review-site-grants-list').querySelector('button');
    assert.equal(button.title,timeReviewText(locale,'revokeSite',{origin}));
    assert.equal(button.getAttribute('aria-label'),button.title);
    assert.equal(button.textContent,timeReviewText(locale,'revoke'));
    assert.equal(f.root.querySelector('img'),null);
    assert.match(f.find('time-review-site-grants-list').textContent,/<img/);
    const native=new f.window.Event('click',{bubbles:true});button.dispatchEvent(native);
    assert.deepEqual(received.at(-1),[origin,native],'original event and origin are forwarded unchanged');
  }
});

test('localized grant status and confirmations retain origin fencing across locale updates',async t=>{
  const f=settingsReactFixture('timeReview',t),notices=[],writes=[];
  let origin='https://one.example',grants={allSites:false,origins:['https://one.example']};
  const locale=createUiLocaleController(null,{languages:['en'],storage:()=>null,eventTarget:null});
  t.after(()=>locale.dispose());
  const controls=createTimeReviewPermissionControls({localeController:locale,ui:f.ui,
    api:{storage:{local:{get:async()=>({[TIME_REVIEW_KEY]:{siteGrants:grants}})}},
      permissions:{contains:async()=>true},windows:{getLastFocused:async()=>({focused:true,type:'normal',id:1})},
      tabs:{query:async()=>[{url:origin}]}},notice:(message,error)=>notices.push([message,error]),runOperation:async(...args)=>writes.push(args)});
  t.after(()=>controls.dispose());
  const tool={id:'time-review',capabilities:['time.review']};controls.render(tool);await tick();
  assert.equal(f.model.siteStatus,'Authorized websites: 1');
  await f.invoke('time-review-site-current-open');
  locale.setLocalePreference('ja',{persist:false});
  assert.equal(f.model.siteStatus,'1 件のサイトを許可済み');
  origin='https://two.example';await f.invoke('time-review-site-current-approve');
  assert.deepEqual(writes,[]);assert.equal(f.model.siteReview,false);
  assert.equal(notices.at(-1)[0],timeReviewText('ja','siteChanged'));
  grants={allSites:true,origins:[]};controls.render(tool);await tick();
  assert.equal(f.model.siteStatus,timeReviewText('ja','allGranted'));
  grants={allSites:false,origins:['invalid']};controls.render(tool);await tick();
  assert.equal(f.model.siteStatus,timeReviewText('ja','invalidGrants'));
  locale.setLocalePreference('en',{persist:false});
  assert.equal(f.model.siteStatus,timeReviewText('en','invalidGrants'));
});

test('pending operation changes presentation language without replay and keeps raw errors',async t=>{
  const f=settingsReactFixture('timeReview',t),notices=[];let reject,calls=0;
  const locale=createUiLocaleController(null,{languages:['en'],storage:()=>null,eventTarget:null});
  t.after(()=>locale.dispose());
  const controls=createTimeReviewPermissionControls({api:{},localeController:locale,ui:f.ui,
    notice:(message,error)=>notices.push([message,error]),runOperation:()=>{calls++;return new Promise((_,fail)=>{reject=fail;});}});
  t.after(()=>controls.dispose());
  controls.render({id:'time-review',capabilities:['time.review']});await tick();
  assert.equal(f.model.siteStatus,timeReviewText('en','unreadableGrants'));
  f.invoke('time-review-trusted-start');await tick();
  locale.setLocalePreference('ja',{persist:false});
  assert.equal(f.model.busy,true);assert.equal(calls,1);
  f.invoke('time-review-trusted-start');assert.equal(calls,1);
  reject(Object.assign(new Error('原始错误 <raw>'),{code:'E_TEST'}));await tick();
  assert.deepEqual(notices.at(-1),['E_TEST：原始错误 <raw>',true]);
  assert.equal(f.model.busy,false);assert.equal(calls,1);
});

test('optional getLocale supports existing controller-free consumers',async t=>{
  const f=settingsReactFixture('timeReview',t);let locale='en-US';
  const controls=createTimeReviewPermissionControls({api:{},ui:f.ui,getLocale:()=>locale,notice(){},runOperation(){}});
  t.after(()=>controls.dispose());
  const tool={id:'time-review',capabilities:['time.review']};
  controls.render(tool);await tick();assert.equal(f.find('time-review-grant-idle').textContent,'Grant idle detection');
  locale='unknown';controls.render(tool);await tick();assert.equal(f.find('time-review-grant-idle').textContent,'授权空闲检测');
});

test('permission denial uses the latest locale and disposal ignores late grants',async t=>{
  const f=settingsReactFixture('timeReview',t),notices=[];let reply,requests=0,operations=0;
  const locale=createUiLocaleController(null,{languages:['en'],storage:()=>null,eventTarget:null});
  t.after(()=>locale.dispose());
  const controls=createTimeReviewPermissionControls({localeController:locale,ui:f.ui,
    api:{permissions:{request(){requests++;return new Promise(resolve=>{reply=resolve;});}}},
    notice:(message,error)=>notices.push([message,error]),runOperation:()=>operations++});
  t.after(()=>controls.dispose());
  controls.render({id:'time-review',capabilities:['time.review']});await tick();
  f.invoke('time-review-grant-idle',{isTrusted:false});assert.equal(requests,0);
  f.invoke('time-review-grant-idle');assert.equal(requests,1);
  locale.setLocalePreference('zh-TW',{persist:false});
  reply(false);await tick();assert.deepEqual(notices.at(-1),[timeReviewText('zh-TW','idleDenied'),true]);
  f.invoke('time-review-grant-idle');assert.equal(requests,2);
  const count=notices.length;controls.dispose();reply(true);await tick();
  locale.setLocalePreference('ja',{persist:false});
  assert.equal(f.model,null);assert.equal(notices.length,count);assert.equal(operations,0);
});


test('website consent shows the complete long Origin through locale changes without granting',async t=>{
  const f=settingsReactFixture('timeReview',t),writes=[];
  const origin='https://'+['a'.repeat(60),'b'.repeat(60),'c'.repeat(60),'d'.repeat(50)].join('.')+'.example';
  assert.equal(new URL(origin).origin,origin);
  const locale=createUiLocaleController(null,{languages:['en'],storage:()=>null,eventTarget:null});
  t.after(()=>locale.dispose());
  const controls=createTimeReviewPermissionControls({localeController:locale,ui:f.ui,notice(){},
    api:{storage:{local:{get:async()=>({[TIME_REVIEW_KEY]:{siteGrants:{allSites:false,origins:[origin]}}})}},
      permissions:{contains:async()=>false},windows:{getLastFocused:async()=>({focused:true,type:'normal',id:1})},
      tabs:{query:async()=>[{url:origin+'/page'}]}},runOperation:(...args)=>writes.push(args)});
  t.after(()=>controls.dispose());
  controls.render({id:'time-review',capabilities:['time.review']});await tick();
  await f.invoke('time-review-site-current-open');
  for(const language of ['en','ja','zh-TW','zh-CN']){
    locale.setLocalePreference(language,{persist:false});
    assert.ok(f.find('time-review-site-confirm-text').textContent.includes(origin),'review must show the exact consent scope');
    const revoke=f.find('time-review-site-grants-list').querySelector('button');
    assert.ok(revoke.title.includes(origin));assert.ok(revoke.getAttribute('aria-label').includes(origin));
  }
  assert.deepEqual(writes,[]);
});

test('completed owned notices provide a live projection while raw Chrome errors remain literal',async t=>{
  const f=settingsReactFixture('timeReview',t),notices=[];
  const locale=createUiLocaleController(null,{languages:['en'],storage:()=>null,eventTarget:null});
  t.after(()=>locale.dispose());
  const controls=createTimeReviewPermissionControls({localeController:locale,ui:f.ui,api:{},
    notice:(...args)=>notices.push(args),runOperation:async()=>({ok:true})});
  t.after(()=>controls.dispose());
  controls.render({id:'time-review',capabilities:['time.review']});await tick();
  f.invoke('time-review-trusted-start');await tick();
  const notice=notices.at(-1);assert.equal(notice[0],timeReviewText('en','started'));
  assert.equal(typeof notice[2],'function');
  for(const language of ['ja','zh-TW','zh-CN','en']){
    locale.setLocalePreference(language,{persist:false});
    assert.equal(notice[2](),timeReviewText(language,'started'));
  }
  f.invoke('time-review-grant-idle');
  const raw=notices.at(-1);assert.equal(typeof raw[0],'string');assert.notEqual(typeof raw[2],'function');
});
