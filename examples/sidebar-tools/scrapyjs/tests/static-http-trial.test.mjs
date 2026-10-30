import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {
  legacyStaticFields,extractStaticHtml,extractStaticJson,
  createStaticHttpTrialRunner,assessCurrentBrowserNetwork
} from '../adapters/static-http-trial.mjs';
import {CONTRACT_VERSION,hashRecipe} from '../contracts/execution-v1.mjs';

const ORIGIN='https://example.com';
const LIMITS={maxPages:3,maxRequests:3,maxResponseBytes:16384,
  maxTotalBytes:49152,deadlineMs:8000,maxRedirects:0};
const parse=body=>parseHTML(body).document;
const clone=structuredClone;
async function trial(){
  const recipe={schemaVersion:CONTRACT_VERSION,recipeId:'recipe:static-trial',
    version:'1.0.0',sha256:'0'.repeat(64),description:'Reviewed static trial',
    target:{url:ORIGIN+'/one',origins:[ORIGIN],session:'none'},
    extraction:{kind:'static-html',fields:[
      {name:'title',selector:'h2',read:'text'},
      {name:'link',selector:'a',read:'attribute',attribute:'href'}]},
    limits:clone(LIMITS)};
  recipe.sha256=await hashRecipe(recipe,webcrypto.subtle);
  const headers={schemaVersion:CONTRACT_VERSION,profileId:'headers:static',
    version:'1.0.0',entries:[{name:'accept',value:'text/html'}],
    userAgent:{mode:'inherit'}};
  const network={schemaVersion:CONTRACT_VERSION,profileId:'network:direct',
    version:'1.0.0',mode:'direct'};
  const node={schemaVersion:CONTRACT_VERSION,nodeId:'node:fixture-only',
    kind:'desktop-http',availability:'verified',evidenceRef:'mock-host:not-production',
    approvedOrigins:[ORIGIN],supportedExtraction:['static-html'],
    supportedNetworks:['direct'],verifiedHeaderNames:['accept'],
    javascriptRendering:false,canOverrideUserAgent:false,canUseCredentialRefs:false,
    canUseCurrentTabSession:false,enforcesDnsGuard:true,inspectsRedirects:true,
    stopReadback:true,resultReadback:true,cellularBindingVerified:false,
    egressVerification:false,maxLimits:clone(LIMITS)};
  const plan={schemaVersion:CONTRACT_VERSION,planId:'plan:static-trial',
    recipeId:recipe.recipeId,recipeVersion:recipe.version,recipeHash:recipe.sha256,
    phase:'trial',executionKind:'desktop-http',nodeId:node.nodeId,
    headerProfileId:headers.profileId,headerProfileVersion:headers.version,
    networkProfileId:network.profileId,networkProfileVersion:network.version,
    limits:clone(LIMITS),approval:{approvalRef:'fixture:test-only',
      approvedOrigin:ORIGIN,executionKind:'desktop-http',
      networkMode:'direct',headerProfileId:headers.profileId,
      permissions:['read']}};
  return {recipe,headers,network,node,plan};
}
const reject=(promise,code)=>assert.rejects(promise,error=>error?.code===code);

