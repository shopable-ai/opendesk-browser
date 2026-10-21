import test from 'node:test';
import assert from 'node:assert/strict';
import {wantedAdblockRules} from '../../examples/sidebar-tools/adblock/trusted/rules.js';
import {ADBLOCK_RULE_FIRST,ADBLOCK_RULE_LAST,ADBLOCK_MAX_EXCEPTIONS}
  from '../../examples/sidebar-tools/adblock/trusted/policy.js';

test('JavBus third-party ad scripts and frames are covered without blocking the site domain',()=>{
  const rule=wantedAdblockRules({enabled:true,exceptions:[]})[0];
  assert.ok(rule.condition.requestDomains.includes('jads.co'),
    'poweredby.jads.co/js/jads.js and adshow.php were observed on the live homepage');
  assert.equal(rule.condition.domainType,'thirdParty');
  for(const type of ['script','sub_frame'])assert.ok(rule.condition.resourceTypes.includes(type));
  assert.equal(rule.condition.resourceTypes.includes('main_frame'),false);
  assert.equal(rule.condition.requestDomains.includes('javbus.com'),false);
});

test('same-site banner rule covers only the observed ad image path, with an explicit initiator scope',()=>{
  const rule=wantedAdblockRules({enabled:true,exceptions:[]}).find(rule=>rule.id===ADBLOCK_RULE_LAST);
  assert.ok(rule,'same-origin banner images need a separate scoped rule');
  assert.equal(rule.action.type,'block');
  assert.equal(rule.priority,1);
  assert.deepEqual(rule.condition.initiatorDomains,['javbus.com']);
  assert.deepEqual(rule.condition.resourceTypes,['image']);
  assert.equal(rule.condition.isUrlFilterCaseSensitive,true);
  const pattern=new RegExp(rule.condition.regexFilter);
  for(const url of [
    'https://www.javbus.com/forum/data/attachment/forum/ads/od_20261019_4.jpg',
    'https://javbus.com/forum/data/attachment/forum/ads/xk_20261019_4.jpg?cache=1',
    'http://www.javbus.com:8080/forum/data/attachment/forum/ads/banner.gif'
  ])assert.equal(pattern.test(url),true,url);
  for(const url of [
    'https://www.javbus.com/pics/cover/example_b.jpg',
    'https://www.javbus.com/images/logo.png',
    'https://www.javbus.com/js/base.js',
    'https://www.javbus.com/forum/data/attachment/forum/normal.jpg',
    'https://www.javbus.com/forum/data/attachment/forum/ads-other/banner.jpg',
    'https://www.javbus.com/forum/data/attachment/forum/ADS/banner.jpg',
    'https://www.javbus.com.evil.test/forum/data/attachment/forum/ads/banner.jpg',
    'https://notjavbus.com/forum/data/attachment/forum/ads/banner.jpg',
    'https://example.com/?next=https://www.javbus.com/forum/data/attachment/forum/ads/a.jpg'
  ])assert.equal(pattern.test(url),false,url);
});

test('site-specific block preserves disable, site exception priority and all exception IDs',()=>{
  assert.deepEqual(wantedAdblockRules({enabled:false,exceptions:[]}),[]);
  const rules=wantedAdblockRules({enabled:true,exceptions:['www.javbus.com']});
  const exception=rules.find(rule=>rule.action.type==='allowAllRequests');
  assert.ok(new RegExp(exception.condition.regexFilter).test('https://www.javbus.com/'));
  assert.ok(rules.filter(rule=>rule.action.type==='block').every(rule=>rule.priority<exception.priority));
  const full=wantedAdblockRules({enabled:true,
    exceptions:Array.from({length:ADBLOCK_MAX_EXCEPTIONS},(_,i)=>`site${i}.example`)});
  assert.equal(new Set(full.map(rule=>rule.id)).size,full.length);
  assert.ok(full.every(rule=>rule.id>=ADBLOCK_RULE_FIRST&&rule.id<=ADBLOCK_RULE_LAST));
});
