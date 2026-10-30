// React AdBlock navigation regression: identity is governed by the product
// model and a fresh Host read, never by a copied JSX source expression.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {siteHost,confirmed} from '../../projects/adblock/src/model.js';

const src=()=>readFile(new URL('../../projects/adblock/src/App.jsx',import.meta.url),'utf8');
const state=(host,overrides={})=>({
  enabled:true,exceptions:[],toolEnabled:true,restartRequired:false,
  permissions:{dnr:true},rules:{verified:true},
  currentSite:{status:'ready'},currentHost:host,...overrides
});

test('AdBlock React listens for the actual sandbox page and tool invalidation events',async()=>{
  const code=await src();
  for(const name of ['opendesk-page-changed','opendesk-tool-state-changed']){
    assert.ok(code.includes("addEventListener?.('"+name+"',onPageChanged)"),name+' subscribe');
    assert.ok(code.includes("removeEventListener?.('"+name+"',onPageChanged)"),name+' unsubscribe');
  }
  assert.doesNotMatch(code,/event\.data\?\.kind==='page-changed'/);
});

test('context change invalidates in-flight reads and site controls before refresh',async()=>{
  const code=await src();
  const invalidation=code.slice(code.indexOf('const onPageChanged=()=>{'),
    code.indexOf('const onMessage=',code.indexOf('const onPageChanged=()=>{')));
  assert.ok(invalidation.startsWith('const onPageChanged=()=>{'),'navigation handler must exist');
  for(const fragment of [
    'contextRevision.current++','reading.current++',
    'current.current=null','setState(null)','setLoading(true)','void refresh()'])
    assert.ok(invalidation.includes(fragment),'missing navigation invalidation: '+fragment);
  assert.match(code,/const host=siteHost\(state\)/);
  assert.match(code,/const siteLocked=switchLocked\|\|!on\|\|!host/);
  assert.match(code,/const operationContext=contextRevision\.current/);
  assert.match(code,/if\(operationContext!==contextRevision\.current\)/);
});

test('site identity stays unavailable until trusted Host reports ready',()=>{
  for(const status of ['navigating','incognito','unsupported','unavailable'])
    assert.equal(siteHost(state('old.example',{currentSite:{status}})),null,status);
  assert.equal(siteHost(state('new.example')), 'new.example');
  assert.equal(siteHost(state('',{currentSite:{status:'ready'}})),null);
  assert.equal(siteHost(state('old.example',{currentSite:{status:'ready'},currentHost:null})),null);
});

test('a previous website cannot masquerade as a confirmed new-site exception',()=>{
  const previous=state('a.example',{exceptions:['a.example']});
  const afterNavigation=state('b.example',{exceptions:['a.example']});
  assert.equal(confirmed(previous,afterNavigation,'adblock.site.set',
    {host:'a.example',filtering:false}),false,'old tab result must not confirm new tab');
  assert.equal(confirmed(afterNavigation,afterNavigation,'adblock.site.set',
    {host:'a.example',filtering:false}),false,'current site is authoritative');
  const newSite=state('b.example',{exceptions:['a.example','b.example']});
  assert.equal(confirmed(newSite,newSite,'adblock.site.set',
    {host:'b.example',filtering:false}),true,'matching Host readback can confirm');
});
