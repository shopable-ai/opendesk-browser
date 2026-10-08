import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parse} from 'acorn';
import {cookieDetailsFromProperties, discoverCookieFaultPoints, discoverCookieLastErrorPoint, selectCookieCallbackFrame, selectCookieFaultBreakpoint, validateCookieFaultJournal} from './k5-controller-cookie-fault.mjs';

// Verifier-only component fixtures. These tests do not observe a browser,
// create native receipts, or establish a native/formal PASS.
const methods=['set','remove'];
test('shared Chrome rejection is accepted only with the unique selected Cookie callback in its stack',()=>{
  const source='0123456789',callback={location:{scriptId:'sw',lineNumber:0,columnNumber:5}},other={location:{scriptId:'sw',lineNumber:0,columnNumber:1}};
  assert.equal(selectCookieCallbackFrame([other],'sw',[4,7],source),null);
  assert.equal(selectCookieCallbackFrame([callback],'different-sw',[4,7],source),null);
  assert.equal(selectCookieCallbackFrame([other,callback],'sw',[4,7],source),callback);
  assert.throws(()=>selectCookieCallbackFrame([callback,callback],'sw',[4,7],source),/unique/);
});
test('cookie observation reads data descriptors and the exact store binding without object spread',()=>{
  const source='chrome.cookies.set({...details, storeId:store},cookie=>{if(chrome.runtime.lastError)return;});';
  const selector=discoverCookieFaultPoints(source,'set');
  assert.equal(selector.detailsExpression,'details');assert.equal(selector.storeIdExpression,'store');
  assert.deepEqual(cookieDetailsFromProperties([
    {name:'name',enumerable:true,value:{type:'string',value:'sid'}},
    {name:'secure',enumerable:true,value:{type:'boolean',value:false}},
    {name:'ignored',enumerable:false,get:{objectId:'getter'}}
  ],'0'),{name:'sid',secure:false,storeId:'0'});
});
for(const property of [
  {name:'name',enumerable:true,get:{objectId:'getter'}},
  {name:'name',enumerable:true,value:{type:'object',objectId:'unknown'}},
  {name:'name',enumerable:true,value:{type:'number',unserializableValue:'NaN'}}
])test('cookie observation refuses accessors or opaque values '+JSON.stringify(property),()=>{
  assert.throws(()=>cookieDetailsFromProperties([property],'0'),e=>e.code==='E_NATIVE_NOT_OBSERVED');
});
const hash=source=>createHash('sha256').update(source).digest('hex');
for(const mode of ['production','development'])test(`native lastError observer reads product local error on ${mode} unchanged bundle`,async()=>{
  const source=await readFile(new URL(`../../dist/${mode}/sw.js`,import.meta.url),'utf8'),selector=discoverCookieLastErrorPoint(source);
  assert(source.slice(...selector.nativeThrow.range).includes('E_CHROME'));
  assert.match(selector.expression,/^[a-zA-Z_$][\w$]*$/);
  assert(!selector.expression.includes('runtime'));
});
test('native lastError observer rejects absent or ambiguous product error locals',()=>{
  assert.throws(()=>discoverCookieLastErrorPoint('const value=1;'),e=>e.code==='E_NATIVE_NOT_OBSERVED');
  const source='function f(api,reject){try{(function(){const e=api.runtime.lastError;if(e)throw fail("E_CHROME",e.message)})()}catch(copied){reject(copied)}}';
  assert.equal(discoverCookieLastErrorPoint(source).expression,'copied');
  assert.throws(()=>discoverCookieLastErrorPoint(source+source.replace('function f','function g')),e=>e.code==='E_NATIVE_NOT_OBSERVED');
});
const missingObservation=error=>error.code==='E_NATIVE_NOT_OBSERVED';
const faultSource=method=>`chrome.cookies.${method}({...details, storeId}, cookie => {
  if (chrome.runtime.lastError) return;
  settle(cookie);
});`;

function locationAt(source,offset,scriptId='component-only-sw') {
  const prefix=source.slice(0,offset),lines=prefix.split('\n');
  return {scriptId,lineNumber:lines.length-1,columnNumber:lines.at(-1).length};
}

