import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {localExpirationText,parseLocalExpiration,compareCookieExpiration} from
  '../../examples/sidebar-tools/cookie-editor/app/domain/cookie-expiration.js';
import {normalizeCookie,nativeInput} from
  '../../examples/sidebar-tools/cookie-editor/app/domain/cookie-model.js';
import {createMockSdk} from
  '../../examples/sidebar-tools/cookie-editor/preview/react/src/mock-sdk.js';
import {createCookieSdkAdapter} from
  '../../examples/sidebar-tools/cookie-editor/app/adapters/browser-sdk.js';
import {createCookieController} from
  '../../examples/sidebar-tools/cookie-editor/app/controller/cookie-controller.js';

const root='examples/sidebar-tools/cookie-editor/';
const sample={name:'demo',value:'fictional',domain:'shop.example.com',
  path:'/',hostOnly:true,secure:true,httpOnly:false,sameSite:'lax'};

function inZone(zone,input){
  const script=`import {parseLocalExpiration,localExpirationText} from
    './examples/sidebar-tools/cookie-editor/app/domain/cookie-expiration.js';
  const result=parseLocalExpiration(process.argv[2]);
  console.log(JSON.stringify({...result,text:result.seconds===undefined?null:
    localExpirationText(result.seconds)}));`;
  return JSON.parse(execFileSync(process.execPath,
    ['--input-type=module','-e',script,zone,input],{
      encoding:'utf8',env:{...process.env,TZ:zone}
    }));
}

test('local clock conversion uses Unix seconds and rejects invalid dates',()=>{
  assert.equal(parseLocalExpiration('2026-02-30T12:00').status,'invalid');
  assert.equal(parseLocalExpiration('2028-02-29T12:00:60').status,'invalid');
  assert.equal(parseLocalExpiration('garbage').status,'invalid');
  assert.equal(parseLocalExpiration('').status,'invalid');
  assert.equal(localExpirationText(NaN),'');
  assert.equal(localExpirationText(Infinity),'');
  const shanghai=inZone('Asia/Shanghai','2027-01-02T12:34:56');
  assert.equal(shanghai.status,'valid');
  assert.equal(shanghai.seconds,Math.floor(shanghai.seconds));
  assert.equal(shanghai.text,'2027-01-02T12:34:56');
  assert.equal(new Date(shanghai.seconds*1000).toISOString(),'2027-01-02T04:34:56.000Z');
  const minute=inZone('Asia/Shanghai','2027-01-02T12:34');
  assert.equal(minute.status,'valid');
  assert.equal(minute.text,'2027-01-02T12:34:00');
});

test('DST spring gaps and fall overlaps fail explicitly, including 30-minute transition',()=>{
  assert.equal(inZone('America/Los_Angeles','2026-03-08T02:30').status,'nonexistent');
  assert.equal(inZone('America/Los_Angeles','2026-11-01T01:30').status,'ambiguous');
  assert.equal(inZone('America/New_York','2026-11-01T01:30').status,'ambiguous');
  assert.equal(inZone('Australia/Lord_Howe','2026-04-05T01:45').status,'ambiguous');
  assert.equal(inZone('Australia/Lord_Howe','2026-10-04T02:15').status,'nonexistent');
  assert.equal(inZone('America/Los_Angeles','2026-10-31T12:30').status,'valid');
});

test('persistent cookies roundtrip absolute seconds; sessions never acquire expiry',()=>{
  const expirationDate=1839061800.125;
  const persistent=normalizeCookie({...sample,session:false,expirationDate},'shop.example.com');
  assert.equal(persistent.expirationDate,expirationDate);
  assert.equal(nativeInput(persistent,{origin:'https://shop.example.com',hostname:'shop.example.com'}).expirationDate,expirationDate);
  const session=normalizeCookie({...sample,session:true,expirationDate},'shop.example.com');
  assert.equal('expirationDate' in session,false);
  assert.equal('expirationDate' in nativeInput(session,{origin:'https://shop.example.com',hostname:'shop.example.com'}),false);
  assert.throws(()=>normalizeCookie({...sample,session:false},'shop.example.com'),/过期/);
  assert.throws(()=>normalizeCookie({...sample,session:false,expirationDate:1},'shop.example.com'),/过期/);
});

test('expiration sorting treats session as no deadline rather than epoch zero',()=>{
  const rows=[
    {name:'session_b',session:true},
    {name:'future',session:false,expirationDate:1839061800},
    {name:'early',session:false,expirationDate:1835865000},
    {name:'session_a',session:true}
  ].sort(compareCookieExpiration);
  assert.deepEqual(rows.map(row=>row.name),
    ['early','future','session_a','session_b']);
});

test('actual React form preserves untouched fractional expiry and reports local time semantics',()=>{
  const inline=readFileSync(root+'app/components/CookieInlineEditor.jsx','utf8');
  const fields=readFileSync(root+'app/components/CookieEditorView.jsx','utf8');
  const app=readFileSync(root+'app/CookieEditorApp.jsx','utf8');
  assert.match(inline,/unchangedExpiry/);
  assert.match(inline,/row\.expirationDate:parsed\.seconds/);
  assert.match(inline,/parseLocalExpiration/);
  assert.match(fields,/过期时间（Expiration）/);
  assert.match(fields,/夏令时重复或不存在/);
  assert.match(fields,/compareCookieExpiration\(a,b\)/);
  assert.match(app,/\['cookie','Cookie'\],\['accounts','账号'\],\['market','市场'\]/);
  assert.doesNotMatch(app,/\['cookie','Cookie\s+\d+/);
});

test('preview transport passes an exact persistent timestamp through Controller and readback',async()=>{
  const mock=createMockSdk();
  const adapter=createCookieSdkAdapter({getBrowser:()=>mock.browser,request:mock.request});
  const controller=createCookieController({adapter,onChange:()=>{}});
  try{
    await controller.load();
    const original=controller.snapshot().rows.find(row=>row.name==='theme');
    assert.ok(original);
    const exact=1839061800.125;
    assert.equal(await controller.save({...original,value:'fictional-updated',
      expirationDate:exact,valueRedacted:false},{originalId:original.id,valueEdited:true}),true);
    const saved=mock.inspect().rows.find(row=>row.name==='theme');
    assert.equal(saved.expirationDate,exact);
    assert.equal(saved.session,false);
    assert.equal(controller.snapshot().rows.find(row=>row.name==='theme').expirationDate,exact);
    assert.equal(await controller.save({...saved,session:true,valueRedacted:false},{
      originalId:controller.snapshot().rows.find(row=>row.name==='theme').id,valueEdited:true}),true);
    const session=mock.inspect().rows.find(row=>row.name==='theme');
    assert.equal(session.session,true);
    assert.equal('expirationDate' in session,false);
  }finally{controller.dispose();mock.dispose();}
});