test('existing CSS subset converts accurately, nested rules fail closed',()=>{
  assert.deepEqual(legacyStaticFields({
    _listContainer:'.items',_listItem:'article',title:'h2::text',link:'a::href'
  }),[{name:'title',selector:'h2',read:'text'},
    {name:'link',selector:'a',read:'attribute',attribute:'href'}]);
  assert.throws(()=>legacyStaticFields({title:{nested:'h2'}}),{code:'E_STATIC_FIELD_UNSUPPORTED'});
});
test('inert HTML yields real scoped field records and no outside matches',()=>{
  const html='<section class="items"><article><h2>甲 &amp; 乙</h2>'+
    '<a href="/one">一</a></article><article><h2>二</h2>'+
    '<a href="/two">二</a></article></section><h2>outside</h2>';
  const rows=extractStaticHtml(html,{
    fields:legacyStaticFields({title:'h2::text',link:'a::href'}),
    listContainer:'.items',listItem:'article'},parse);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)),[
    {title:'甲 & 乙',link:'/one'},{title:'二',link:'/two'}]);
});
test('JSON mapping reads real values, omits absence, rejects proto paths',()=>{
  const rows=extractStaticJson('{"items":[{"title":"甲","n":2},{"title":"乙"}]}',
    {name:'title',number:'n'},{rootPath:'items'});
  assert.deepEqual(JSON.parse(JSON.stringify(rows)),[
    {name:'甲',number:2},{name:'乙'}]);
  assert.throws(()=>extractStaticJson('{"x":1}',{x:'__proto__.polluted'}),{code:'E_JSON_MAPPING'});
  assert.throws(()=>extractStaticJson('{bad',{x:'title'}),{code:'E_JSON_PARSE'});
});
test('no trusted host means no dispatch; Browser cannot attest production capability',async()=>{
  const b=await trial();
  await reject(createStaticHttpTrialRunner(null,{parseHtml:parse,subtle:webcrypto.subtle})
    .run(b,[b.recipe.target.url]),'E_TRUSTED_HOST_REQUIRED');
  assert.equal(assessCurrentBrowserNetwork().availableForV1Production,false);
});
test('out-of-origin, >3 pages, forbidden header and Recipe tamper fail before I/O',async()=>{
  const b=await trial();let admitted=0;
  const host={admit:async()=>{admitted++;return {};},
    get:async()=>{throw Error('unexpected GET');},
    persistAndReadback:async()=>{throw Error('unexpected storage');}};
  const runner=createStaticHttpTrialRunner(host,{parseHtml:parse,subtle:webcrypto.subtle});
  await reject(runner.run(b,[b.recipe.target.url,'https://different.example/2']),'E_TARGET');
  await reject(runner.run(b,[b.recipe.target.url,ORIGIN+'/2',ORIGIN+'/3',ORIGIN+'/4']),'E_URL_LIST');
  b.headers.entries=[{name:'cookie',value:'secret'}];
  await reject(runner.run(b,[b.recipe.target.url]),'E_HEADER');
  b.headers.entries=[{name:'accept',value:'text/html'}];
  b.recipe.extraction.fields[0].selector='script';
  await reject(runner.run(b,[b.recipe.target.url]),'E_RECIPE_HASH');
  assert.equal(admitted,0);
});
function testHost(b,{mismatchReadback=false,redirects=0}={}){
  let hits=0;
  const host={
    admit:async({bundle,urls})=>{
      assert.equal(bundle.plan.recipeHash,b.recipe.sha256);
      assert.ok(urls.every(x=>x.startsWith(ORIGIN)));
      return Object.freeze({id:'mock-only'});
    },
    get:async({admission,url,headers,signal})=>{
      assert.equal(admission.id,'mock-only');
      assert.equal(signal.aborted,false);
      assert.deepEqual(JSON.parse(JSON.stringify(headers)),{accept:'text/html'});
      const body='<article><h2>real '+(++hits)+'</h2><a href="/'+hits+'">view</a></article>';
      return {status:200,finalUrl:url,redirectCount:redirects,mediaType:'text/html',body};
    },
    persistAndReadback:async({plan,records,resultSha256,counters})=>({
      readbackRecords:mismatchReadback?[{title:'tampered'}]:records,
      receipt:{
        schemaVersion:CONTRACT_VERSION,runId:'run:fixture-only',idempotencyKey:'idempotency:test',
        planId:plan.planId,recipeHash:plan.recipeHash,nodeId:plan.nodeId,
        executionKind:plan.executionKind,status:'completed',errorCode:null,
        startedAt:'2026-10-30T01:00:00.000Z',endedAt:'2026-10-30T01:00:01.000Z',
        retirementState:'released',stopState:'none',counters,
        network:{expected:'direct',observed:'direct',egressVerified:false,evidenceRef:null},
        result:{sha256:resultSha256,readbackVerified:true,evidenceRef:'fixture:readback'}
      }
    })
  };
  return {host,hits:()=>hits};
}
test('two page HTML extraction + sha256 + full v1 RunReceipt and storage readback',async()=>{
  const b=await trial(),{host,hits}=testHost(b);
  const output=await createStaticHttpTrialRunner(host,{parseHtml:parse,subtle:webcrypto.subtle})
    .run(b,[b.recipe.target.url,ORIGIN+'/two']);
  assert.equal(output.status,'completed');
  assert.equal(hits(),2);
  assert.deepEqual(output.records.map(x=>x.title),['real 1','real 2']);
  assert.equal(output.headerEvidence.wireObserved,null);
  assert.match(output.resultSha256,/^[0-9a-f]{64}$/);
});
test('v1 refuses unsigned list selectors that are missing from Recipe SHA',async()=>{
  const b=await trial();let admitted=false;
  const host={admit:async()=>{admitted=true;return {};},
    get:async()=>{throw Error('unexpected');},
    persistAndReadback:async()=>{throw Error('unexpected');}};
  await reject(createStaticHttpTrialRunner(host,{parseHtml:parse,subtle:webcrypto.subtle})
    .run(b,[b.recipe.target.url],{listContainer:'.items',listItem:'article'}),'E_UNSIGNED_SELECTOR');
  assert.equal(admitted,false);
});
test('parallel start is refused while original run is awaiting admission',async()=>{
  const b=await trial();let unblock;
  const gate=new Promise(resolve=>{unblock=resolve;});
  const runner=createStaticHttpTrialRunner({
    admit:async()=>{await gate;return {};},
    get:async({url})=>({status:200,finalUrl:url,redirectCount:1,mediaType:'text/html',body:'<h2>no</h2>'}),
    persistAndReadback:async()=>{throw Error('unexpected');}
  },{parseHtml:parse,subtle:webcrypto.subtle});
  const first=runner.run(b,[b.recipe.target.url]);
  await reject(runner.run(b,[b.recipe.target.url]),'E_RUN_BUSY');
  assert.equal(runner.stop().requested,true);
  unblock();
  await reject(first,'E_CANCELLED');
});
test('hash mismatch rejects claimed readback even if receipt says verified',async()=>{
  const b=await trial();
  await reject(createStaticHttpTrialRunner(testHost(b,{mismatchReadback:true}).host,
    {parseHtml:parse,subtle:webcrypto.subtle}).run(b,[b.recipe.target.url]),'E_RESULT_HASH_MISMATCH');
});
test('first redirect is denied, no second request',async()=>{
  const b=await trial(),{host,hits}=testHost(b,{redirects:1});
  await reject(createStaticHttpTrialRunner(host,{parseHtml:parse,subtle:webcrypto.subtle})
    .run(b,[b.recipe.target.url,ORIGIN+'/two']),'E_HTTP_RESPONSE');
  assert.equal(hits(),1);
});
test('Stop aborts active trial without claiming remote retirement',async()=>{
  const b=await trial();
  const runner=createStaticHttpTrialRunner({
    admit:async()=>({}),
    get:async({signal})=>new Promise((_resolve,reject)=>
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),
    persistAndReadback:async()=>{throw Error('unexpected');}
  },{parseHtml:parse,subtle:webcrypto.subtle});
  const pending=runner.run(b,[b.recipe.target.url]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(runner.stop(),{requested:true,retired:false});
  await reject(pending,'E_CANCELLED');
});
