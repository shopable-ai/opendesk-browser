import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createLocalFixture} from '../dev/local-test/local-fixture-server.mjs';
import {runtime,ORIGIN,EXTENSION_ORIGIN,RECOVERY} from './helpers/controller-fixture.mjs';

async function setup(t,{dropAck=false}={}){
  const fixture=createLocalFixture({extensionOrigin:EXTENSION_ORIGIN});
  t.after(()=>new Promise((resolve,reject)=>fixture.server.close(error=>error?reject(error):resolve())));
  await new Promise((resolve,reject)=>{
    fixture.server.once('error',reject);
    fixture.server.listen(0,'127.0.0.1',resolve);
  });
  const origin=`http://127.0.0.1:${fixture.server.address().port}`;
  const trace=[],received=[];
  let inFlight=0;
  fixture.server.on('request',req=>received.push(`${req.method} ${new URL(req.url,origin).pathname}`));
  // Only the test SDK transport maps the fixed development origin to our own
  // listener. Response bodies and controller endpoint validation stay intact.
  const network=async args=>{
    const url=new URL(args.url);
    assert.equal(url.origin,ORIGIN);
    assert.equal(args.config.headers['X-OpenDesk-Local-Test'],'1');
    const row={method:args.method,path:url.pathname,operation:args.data?.operation,
      accountId:args.data?.accountId,key:args.data?.idempotencyKey,status:null};
    trace.push(row);inFlight++;
    try{
      return await new Promise((resolve,reject)=>{
        const body=args.data===undefined?undefined:JSON.stringify(args.data);
        const req=http.request(origin+url.pathname,{method:args.method,headers:{
          ...args.config.headers,Origin:EXTENSION_ORIGIN,
          ...(dropAck&&url.pathname==='/api/redeem'?{'X-Fixture-Drop-Ack':'1'}:{}),
          ...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})
        }},res=>{
          row.status=res.statusCode;
          let data='';res.setEncoding('utf8');
          res.on('error',reject);res.on('data',chunk=>data+=chunk);
          res.on('end',()=>{
            try{resolve({status:res.statusCode,data:JSON.parse(data)});}
            catch{reject(Error('fixture response is not JSON'));}
          });
        });
        req.setTimeout(2000,()=>req.destroy(Error('fixture HTTP timeout')));
        req.on('error',reject);req.end(body);
      });
    }finally{inFlight--;}
  };
  const open=()=>runtime({fixture,network,store});
  const store=new Map();
  const settle=async(e,predicate=()=>true)=>{
    for(let i=0;i<400;i++){
      await e.flush();
      if(inFlight===0&&!e.toolStates.at(-1)?.busy&&predicate())return;
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    assert.fail('controller HTTP operation did not settle');
  };
  const e=await open();await settle(e);
  await e.click('local-connect');await settle(e,()=>!e.get('redeem-code').disabled);
  const redeems=()=>trace.filter(row=>row.path==='/api/redeem');
  const statuses=()=>trace.filter(row=>row.path==='/api/status'&&!row.operation);
  t.after(()=>assert.deepEqual(received,trace.map(row=>`${row.method} ${row.path}`),
    'every SDK request reached the real HTTP listener'));
  return {e,fixture,store,trace,open,settle,redeems,statuses};
}

function member(e){
  assert.equal(e.get('remaining').textContent,'20');
  assert.equal(e.get('history-list').children.length,1);
  assert.equal(e.get('history-count').textContent,'1 条');
}
function noPrivilegedEffects(e){
  assert.equal(e.cookieCalls.length,0);
  assert.equal(e.proxyCalls.length,0);
  assert.equal(e.tabCalls.length,0);
}

