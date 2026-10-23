import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateAnalyticsEvent,validateAnalyticsBatch,ANALYTICS_VERSION,ANALYTICS_DISCLOSURE_VERSION} from '../../src/analytics/contract.js';
import {validAnalyticsEndpoint,createAnalyticsCollector} from '../../src/analytics/collector.js';

const now=Date.UTC(2026,9,20,12,0,0);
const sample=(event='prompt.inserted')=>({
  eventId:randomUUID(),installId:randomUUID(),event,toolId:'prompt-shortcuts',
  timestamp:new Date(now).toISOString(),
  source:event==='prompt.inserted'?'page_adapter':'host',
  channel:event==='prompt.inserted'?'page_button':'sidepanel'
});
function chromeStorage(){
  const values=new Map();
  return {
    values,
    storage:{local:{
      async get(key){return {[key]:structuredClone(values.get(key))};},
      async set(obj){for(const [key,value] of Object.entries(obj))values.set(key,structuredClone(value));}
    }},
    alarms:{async create(){},async clear(){}}
  };
}
test('strict event contract rejects content-bearing or unauthorized events',()=>{
  const event=sample();
  assert.equal(validateAnalyticsEvent(event,{now}).event,'prompt.inserted');
  assert.equal(validateAnalyticsBatch({version:ANALYTICS_VERSION,events:[event]},{now}).length,1);
  for(const polluted of [
    {...event,prompt:'private text'},
    {...event,url:'https://private.example/chat'},
    {...event,reason:'a secret detail'},
    {...event,toolId:'cookie-editor'},
    {...event,event:'tool.installed',source:'tool_reported',channel:'extension'},
    {...event,event:'prompt.saved',source:'tool_reported'},
    {...event,installId:'user@example.com'},
    {...event,timestamp:new Date(now-8*86400000).toISOString()},
    {...event,timestamp:new Date(now+7*60000).toISOString()}
  ])assert.throws(()=>validateAnalyticsEvent(polluted,{now}));
  assert.throws(()=>validateAnalyticsBatch({version:ANALYTICS_VERSION,events:[event,event]},{now}));
  assert.throws(()=>validateAnalyticsBatch({version:ANALYTICS_VERSION,events:[...Array(11)].map(()=>sample())},{now}));
});
test('HTTPS-only release endpoint, and explicit loopback for test harness',()=>{
  assert.equal(validAnalyticsEndpoint(''),false);
  assert.equal(validAnalyticsEndpoint('http://example.com/v1/events'),false);
  assert.equal(validAnalyticsEndpoint('https://example.com/v1/events'),true);
  assert.equal(validAnalyticsEndpoint('https://user:pw@example.com/v1/events'),false);
  assert.equal(validAnalyticsEndpoint('https://example.com/v1/events?token=secret'),false);
  assert.equal(validAnalyticsEndpoint('http://127.0.0.1:1234/v1/events',{allowLoopback:true}),true);
});
test('default off, explicit opt-in, bounded queue, and revoke clears install identity',async()=>{
  const api=chromeStorage();
  let clock=now;let attempts=0;
  const collector=createAnalyticsCollector({api,now:()=>clock,endpoint:'http://127.0.0.1:7890/v1/events',
    allowLoopback:true,fetcher:async()=>{attempts++;throw Error('offline');}});
  const evt={event:'prompt.saved',toolId:'prompt-shortcuts',source:'host',channel:'sidepanel'};
  assert.deepEqual(await collector.record(evt),{recorded:false});
  assert.equal((await collector.status()).consent,false);
  await collector.setConsent(true,{disclosureVersion:ANALYTICS_DISCLOSURE_VERSION});
  await Promise.all(Array.from({length:32},()=>collector.record(evt)));
  assert.equal((await collector.status()).queued,32,'concurrent panel events must share one queue');
  const state=api.values.get('opendesk.analytics.state.v1');
  assert.equal(new Set(state.queue.map(x=>x.eventId)).size,32);
  assert.equal(new Set(state.queue.map(x=>x.installId)).size,1);
  assert.equal((await collector.flush()).sent,0);
  assert.equal(attempts,1);
  assert.equal(api.values.get('opendesk.analytics.state.v1').queue.length,32);
  await collector.setConsent(false);
  const cleared=api.values.get('opendesk.analytics.state.v1');
  assert.equal(cleared.queue.length,0);
  assert.equal(cleared.installId,null);
  assert.equal((await collector.record(evt)).recorded,false);
  await collector.setConsent(true,{disclosureVersion:ANALYTICS_DISCLOSURE_VERSION});
  assert.notEqual(api.values.get('opendesk.analytics.state.v1').installId,state.installId);
  clock+=1000;
});
