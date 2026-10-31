import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const bundled=await build({entryPoints:[new URL('../src/ui/Status.tsx',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime','../i18n/LocaleProvider']});
const localeBuild=await build({entryPoints:[new URL('../src/i18n/locale.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {translate}=await import(`data:text/javascript;base64,${Buffer.from(localeBuild.outputFiles[0].text).toString('base64')}`);
const nativeRequire=createRequire(import.meta.url),module={exports:{}};let locale='en';
runInNewContext(bundled.outputFiles[0].text,{exports:module.exports,module,require(name){return name==='../i18n/LocaleProvider'?{useI18n:()=>({locale,t:(key,params)=>translate(locale,key,params)})}:nativeRequire(name);}});
const {Status}=module.exports;
const status={desired:{mode:'rules'},managedIntent:false,control:'unknown',browserMode:null,applied:false,proxyError:'private://username:secret@host/?token=secret',probe:null,credentialRequired:false,statusErrorCode:'E_PREVIEW_READONLY',permission:null};
test('real status component explains SDK rejection in all locales and exposes only code and permission state',()=>{
 for(locale of ['zh-CN','en','zh-TW']){
  const html=renderToStaticMarkup(createElement(Status,{status,quiet:true}));
  assert.match(html,/E_PREVIEW_READONLY/);
  assert.doesNotMatch(html,/username|secret|private:|errGeneric/);
  assert.match(html,locale==='en'?/Local project debugging/:/本地/);
 }
});
test('actual permission values remain distinct from unconfirmed permission and never become a reachability claim',()=>{
 locale='en';
 for(const [permission,expected]of [[true,'Granted'],[false,'Not granted'],[null,'Unconfirmed']]){
  const html=renderToStaticMarkup(createElement(Status,{status:{...status,permission},quiet:false}));
  assert.ok(html.includes(expected));assert.doesNotMatch(html,/Connection verified|Reachable/);
 }
});

test('a confirmed old route plus new saved changes is pending and names the old route in details',()=>{
 locale='en';
 const html=renderToStaticMarkup(createElement(Status,{status:{...status,statusErrorCode:undefined,proxyError:null,
  managedIntent:true,control:'controlled_by_this_extension',applied:true,pendingChanges:true,
  desired:{mode:'direct'},activeSelection:{mode:'rules'},browserMode:'rules'},quiet:true}));
 assert.match(html,/statusDot pending/);assert.doesNotMatch(html,/statusDot ok/);
 assert.ok(html.includes(translate(locale,'proxyPendingShort')));
 assert.ok(html.includes(translate(locale,'chromeStillUsingLastConfirmedMode',{mode:translate(locale,'websiteRules2')})));
});

test('unclassified E_TOOL status failure offers a read retry without blaming configuration',()=>{
 for(locale of ['zh-CN','en','zh-TW']){
  const html=renderToStaticMarkup(createElement(Status,{status:{...status,statusErrorCode:'E_TOOL'},quiet:true}));
  assert.ok(html.includes(translate(locale,'apStatusReadFailedHelp')));
  assert.ok(!html.includes(translate(locale,'errGeneric')));assert.doesNotMatch(html,/username|secret/);
 }
});