test('HTTP member -> invalid input -> cancel preview -> explicit single consumption -> refresh and reopen',async t=>{
  const h=await setup(t),{e,fixture,trace,store}=h;
  assert.equal(trace.length,1);assert.equal(trace[0].path,'/api/member');
  assert.equal(trace[0].status,200);
  assert.equal(e.get('account-name').textContent,'l***@fixture.test');
  assert.equal(e.get('history-list').children.length,0);
  assert.equal(e.get('redeem').disabled,true);
  for(const value of ['', '   ', '!', 'short']){
    await e.preview(value);await h.settle(e);
    assert.equal(trace.length,1,'empty or malformed code never reaches HTTP');
  }
  await e.preview('INVALID-CODE');await h.settle(e);
  assert.equal(trace.at(-1).path,'/api/preview');assert.equal(trace.at(-1).status,422);
  assert.equal(e.get('redeem-error').hidden,false);
  assert.equal(fixture.ledger.size,0);assert.equal(h.redeems().length,0);

  // Enter exercises the actual controller input handler, rather than calling
  // private activation functions or fabricating a successful preview response.
  e.get('redeem-code').value='DEMO-VIP-01';e.get('redeem-code').listeners.input();
  e.get('redeem-code').listeners.keydown({key:'Enter',isTrusted:true,preventDefault(){}});
  await h.settle(e,()=>!e.get('redeem-preview').hidden);
  assert.equal(trace.filter(row=>row.path==='/api/preview').length,2);
  assert.match(e.get('preview-account').textContent,/l\*\*\*@fixture\.test/);
  assert.equal(fixture.ledger.size,0);assert.equal(h.redeems().length,0);
  await e.click('redeem-cancel');await h.settle(e);
  assert.equal(e.get('redeem-preview').hidden,true);
  await e.click('redeem-confirm');await h.settle(e);
  assert.equal(fixture.ledger.size,0);assert.equal(h.redeems().length,0);
  assert.equal(store.get(RECOVERY)??null,null);

  await e.preview();await h.settle(e,()=>!e.get('redeem-preview').hidden);
  await e.click('redeem-confirm',false);await h.settle(e);
  assert.equal(h.redeems().length,0,'untrusted confirmation does not submit');
  await e.click('redeem-confirm');await e.click('redeem-confirm');
  await h.settle(e,()=>e.get('history-list').children.length===1);
  assert.equal(h.redeems().length,1);assert.equal(fixture.ledger.size,1);
  assert.equal(h.redeems()[0].status,200);
  assert.equal([...fixture.ledger.values()][0].receipt.status,'redeemed');
  assert.equal(store.get(RECOVERY),null);member(e);noPrivilegedEffects(e);
  await e.click('refresh');await h.settle(e);member(e);
  const before=trace.length,reopened=await h.open();
  await h.settle(reopened,()=>reopened.get('history-list').children.length===1);
  member(reopened);noPrivilegedEffects(reopened);
  assert.deepEqual(trace.slice(before).map(row=>[row.method,row.path]),[['GET','/api/member']]);
  assert.equal(h.redeems().length,1);assert.equal(fixture.ledger.size,1);
});

test('HTTP lost receipt persists across reopen and only explicit original-transaction status resolves it',async t=>{
  const h=await setup(t,{dropAck:true}),{e,fixture,store,trace}=h;
  await e.preview();await h.settle(e,()=>!e.get('redeem-preview').hidden);
  await e.click('redeem-confirm');
  await h.settle(e,()=>!e.get('recovery').hidden&&!e.get('recovery-check').disabled);
  assert.equal(h.redeems().length,1);assert.equal(h.redeems()[0].status,504);
  assert.equal(fixture.ledger.size,1);
  assert.equal([...fixture.ledger.values()][0].receipt.status,'redeemed');
  const saved=structuredClone(store.get(RECOVERY));
  assert.ok(saved);assert.equal(saved.idempotencyKey===h.redeems()[0].key,true);
  assert.equal(saved.accountId===h.redeems()[0].accountId,true);
  assert.equal(e.get('redeem').disabled,true);assert.equal(h.statuses().length,0);
  await e.preview('DEMO-VIP-02');await e.click('redeem-confirm');await e.click('refresh');
  await h.settle(e);assert.equal(h.redeems().length,1);
  assert.equal(h.statuses().length,0);assert.deepEqual(store.get(RECOVERY),saved);
  const before=trace.length,reopened=await h.open();
  await h.settle(reopened,()=>!reopened.get('recovery-check').disabled);
  assert.deepEqual(trace.slice(before).map(row=>[row.method,row.path]),[['GET','/api/member']]);
  assert.deepEqual(store.get(RECOVERY),saved);assert.equal(reopened.get('redeem').disabled,true);
  member(reopened);noPrivilegedEffects(reopened);
  await reopened.click('recovery-check',false);await h.settle(reopened);
  assert.equal(h.statuses().length,0);
  await reopened.click('recovery-check');await reopened.click('recovery-check');
  await h.settle(reopened,()=>store.get(RECOVERY)===null);
  assert.equal(h.statuses().length,1);
  assert.equal(h.statuses()[0].key===saved.idempotencyKey,true);
  assert.equal(h.statuses()[0].accountId===saved.accountId,true);
  assert.equal(h.statuses()[0].status,200);
  assert.equal(h.redeems().length,1);assert.equal(fixture.ledger.size,1);
  assert.equal(reopened.get('recovery').hidden,true);member(reopened);noPrivilegedEffects(reopened);
});
