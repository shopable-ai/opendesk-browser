import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAnalyticsGateway} from '../../services/analytics/worker.mjs';
import {createAnalyticsCollector} from '../../src/analytics/collector.js';
import {ANALYTICS_DISCLOSURE_VERSION} from '../../src/analytics/contract.js';

async function listen(server){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return 'http://127.0.0.1:'+server.address().port;
}
const shutdown=server=>new Promise(resolve=>server.close(resolve));
function d1(db){
  const prepare=sql=>({bind(...args){
    const statement=db.prepare(sql);
    return {
      async run(){const result=statement.run(...args);return {meta:{changes:result.changes}};},
      async all(){return {results:statement.all(...args)};}
    };
  }});
  return {prepare,async batch(statements){
    db.exec('BEGIN IMMEDIATE');
    try{
      const rows=[];for(const item of statements)rows.push(await item.run());
      db.exec('COMMIT');return rows;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }};
}
function memoryChrome(){
  const entries=new Map();
  return {entries,storage:{local:{
    async get(key){return {[key]:structuredClone(entries.get(key))};},
    async set(obj){for(const [key,value] of Object.entries(obj))entries.set(key,structuredClone(value));}
  }},alarms:{async create(){},async clear(){}}};
}
const EVENT_ARGS={event:'prompt.saved',toolId:'prompt-shortcuts',source:'host',channel:'sidepanel'};

test('real loopback HTTP → D1 SQL → PostHog-shaped HTTP, stable dedup and recovery',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'opendesk-analytics-'));
  const file=join(directory,'analytics.db');
  const db=new DatabaseSync(file);
  db.exec(await readFile(fileURLToPath(new URL('../../services/analytics/schema.sql',import.meta.url)),'utf8'));
  const inbox=[];
  let posthogOnline=true;
  const upstream=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    if(!posthogOnline){res.writeHead(503);res.end('offline');return;}
    inbox.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    res.writeHead(200,{'content-type':'application/json'});res.end('{}');
  });
  const upstreamURL=await listen(upstream);
  let clock=Date.UTC(2026,9,20,12,0,0);
  const env={DB:d1(db),POSTHOG_HOST:'https://eu.i.posthog.com',
    POSTHOG_PROJECT_TOKEN:'test_project_token_long',RATE_SALT:'a_very_long_random_salt_for_tests'};
  const gateway=createAnalyticsGateway({now:()=>clock,fetcher:async(_url,init)=>fetch(upstreamURL+'/batch/',init)});
  let outbox=[];
  const receiver=createServer(async(req,res)=>{
    const parts=[];for await(const part of req)parts.push(part);
    const request=new Request('https://analytics.example'+req.url,{
      method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(parts)}:{})
    });
    try{
      const response=await gateway.fetch(request,env,{waitUntil(p){outbox.push(p);}});
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(await response.text());
    }catch(error){res.writeHead(500);res.end(String(error));}
  });
  const url=await listen(receiver);
  t.after(async()=>{
    await shutdown(receiver);await shutdown(upstream);db.close();await rm(directory,{recursive:true,force:true});
  });
  const drain=async()=>{await Promise.allSettled(outbox.splice(0));};
  const api=memoryChrome();
  const endpoint=url+'/v1/events';
  const collector=createAnalyticsCollector({api,endpoint,allowLoopback:true,now:()=>clock,
    fetcher:globalThis.fetch});
  // Consent is not inferred from the presence of an endpoint.
  assert.equal((await collector.record(EVENT_ARGS)).recorded,false);
  await collector.setConsent(true,{disclosureVersion:ANALYTICS_DISCLOSURE_VERSION});
  await collector.record(EVENT_ARGS);
  await collector.record(EVENT_ARGS);
  // Simulate MV3 Service Worker re-creation; queue survives in storage.
  const recovered=createAnalyticsCollector({api,endpoint,allowLoopback:true,now:()=>clock,
    fetcher:globalThis.fetch});
  assert.equal((await recovered.status()).queued,2);
  assert.equal((await recovered.flush()).sent,2);
  await drain();
  assert.equal((await recovered.status()).queued,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n,2);
  assert.equal(inbox.flatMap(row=>row.batch).length,2);
  assert(inbox.every(row=>row.token==='test_project_token_long'));
  assert(inbox.every(row=>row.batch.every(e=>e.properties.$process_person_profile===false &&
    e.properties.distinct_id===e.distinct_id)));
  const firstEvent=inbox[0].batch[0];
  assert.equal(firstEvent.event,'prompt.saved');
  assert(!JSON.stringify(inbox).includes('private text'));
  // Same eventId replay: accepted once and duplicate receipts on retries.
  const persisted=db.prepare('SELECT event_id,install_id,event_json FROM analytics_events WHERE status = ?').get('sent');
  // A new D1 receipt for an already-sent ID is still a duplicate; no upstream resend.
  const original=api.entries.get('opendesk.analytics.state.v1');
  const repeated={eventId:persisted.event_id,installId:persisted.install_id,
    event:'prompt.saved',toolId:'prompt-shortcuts',
    timestamp:new Date(clock).toISOString(),source:'host',channel:'sidepanel'};
  const retry=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({version:1,events:[repeated]})});
  assert.equal(retry.status,202);
  assert.deepEqual((await retry.json()).duplicates,[repeated.eventId]);
  await drain();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n,2);
  assert.equal(inbox.flatMap(row=>row.batch).length,2);
  assert.equal(original.consent,true);
  // Fail upstream, keep durable pending, advance retry clock and resend on cron.
  posthogOnline=false;
  await recovered.record(EVENT_ARGS);
  assert.equal((await recovered.flush()).sent,1,'D1 durable ACK is independent of PostHog availability');
  await drain();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analytics_events WHERE status=?').get('pending').n,1);
  posthogOnline=true;
  clock+=31000;
  await gateway.scheduled(null,env,{waitUntil(p){outbox.push(p);}});
  await drain();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analytics_events WHERE status=?').get('pending').n,0);
  assert.equal(inbox.flatMap(row=>row.batch).length,3);
  // Invalid schema, client-provided content, oversize and stale events are rejected over real HTTP.
  for(const invalid of [
    {...repeated,eventId:randomUUID(),promptBody:'secret should not leave'},
    {...repeated,eventId:randomUUID(),timestamp:new Date(clock-9*86400000).toISOString()},
    {...repeated,eventId:randomUUID(),source:'tool_reported'},
  ]){
    const bad=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({version:1,events:[invalid]})});
    assert.equal(bad.status,400);
  }
  const huge=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},
    body:'x'.repeat(18000)});
  assert.equal(huge.status,413);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n,3);
});
