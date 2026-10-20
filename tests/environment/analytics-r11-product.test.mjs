import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {installAnalyticsHost} from '../../src/analytics/host.js';
import {createAnalyticsGateway} from '../../services/analytics/worker.mjs';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {ANALYTICS_PROTOCOL,ANALYTICS_STATE_KEY} from '../../src/analytics/contract.js';

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',
  ()=>resolve('http://127.0.0.1:'+server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
function d1(db){
  const prepare=sql=>({bind(...args){
    const query=db.prepare(sql);
    return {run:async()=>({meta:{changes:query.run(...args).changes}}),
      all:async()=>({results:query.all(...args)})};
  }});
  return {prepare,async batch(queries){
    db.exec('BEGIN IMMEDIATE');
    try{
      const result=[];for(const query of queries)result.push(await query.run());
      db.exec('COMMIT');return result;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }};
}
function chromeMock(installed){
  const records=new Map([[SIDEBAR_TOOL_STORE,installed]]);
  const messageListeners=[],changeListeners=[],alarmListeners=[];
  const id='analytics-test-extension';
  const api={runtime:{id,getURL:path=>'chrome-extension://'+id+'/'+path,
    onMessage:{addListener:cb=>messageListeners.push(cb)},
    onStartup:{addListener(){}},onInstalled:{addListener(){}}},
    alarms:{onAlarm:{addListener:cb=>alarmListeners.push(cb)},async create(){},async clear(){}},
    storage:{onChanged:{addListener:cb=>changeListeners.push(cb)},
      local:{async get(keys){
        const names=Array.isArray(keys)?keys:[keys];
        return Object.fromEntries(names.map(k=>[k,structuredClone(records.get(k))]));
      },async set(obj){
        const changes={};
        for(const [key,value] of Object.entries(obj)){
          changes[key]={oldValue:structuredClone(records.get(key)),newValue:structuredClone(value)};
          records.set(key,structuredClone(value));
        }
        for(const cb of changeListeners)cb(changes,'local');
      }}}
  };
  const send=(payload,sender)=>new Promise(resolve=>{
    const accepted=messageListeners.some(cb=>cb(payload,sender,resolve)===true);
    if(!accepted)resolve({ok:false,code:'NO_LISTENER'});
  });
  return {api,send,records};
}
async function eventually(check){
  for(let i=0;i<80;i++){
    if(await check())return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Timed out waiting for trusted analytics storage');
}
test('verified Side Panel opens → opt-in collector → real HTTP D1 → PostHog-shaped sink',async t=>{
  const now=Date.UTC(2026,9,20,12,0,0);
  const db=new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../../services/analytics/schema.sql',import.meta.url),'utf8'));
  t.after(()=>db.close());
  const received=[];
  const sink=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    res.writeHead(200);res.end('{}');
  });
  const sinkURL=await listen(sink);t.after(()=>close(sink));
  const pending=[];
  const env={DB:d1(db),POSTHOG_HOST:'https://eu.i.posthog.com',
    POSTHOG_PROJECT_TOKEN:'test_project_token_long',RATE_SALT:'test_salt_longer_than_twenty_four_characters'};
  const gateway=createAnalyticsGateway({now:()=>now,
    fetcher:(_url,options)=>fetch(sinkURL+'/batch/',options)});
  const receiver=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const result=await gateway.fetch(new Request('https://receiver.test'+req.url,{
      method:req.method,headers:req.headers,body:Buffer.concat(chunks)}),env,{
      waitUntil:task=>pending.push(task)});
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
  });
  const receiverURL=await listen(receiver);t.after(()=>close(receiver));
  const prompt=JSON.parse(await readFile(new URL(
    '../../examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json',import.meta.url),'utf8'));
  const {api,send,records}=chromeMock([prompt,{id:'cookie-editor'}]);
  const collector=installAnalyticsHost({api,endpoint:receiverURL+'/v1/events',allowLoopback:true,
    now:()=>now,newId:randomUUID,fetcher:globalThis.fetch});
  const id=api.runtime.id;
  const options={id,url:api.runtime.getURL('native-agent/settings.html'),frameId:0};
  const panel={id,url:api.runtime.getURL('sidepanel.html')+'?hostInstanceId='+randomUUID(),frameId:0};
  const page={id,url:'https://chatgpt.com/',frameId:0,
    tab:{id:12,url:'https://chatgpt.com/',incognito:false}};
  const report=(event,toolId,sender=panel)=>send({
    protocol:ANALYTICS_PROTOCOL,kind:'event.host_report',event,toolId,channel:'sidepanel'},sender);
  assert.equal((await report('app.opened','opendesk')).data.recorded,false,
    'pre-consent is never collected');
  assert.equal((await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:true},options)).ok,true);
  assert.equal((await report('app.opened','opendesk')).data.recorded,true);
  assert.equal((await report('app.opened','opendesk')).data.recorded,false,
    'same context reload is not a second opening');
  assert.equal((await report('tool.opened','cookie-editor')).ok,true);
  assert.equal((await report('tool.opened','prompt-shortcuts')).ok,true);
  assert.equal((await report('tool.opened','cookie-editor',{
    ...panel,url:panel.url+'&previewId=preview'})).code,'E_SENDER');
  assert.equal((await report('tool.opened','cookie-editor',{id,url:'https://evil.example/'})).code,'E_SENDER');
  const pageResult=await send({protocol:ANALYTICS_PROTOCOL,kind:'event.page_report',
    event:'prompt.inserted',toolId:'prompt-shortcuts',channel:'page_button'},page);
  assert.equal(pageResult.ok,true,'reviewed page adapter may report successful engagement');
  assert.equal((await collector.flush()).sent,6);
  await Promise.allSettled(pending.splice(0));
  const batch=received.flatMap(row=>row.batch);
  assert.equal(batch.length,6);
  assert.deepEqual(batch.map(row=>row.event).sort(),[
    'app.inventory','app.opened','prompt.inserted','tool.engaged','tool.opened','tool.opened'].sort());
  assert.equal(new Set(batch.map(row=>row.distinct_id)).size,1,
    'DAU counts one installation, not six events or two tools');
  assert.deepEqual(batch.find(row=>row.event==='app.inventory').properties.installed_tools,
    ['cookie-editor','prompt-shortcuts'],'first opt-in includes previously installed tools');
  assert(batch.every(row=>row.properties.$process_person_profile===false));
  assert(!JSON.stringify(received).includes('https://chatgpt.com/'));
  // The actual persisted registry, not a speculative install button, changes census.
  await api.storage.local.set({[SIDEBAR_TOOL_STORE]:[prompt]});
  await eventually(()=>records.get(ANALYTICS_STATE_KEY)?.queue?.some(
    row=>row.event==='app.inventory'&&row.installedTools?.length===1));
  assert.equal((await collector.flush()).sent,2,'uninstall and replacement census are sent');
  await Promise.allSettled(pending.splice(0));
  const last=received.flatMap(row=>row.batch).filter(row=>row.event==='app.inventory').at(-1);
  assert.deepEqual(last.properties.installed_tools,['prompt-shortcuts']);
  assert.equal((await send({protocol:ANALYTICS_PROTOCOL,kind:'consent.set',enabled:false},options)).ok,true);
  assert.equal(records.get(ANALYTICS_STATE_KEY).queue.length,0,'opt out discards queued events');
  assert.equal(records.get(ANALYTICS_STATE_KEY).installId,null);
  assert.equal((await report('tool.opened','prompt-shortcuts')).data.recorded,false);
});