for(const mode of ['production','development']) {
  for(const method of methods) {
    test(`AST discovery binds unchanged ${mode} dist/sw.js cookies.${method}`,async()=>{
      const file=new URL(`../../dist/${mode}/sw.js`,import.meta.url);
      const bytes=await readFile(file),source=bytes.toString('utf8');
      const selected=discoverCookieFaultPoints(source,method);
      assert.equal(selected.sourceHash,hash(bytes));
      assert.equal(selected.method,method);
      const submission=source.slice(...selected.submission.range);
      const callback=source.slice(...selected.callback.range);
      const call=parse(submission,{ecmaVersion:'latest'}).body[0].expression;
      assert.equal(call.type,'CallExpression');
      assert.equal(call.callee.property.name,method);
      assert.equal(call.callee.object.property.name,'cookies');
      assert.equal(call.arguments[0].type,'ObjectExpression');
      assert(call.arguments[0].properties.some(p=>p.key?.name==='storeId'));
      assert(['ArrowFunctionExpression','FunctionExpression'].includes(call.arguments[1].type));
      assert.equal(selected.submissionExpression,submission.slice(call.arguments[0].start,call.arguments[0].end));
      assert.equal(selected.callbackValueExpression,call.arguments[1].params[0].name);
      const error=parse(callback,{ecmaVersion:'latest'}).body[0].expression;
      assert.equal(error.type,'MemberExpression');
      assert.equal(error.property.name,'lastError');
      assert.equal(error.object.property.name,'runtime');
      assert.equal(selected.errorExpression,callback);
      assert(selected.callback.range[0]>=selected.submission.range[0]+call.arguments[1].start);
      assert(selected.callback.range[1]<=selected.submission.range[0]+call.arguments[1].end);
      for(const point of [selected.submission,selected.callback]) {
        const {scriptId,...start}=locationAt(source,point.range[0]);
        const {scriptId:unused,...end}=locationAt(source,point.range[1]);
        assert.deepEqual(point.location,start);
        assert.deepEqual(point.endLocation,end);
        assert(point.range[1]>point.range[0]);
      }
      assert.deepEqual(await readFile(file),bytes,'Discovery must leave dist bytes unchanged');
    });
  }
}

