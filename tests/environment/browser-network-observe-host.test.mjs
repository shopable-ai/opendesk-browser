import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserNetworkObserver} from '../../src/platform/chrome/browser-network-observe.js';

const identity=(id='observer-a')=>({toolId:id,packageHash:'a'.repeat(64),installEpoch:'epoch-1'});
const target={tabId:41,windowId:9,documentId:'document-41',url:'https://example.org/a',incognito:false};
const args={tabRef:'x'.repeat(32),origins:['https://example.org'],
 durationMs:10000,maxEvents:2,maxBufferedBytes:1024};
const code=expected=>error=>error?.code===expected;
function fixture(){
 let now=1000;
 const calls={requests:[],completed:[],failed:[],downloads:[]},stored={};
 const event=key=>({addListener:(fn,filter)=>{assert.deepEqual(filter,{urls:['http://*/*','https://*/*']});calls[key].push(fn)}});
 const api={
  webRequest:{onBeforeRequest:event('requests'),onCompleted:event('completed'),onErrorOccurred:event('failed')},
  storage:{session:{get:async key=>({[key]:stored[key]}),set:async data=>Object.assign(stored,data)}},
  downloads:{download:async options=>{calls.downloads.push(options);return 91}}
 };
 return {api,calls,stored,host:()=>createBrowserNetworkObserver({api,clock:{now:()=>now}}),
  // A real MV3 restart drops all listener registrations from the old Worker.
  // Recreate the listener set before booting the new Observer instance.
  restart:()=>{calls.requests.length=0;calls.completed.length=0;calls.failed.length=0;},
  tick:ms=>now+=ms,
  emit:(name,extra={})=>{for(const fn of calls[name])fn({
   tabId:41,url:'https://example.org/private?token=SECRET',method:'GET',
   type:'xmlhttprequest',timeStamp:now,...extra})}
 };
}
test('native webRequest listeners collect only same-tab same-Origin bounded metadata',async()=>{
 const f=fixture(),host=f.host();
 const start=await host.start(args,identity(),target);
 assert.equal(typeof start.observationId,'string');
 f.emit('requests',{requestHeaders:{cookie:'SECRET'},requestBody:{formData:{password:['SECRET']}}});
 f.emit('completed',{statusCode:200,responseHeaders:{'set-cookie':'SECRET'}});
 f.emit('failed',{error:'net::ERR_ABORTED'});
 f.emit('requests',{url:'https://another.org/secret'});
 f.emit('requests',{tabId:42});
 await host.flush();
 const page=await host.read({sessionRef:start.observationId,limit:100},identity());
 assert.equal(page.events.length,2);
 assert.equal(page.droppedCount,1);
 assert.equal(page.events[0].kind,'completed');
 assert.equal(page.events[1].error,'net::ERR_ABORTED');
 assert(!JSON.stringify(page).includes('SECRET'));
 assert.deepEqual(await host.getStatus({observationId:start.observationId},identity()),
  {state:'running',observedCount:3,droppedCount:1,gapCount:0,expiresAt:11000});
 f.tick(11000);
 assert.equal((await host.getStatus({observationId:start.observationId},identity())).state,'stopped');
});
test('origin, owner and session boundaries reject cross-tool access',async()=>{
 const f=fixture(),host=f.host();
 await assert.rejects(host.start({...args,origins:['https://different.org']},identity(),target),
  code('E_SITE_GRANT_REQUIRED'));
 const {observationId}=await host.start(args,identity(),target);
 await assert.rejects(host.read({sessionRef:observationId},identity('other-tool')),code('E_OWNER'));
 await assert.rejects(host.stop({observationId:'INVALID'},identity()),code('E_SCHEMA'));
 await assert.rejects(host.start(args,identity(),target),code('E_LIMIT'));
 assert.equal((await host.close({sessionRef:observationId},identity())).closed,true);
 await assert.rejects(host.getStatus({observationId},identity()),code('E_OBSERVATION_UNKNOWN'));
});
test('Worker restart leaves a truthful observation gap, without silently resuming',async()=>{
 const f=fixture(),first=f.host();
 const {observationId}=await first.start(args,identity(),target);
 f.emit('requests');await first.flush();
 f.restart();
 const restarted=f.host();
 const status=await restarted.getStatus({observationId},identity());
 assert.equal(status.state,'interrupted');
 assert.equal(status.gapCount,1);
 f.emit('requests');await restarted.flush();
 assert.equal((await restarted.read({sessionRef:observationId},identity())).events.length,1);
});
test('revoke purges buffered data and navigation stops an active session',async()=>{
 const f=fixture(),host=f.host();
 const {observationId}=await host.start(args,identity(),target);
 f.emit('requests');host.invalidateTab(41);
 assert.equal((await host.getStatus({observationId},identity())).state,'interrupted');
 host.revokeAll();await host.flush();
 assert.equal((await host.read({sessionRef:observationId},identity())).events.length,0);
});
test('explicit JSON export uses a bounded real Chrome download, never returns raw data',async()=>{
 const f=fixture(),host=f.host();
 const {observationId}=await host.start(args,identity(),target);
 f.emit('completed',{statusCode:204});await host.stop({observationId},identity());
 const result=await host.exportJson({observationId},identity());
 assert.equal(result.downloadId,91);
 assert(result.bytes>0&&result.bytes<=524288);
 assert.equal(result.truncated,false);
 assert.equal(f.calls.downloads.length,1);
 const options=f.calls.downloads[0];
 assert.match(options.filename,/^opendesk-network-observation-\d+\.json$/);
 assert.equal(options.saveAs,true);
 const file=JSON.parse(Buffer.from(options.url.split(',')[1],'base64').toString('utf8'));
 assert.equal(file.events[0].statusCode,204);
 await host.close({sessionRef:observationId},identity());
 await assert.rejects(host.exportJson({observationId},identity()),code('E_OBSERVATION_UNKNOWN'));
});
