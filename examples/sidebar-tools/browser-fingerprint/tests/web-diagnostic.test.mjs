import test from 'node:test';
import assert from 'node:assert/strict';
import {readEnvironment,comparison,languageCacheMismatch} from '../../../tasks/browser-fingerprint/model.mjs';

function browser() {
  return {navigator:{userAgent:'test UA',platform:'MacIntel',language:'zh-CN',languages:['zh-CN','en'],
    userAgentData:{brands:[{brand:'Chromium',version:'154'}],mobile:false,platform:'macOS'}},
    location:{origin:'http://localhost:43111',pathname:'/browser-fingerprint.html'},Intl,
    innerWidth:1000,innerHeight:800,screen:{width:1728,height:1117},devicePixelRatio:2};
}

test('scalar-first reading exposes language cache inconsistency without repairing or masking it',() => {
  const win=browser(),order=[];
  Object.defineProperty(win.navigator,'language',{get(){order.push('scalar');return 'zh-CN';}});
  Object.defineProperty(win.navigator,'languages',{get(){order.push('array');return ['en-US'];}});
  const snapshot=readEnvironment(win);
  assert.equal(order[0],'scalar');
  assert.deepEqual(snapshot.fields.languages.value,['en-US']);
  assert.equal(languageCacheMismatch(snapshot),true);
});

test('missing or throwing browser APIs never count as a matching baseline',() => {
  const win=browser();
  Object.defineProperty(win.navigator,'userAgentData',{get(){throw Error('blocked');}});
  win.screen=null;
  const current=readEnvironment(win),rows=comparison(current,current);
  assert.equal(rows.find(row=>row.key==='uaCH').status,'unavailable');
  assert.equal(rows.find(row=>row.key==='screen').status,'unavailable');
  assert.equal(rows.find(row=>row.key==='language').status,'same');
});

test('full language array changes and order remain observable with a stable scalar',() => {
  const win=browser(),base=readEnvironment(win);
  win.navigator.languages=['zh-CN','de-DE'];
  let rows=comparison(readEnvironment(win),base);
  assert.equal(rows.find(row=>row.key==='language').status,'same');
  assert.equal(rows.find(row=>row.key==='languages').status,'changed');
  win.navigator.languages=['en','zh-CN'];
  rows=comparison(readEnvironment(win),base);
  assert.equal(rows.find(row=>row.key==='languages').status,'changed');
  assert.deepEqual(base.fields.languages.value,['zh-CN','en']);
});