for(const method of methods) {
  test(`AST discovery ignores text and nested callback decoys for cookies.${method}`,()=>{
    const source=`// ${faultSource(method).replaceAll('\n',' ')}
      const text=${JSON.stringify(faultSource(method))};
      chrome.cookies.getAll({storeId}, cookie => chrome.runtime.lastError);
      chrome.cookies.${method}({...details, storeId}, cookie => {
        const unrelated=() => chrome.runtime.lastError;
        if (chrome.runtime.lastError) return;
        settle(cookie);
      });`;
    const selected=discoverCookieFaultPoints(source,method);
    assert.equal(selected.sourceHash,hash(source));
    assert.equal(selected.errorExpression,'chrome.runtime.lastError');
    assert.equal(selected.callbackValueExpression,'cookie');
    assert.equal(selected.callback.range[0],source.lastIndexOf('chrome.runtime.lastError'));
  });

  const absent=[
    ['no native call','const message="cookies lastError";'],
    ['different method',faultSource(method==='set'?'remove':'set')],
    ['no scoped store',faultSource(method).replace('{...details, storeId}','{...details}')],
    ['nonliteral details',faultSource(method).replace('{...details, storeId}','details')],
    ['external callback',`chrome.cookies.${method}({...details, storeId}, externalCallback);`],
    ['missing lastError',faultSource(method).replace('chrome.runtime.lastError','cookie')],
    ['nested-only lastError',`chrome.cookies.${method}({...details, storeId}, cookie => {
      const nested=() => chrome.runtime.lastError;
      settle(cookie);
    });`],
  ];
  for(const [name,source] of absent) {
    test(`AST discovery rejects ${name} for cookies.${method}`,()=>{
      assert.throws(()=>discoverCookieFaultPoints(source,method),missingObservation);
    });
  }
  test(`AST discovery rejects ambiguous native calls for cookies.${method}`,()=>{
    assert.throws(()=>discoverCookieFaultPoints(`${faultSource(method)}\n${faultSource(method)}`,method),missingObservation);
  });
  test(`AST discovery rejects ambiguous direct lastError reads for cookies.${method}`,()=>{
    const source=faultSource(method).replace('settle(cookie);','settle(chrome.runtime.lastError, cookie);');
    assert.throws(()=>discoverCookieFaultPoints(source,method),missingObservation);
  });
  test(`AST discovery rejects a non-runtime lastError for cookies.${method}`,()=>{
    assert.throws(()=>discoverCookieFaultPoints(faultSource(method).replace('chrome.runtime.lastError','cookie.lastError'),method));
  });

  for(const kind of ['submission','callback']) {
    const source=`// Component-only breakpoint fixture\n${faultSource(method)}`;
    const point=discoverCookieFaultPoints(source,method)[kind];
    const scriptId='component-only-sw',exact=locationAt(source,point.range[0],scriptId);
    const inside=locationAt(source,point.range[0]+1,scriptId);
    test(`breakpoint binds the exact ${method} ${kind} AST location`,()=>{
      assert.deepEqual(selectCookieFaultBreakpoint([{...exact,type:'call'},
        {...exact,scriptId:'other-script'},locationAt(source,point.range[1],scriptId)],scriptId,point,source),exact);
    });
    test(`breakpoint accepts one fallback inside the ${method} ${kind} AST range`,()=>{
      assert.deepEqual(selectCookieFaultBreakpoint([inside,{...inside,scriptId:'other-script'}],scriptId,point,source),inside);
    });
    test(`breakpoint rejects absent or outside ${method} ${kind} candidates`,()=>{
      for(const locations of [[],[{...exact,scriptId:'other-script'}],
        [locationAt(source,point.range[1],scriptId)],[locationAt(source,point.range[0]-1,scriptId)]]) {
        assert.throws(()=>selectCookieFaultBreakpoint(locations,scriptId,point,source),missingObservation);
      }
    });
    test(`breakpoint rejects ambiguous ${method} ${kind} candidates`,()=>{
      for(const locations of [[inside,locationAt(source,point.range[0]+2,scriptId)],[exact,{...exact}]]) {
        assert.throws(()=>selectCookieFaultBreakpoint(locations,scriptId,point,source),missingObservation);
      }
    });
    test(`breakpoint cannot use a stale exact location outside the ${method} ${kind} AST range`,()=>{
      const outside=locationAt(source,point.range[1],scriptId);
      const stalePoint={...point,location:{lineNumber:outside.lineNumber,columnNumber:outside.columnNumber}};
      assert.throws(()=>selectCookieFaultBreakpoint([outside],scriptId,stalePoint,source),missingObservation);
    });
  }
}

function journal(method) {
  const revision={revision:3,sourceHash:hash('component-only-controller-source')};
  const target={tabId:17,frameId:0,documentId:'component-only-document',allowedOrigin:'https://component.invalid'};
  const identity={runId:'component-only-run',ownerEpoch:2};
  const run={tag:'controller-run',runId:identity.runId,resultId:'component-only-result',revision:{...revision},
    target:{...target},identity:{...identity},state:'paused_unknown',retirementState:'released',workerRetired:true};
  const result={tag:'controller-result',runId:run.runId,resultId:run.resultId,revision:{...revision},
    outcome:{error:{code:'E_EFFECT_UNKNOWN',message:'Component-only unknown cookie effect'}}};
  const operation={tag:'controller-operation',runId:run.runId,submissionCount:1,state:'effect_unknown',deliveryState:'fenced',
    envelope:{requestId:'component-only-request',target:{...target},identity:{...identity},revision:{...revision},
      operation:{kind:'browser',method:method==='set'?'setCookie':'deleteCookie'}},
    failure:{code:'E_EFFECT_UNKNOWN',message:'Component-only unknown cookie effect'},
    nativeReceipts:[],reply:{error:{code:'E_EFFECT_UNKNOWN'}}};
  const observer={selector:discoverCookieFaultPoints(faultSource(method),method),errors:[],
    submissions:[{at:1,method,details:{url:'https://component.invalid/',name:'sid',storeId:'component-only-missing-store'}}],
    callbacks:[{at:2,method,lastError:'No cookie store found with id component-only-missing-store.',value:null}]};
  return {method,run,result,operations:[operation],observer};
}

