import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createAnalyticsGateway} from '../../services/analytics/worker.mjs';

const NOW=Date.UTC(2026,9,23,12);
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',
  ()=>resolve('http://127.0.0.1:'+server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
function d1(db){
  return {prepare:sql=>({bind(...args){
    const statement=db.prepare(sql);
    return {run:async()=>({meta:{changes:statement.run(...args).changes}}),
      all:async()=>({results:statement.all(...args)})};
  }}),async batch(queries){
    db.exec('BEGIN IMMEDIATE');
    try{
      const out=[];for(const query of queries)out.push(await query.run());
      db.exec('COMMIT');return out;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }};
}
const installId=randomUUID(),toolId='anon-0123456789ab0123456789ab';
function auto({version=1,total=100,utcDate='2026-10-23',eventId=randomUUID()}={}){
  return {eventId,installId,toolId,event:'tool.auto_daily',
    source:'host',channel:'extension',timestamp:new Date(NOW).toISOString(),
    toolType:'page',utcDate,metricType:'attempted',total,version};
}
test('real D1 SQL + PostHog-shaped HTTP: cumulative 100, retry, late version, gap & UTC day',async t=>{
  const db=new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../../services/analytics/schema.sql',import.meta.url),'utf8'));
  t.after(()=>db.close());
  const got=[];let online=true;
  const upstream=createServer(async(req,res)=>{
    const parts=[];for await(const part of req)parts.push(part);
    if(!online){res.writeHead(503);res.end('offline');return;}
    got.push(JSON.parse(Buffer.concat(parts).toString('utf8')));
    res.writeHead(200);res.end('{}');
  });
  const sink=await listen(upstream);t.after(()=>close(upstream));
  let time=NOW,pending=[];
  const gateway=createAnalyticsGateway({now:()=>time,fetcher:(_url,options)=>
    fetch(sink+'/batch/',options)});
  const env={DB:d1(db),POSTHOG_HOST:'https://eu.i.posthog.com',
    POSTHOG_PROJECT_TOKEN:'test_project_token_long',
    RATE_SALT:'test_salt_longer_than_twenty_four_characters'};
  const receiver=createServer(async(req,res)=>{
    const parts=[];for await(const part of req)parts.push(part);
    const response=await gateway.fetch(new Request('https://receiver.test'+req.url,{
      method:req.method,headers:req.headers,body:Buffer.concat(parts)}),env,{
      waitUntil(task){pending.push(task);}});
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  const url=await listen(receiver);t.after(()=>close(receiver));
  const deliver=async()=>{await Promise.allSettled(pending.splice(0));};
  const send=async event=>{
    const response=await fetch(url+'/v1/events',{method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({version:1,events:[event]})});
    assert.equal(response.status,202);
    return response.json();
  };
  const a=auto();assert.deepEqual((await send(a)).accepted,[a.eventId]);
  await deliver();
  assert.deepEqual((await send(a)).duplicates,[a.eventId]);
  await deliver();
  const stale=auto({version:1,total:999});
  assert.deepEqual((await send(stale)).duplicates,[stale.eventId]);
  await deliver();
  let rows=db.prepare('SELECT * FROM analytics_auto_latest').all();
  assert.equal(rows.length,1);
  assert.equal(rows[0].total,100);
  assert.equal(rows[0].version,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n,1);
  assert.equal(got.flatMap(row=>row.batch).length,1);
  assert.deepEqual([got[0].batch[0].properties.cumulative_total,
    got[0].batch[0].properties.snapshot_version],[100,1]);
  // D1 ACK can succeed while the PostHog HTTP sink is down.
  online=false;
  const newer=auto({version:2,total:101});
  assert.deepEqual((await send(newer)).accepted,[newer.eventId]);
  await deliver();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM analytics_events WHERE status='pending'").get().n,1);
  assert.deepEqual((await send(auto({version:3,total:5}))).duplicates.length,1,
    'newer version with lower total cannot erase prior count');
  assert.deepEqual((await send(auto({version:1,total:100}))).duplicates.length,1);
  await deliver();
  rows=db.prepare('SELECT * FROM analytics_auto_latest').all();
  assert.deepEqual([rows[0].total,rows[0].version],[101,2]);
  online=true;time+=31000;
  await gateway.scheduled(null,env,{waitUntil(task){pending.push(task);}});
  await deliver();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM analytics_events WHERE status='pending'").get().n,0);
  assert.equal(got.flatMap(row=>row.batch).length,2);
  // Independent UTC date creates a separate stable key, never the same day's 102.
  const next=auto({utcDate:'2026-10-24',version:1,total:1});
  assert.deepEqual((await send(next)).accepted,[next.eventId]);
  await deliver();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analytics_auto_latest').get().n,2);
  assert.equal(got.flatMap(row=>row.batch).length,3);
  assert(!JSON.stringify(got).includes('https://private.example/'));
});