for(const method of methods) {
  test(`journal validates cookies.${method} fencing as component evidence only`,()=>{
    const fixture=journal(method),before=structuredClone(fixture);
    const checked=validateCookieFaultJournal(fixture);
    assert.deepEqual(checked,{nativeLastError:true,effectUnknown:true,submissionCount:1,noFollowingWrite:true,
      workerRetired:true,retirementReleased:true,formalAccepted:false});
    assert.deepEqual(fixture,before,'The verifier must not manufacture journal or observer evidence');
  });

  const rejected=[
    ['missing lastError',j=>delete j.observer.callbacks[0].lastError],
    ['null lastError',j=>j.observer.callbacks[0].lastError=null],
    ['empty lastError',j=>j.observer.callbacks[0].lastError=''],
    ['fake boolean lastError',j=>j.observer.callbacks[0].lastError=true],
    ['fake object lastError',j=>j.observer.callbacks[0].lastError={message:'invented'}],
    ['missing submission',j=>j.observer.submissions=[]],
    ['multiple submissions',j=>j.observer.submissions.push(structuredClone(j.observer.submissions[0]))],
    ['missing callback',j=>j.observer.callbacks=[]],
    ['multiple callbacks',j=>j.observer.callbacks.push(structuredClone(j.observer.callbacks[0]))],
    ['observer error',j=>j.observer.errors.push({code:'E_NATIVE_NOT_OBSERVED'})],
    ['wrong observed method',j=>j.observer.method=method==='set'?'remove':'set'],
    ['wrong selected method',j=>j.observer.selector.method=method==='set'?'remove':'set'],
    ['successful native callback value',j=>j.observer.callbacks[0].value={name:'sid',value:'success'}],
    ['successful effect receipt',j=>j.operations[0].nativeReceipts.push({stage:`cookies.${method}`,receipt:{name:'sid'}})],
    ['successful operation reply',j=>j.operations[0].reply={value:{type:'boolean',value:true}}],
    ['missing native operation',j=>j.operations=[]],
    ['following same-method write',j=>j.operations.push({...structuredClone(j.operations[0]),
      envelope:{...structuredClone(j.operations[0].envelope),requestId:'component-only-following-request'}})],
    ['following other cookie write',j=>j.operations.push({...structuredClone(j.operations[0]),
      envelope:{...structuredClone(j.operations[0].envelope),requestId:'component-only-following-request',
        operation:{kind:'browser',method:method==='set'?'deleteCookie':'setCookie'}}})],
    ['repeated journal submission',j=>j.operations[0].submissionCount=2],
    ['unsubmitted journal operation',j=>j.operations[0].submissionCount=0],
    ['known-success operation state',j=>j.operations[0].state='durable'],
    ['still-dispatched operation state',j=>j.operations[0].state='dispatched'],
    ['delivered operation',j=>j.operations[0].deliveryState='delivered'],
    ['foreign operation run',j=>j.operations[0].runId='foreign-run'],
    ['foreign operation document',j=>j.operations[0].envelope.target.documentId='foreign-document'],
    ['foreign operation tab',j=>j.operations[0].envelope.target.tabId++],
    ['foreign operation frame',j=>j.operations[0].envelope.target.frameId++],
    ['foreign envelope run identity',j=>j.operations[0].envelope.identity.runId='foreign-run'],
    ['foreign envelope owner identity',j=>j.operations[0].envelope.identity.ownerEpoch++],
    ['foreign operation source hash',j=>j.operations[0].envelope.revision.sourceHash=hash('foreign-source')],
    ['foreign operation revision',j=>j.operations[0].envelope.revision.revision++],
    ['wrong result tag',j=>j.result.tag='sdk-result'],
    ['missing result tag',j=>delete j.result.tag],
    ['foreign result run',j=>j.result.runId='foreign-run'],
    ['foreign result id',j=>j.result.resultId='foreign-result'],
    ['unreleased retirement',j=>j.run.retirementState='retiring'],
    ['unretired worker',j=>j.run.workerRetired=false],
    ['foreign result source hash',j=>j.result.revision.sourceHash=hash('foreign-source')],
    ['foreign result revision',j=>j.result.revision.revision++],
    ['missing result revision',j=>delete j.result.revision],
  ];
  for(const [name,mutate] of rejected) {
    test(`journal rejects ${name} for cookies.${method}`,()=>{
      const fixture=journal(method);
      mutate(fixture);
      assert.throws(()=>validateCookieFaultJournal(fixture));
    });
  }
}
