import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {recipeFor, requiredAssertions, savedSource} from './f3-api48-cases.mjs';
import {decodeValue as decodeControlValue} from '../../src/framework/control/value.js';
import {decodeValue as decodeRuntimeValue} from '../../src/platform/page-port/codec.js';
import {ORIGINAL_STYLE_CSS,validateStyleDisposal} from './k5-controller-style-observer.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fixedReads = new Map([[7, 'title'], [8, 'content'], [9, 'url']]);
export const ORIGINAL_FIXED_READ_IDS = Object.freeze(['CMP01-API07-OK', 'CMP01-API08-OK', 'CMP01-API09-OK']);
export const ORIGINAL_SELECTOR_READ_IDS = Object.freeze(['CMP02-API12-LIMIT', 'CMP02-API13-LIMIT',
  'CMP03-API14-OK', 'CMP03-API14-ERR', 'CMP03-API15-OK', 'CMP03-API15-ERR']);
export const ORIGINAL_CONTEXT_READ_IDS = Object.freeze(['CMP11-API03-OK','CMP11-API03-ERR']);
export const ORIGINAL_CLICK_ERROR_IDS = Object.freeze(['CMP09-API21-ERR']);
export const ORIGINAL_INPUT_ACTION_IDS = Object.freeze(['CMP09-API21-OK','CMP09-API22-OK']);
export const ORIGINAL_TYPE_ERROR_IDS = Object.freeze(['CMP09-API22-ERR']);
export const ORIGINAL_COOKIE_ACTION_IDS=Object.freeze(['CMP04-API19-OK','CMP04-API20-OK']);
export const ORIGINAL_COOKIE_READ_IDS = Object.freeze(['CMP04-API18-OK']);
export const ORIGINAL_SCRIPT_LIMIT_IDS = Object.freeze(['RESOURCE01-API16-LIMIT']);
export const ORIGINAL_SCRIPT_RESOURCE_IDS = Object.freeze(['RESOURCE01-API16-ERR']);
export const ORIGINAL_STYLE_REFUSAL_IDS = Object.freeze(['RESOURCE01-API17-ERR','RESOURCE01-API17-LIMIT']);
export const ORIGINAL_STYLE_ACTION_IDS = Object.freeze(['RESOURCE01-API17-OK']);
export const ORIGINAL_LIMIT_REFUSAL_IDS = Object.freeze(['NAV01-API10-LIMIT','NAV01-API11-LIMIT','CMP04-API28-OK']);
export const ORIGINAL_READ_IDS = Object.freeze([...ORIGINAL_FIXED_READ_IDS, ...ORIGINAL_SELECTOR_READ_IDS, ...ORIGINAL_CONTEXT_READ_IDS, ...ORIGINAL_CLICK_ERROR_IDS, ...ORIGINAL_INPUT_ACTION_IDS, ...ORIGINAL_TYPE_ERROR_IDS, ...ORIGINAL_COOKIE_READ_IDS, ...ORIGINAL_COOKIE_ACTION_IDS, ...ORIGINAL_SCRIPT_LIMIT_IDS, ...ORIGINAL_SCRIPT_RESOURCE_IDS, ...ORIGINAL_STYLE_REFUSAL_IDS, ...ORIGINAL_STYLE_ACTION_IDS, ...ORIGINAL_LIMIT_REFUSAL_IDS]);
const selectorBody = '<div id="marker">A</div><span class="item">one</span><span class="item">two</span>';
const clickErrorBody = `${selectorBody}<button id="submit">Submit</button><input id="text" value="BaseA">`;
const inputActionBody = `${selectorBody}<button id="submit">Submit</button><input id="text" value="Base">`;
const typeErrorBody = `${inputActionBody}<input id="readonly" value="Locked" readonly="">`;
const literalInput = String.fromCodePoint(34,92,128512,20320,22909);
const selectorCases = new Map([
  ['RESOURCE01-API16-ERR',{method:'addScriptTag',fixtureFamily:'selector',resourceError:true,operationKind:'packaged',external:['script-load-refused'],values:{},errors:{'resource-load':'E_RESOURCE_UNAVAILABLE'},calls:[]}],
  ['RESOURCE01-API17-OK',{method:'addStyleTag',fixtureFamily:'selector',styleAction:true,operationKind:'packaged',external:['style-disposed'],
    values:{'style-return':undefined,'style-applied':'rgb(1, 2, 3)'},errors:{},calls:[
      {method:'addStyleTag',kind:'packaged',args:[{content:ORIGINAL_STYLE_CSS}],value:undefined},
      {method:'$eval',kind:'user-script',args:['#marker','e=>getComputedStyle(e).color',[]],value:'rgb(1, 2, 3)'}]}],
  ['RESOURCE01-API17-ERR',{method:'addStyleTag',fixtureFamily:'selector',operationKind:'packaged',external:[],values:{},
    errors:{'invalid-style-options':'E_OPTION_UNSUPPORTED'},calls:[]}],
  ['RESOURCE01-API17-LIMIT',{method:'addStyleTag',fixtureFamily:'selector',operationKind:'packaged',external:['zero-page-dispatch'],values:{},
    errors:{'remote-style':'E_REMOTE_RESOURCE_UNSUPPORTED','style-import':'E_REMOTE_RESOURCE_UNSUPPORTED','style-url':'E_REMOTE_RESOURCE_UNSUPPORTED'},calls:[]}],
  ['RESOURCE01-API16-LIMIT',{method:'addScriptTag',fixtureFamily:'selector',operationKind:'user-script',external:['zero-page-dispatch'],values:{},
    errors:{'remote-script':'E_REMOTE_CODE_UNSUPPORTED','script-onload':'E_OPTION_UNSUPPORTED','script-module':'E_OPTION_UNSUPPORTED'},calls:[]}],
  ['CMP04-API19-OK',{method:'setCookie',fixtureFamily:'cookie-set',cookieAction:'set',operationKind:'browser',external:['cookie-native'],
    values:{'set-cookie-return':undefined,'set-cookie-value':'a=b','set-cookie-httpOnly':true,'set-cookie-sameSite':'lax'},errors:{},
    calls:[{method:'setCookie',args:[{name:'sid',value:'a=b',httpOnly:true,path:'/',sameSite:'Lax'}],value:undefined},{method:'cookies',args:[[]],cookieValues:true}]}],
  ['CMP04-API20-OK',{method:'deleteCookie',fixtureFamily:'cookie-delete',cookieAction:'delete',operationKind:'browser',external:['cookie-native'],
    values:{'delete-cookie-return':undefined,'delete-input':{name:'sid',path:'/'},'delete-paths':['/path']},errors:{},
    calls:[{method:'deleteCookie',args:[{name:'sid',path:'/'}],value:undefined},{method:'cookies',args:[[]],cookieValues:true}]}],
  ['CMP04-API18-OK',{method:'cookies',fixtureFamily:'cookie',cookieRead:true,operationKind:'browser',external:['cookie-native'],
    values:{'cookie-count':2,'cookie-paths':['/','/path'],'cookie-root':'a=b','cookie-httpOnly':true},errors:{}}],
  ['CMP09-API22-ERR',{method:'type',fixtureFamily:'type-error',operationKind:'packaged',external:['no-input-events'],values:{},
    errors:{'type-missing':'E_SELECTOR_NOT_FOUND','type-selector':'E_SELECTOR_INVALID','type-readonly':'E_INPUT_TARGET_UNSUPPORTED',
      'type-delay':'E_OPTION_UNSUPPORTED','type-object':'E_VALUE_SERIALIZATION'},
    calls:[{args:['#absent','x',{delay:0}],error:'E_SELECTOR_NOT_FOUND'},{args:['[','x',{delay:0}],error:'E_SELECTOR_INVALID'},
      {args:['#readonly','x',{delay:0}],error:'E_INPUT_TARGET_UNSUPPORTED'}]}],
  ['CMP09-API21-OK',{method:'click',fixtureFamily:'input-actions',inputAction:'click',operationKind:'packaged',external:['click-two'],
    values:{'click-return':'clicked'},errors:{},calls:[{method:'click',kind:'packaged',args:['#submit',{button:'left',clickCount:2,delay:10}],value:'clicked'}]}],
  ['CMP09-API22-OK',{method:'type',fixtureFamily:'input-actions',inputAction:'type',operationKind:'packaged',external:['type-values'],
    values:{'type-A':'Typed','value-A':'BaseA','type-B':'Typed','value-B':'BaseAB','type-empty':'Typed','value-empty':'BaseAB',
      'type-literal':'Typed','value-literal':'BaseAB'+literalInput},errors:{},
    calls:[['A','BaseA'],['B','BaseAB'],['','BaseAB'],[literalInput,'BaseAB'+literalInput]].flatMap(([text,value])=>[
      {method:'type',kind:'packaged',args:['#text',text,{delay:0}],value:'Typed'},
      {method:'$eval',kind:'user-script',args:['#text','e=>e.value',[]],value}])}],
  ['CMP09-API21-ERR',{method:'click',fixtureFamily:'click-error',operationKind:'packaged',external:['no-input-events'],values:{},
    errors:{'click-missing':'E_SELECTOR_NOT_FOUND','click-invalid':'E_SELECTOR_INVALID','click-delay':'E_OPTION_UNSUPPORTED','click-count':'E_OPTION_UNSUPPORTED'},
    calls:[{args:['#absent',{button:'left',clickCount:1,delay:0}],error:'E_SELECTOR_NOT_FOUND'},
      {args:['[',{button:'left',clickCount:1,delay:0}],error:'E_SELECTOR_INVALID'}]}],
  ['CMP11-API03-OK',{method:'title',values:{'constructor-debug':[true,true,false,undefined],
    'constructor-title-default':'A-title','constructor-title-true':'A-title','constructor-title-false':'A-title','constructor-title-empty':'A-title'},
    errors:{},calls:Array.from({length:4},()=>({args:[],value:'A-title'}))}],
  ['CMP11-API03-ERR',{method:'title',values:{},errors:{'constructor-debug-option':'E_OPTION_UNSUPPORTED'},calls:[]}],
  ['CMP02-API12-LIMIT', {method:'snapshot', values:{snapshot:{outerHTML:'<div id="marker">A</div>'}},
    errors:{'worker-dollar':'E_DOM_SNAPSHOT_CONTEXT'}, calls:[{args:['#marker'], value:{outerHTML:'<div id="marker">A</div>'}}]}],
  ['CMP02-API13-LIMIT', {method:'snapshots', values:{snapshots:[{outerHTML:'<span class="item">one</span>'},{outerHTML:'<span class="item">two</span>'}]},
    errors:{'worker-dollars':'E_DOM_SNAPSHOT_CONTEXT'}, calls:[{args:['.item'], value:[{outerHTML:'<span class="item">one</span>'},{outerHTML:'<span class="item">two</span>'}]}]}],
  ['CMP03-API14-OK', {method:'$eval', values:{'async-eval':'A!'}, errors:{},
    calls:[{args:['#marker','async(el,s)=>Promise.resolve(el.textContent+s)',['!']], value:'A!'}]}],
  ['CMP03-API14-ERR', {method:'$eval', values:{}, errors:{'absent-eval':'E_SELECTOR_NOT_FOUND','throw-eval':'E_PAGE_EXECUTION','reject-eval':'E_PAGE_EXECUTION'},
    calls:[{args:['#absent','e=>e.textContent',[]], error:'E_SELECTOR_NOT_FOUND'},
      {args:['#marker','()=>{throw new Error(\'boom\');}',[]], error:'E_PAGE_EXECUTION', cause:{name:'Error',message:'boom'}},
      {args:['#marker','()=>Promise.reject(new Error(\'boom\'))',[]], error:'E_PAGE_EXECUTION', cause:{name:'Error',message:'boom'}}]}],
  ['CMP03-API15-OK', {method:'$$eval', values:{'async-multiple-eval':['one','two'],'empty-eval':0}, errors:{},
    calls:[{args:['.item','async els=>els.map(e=>e.textContent)',[]], value:['one','two']}, {args:['.absent','els=>els.length',[]], value:0}]}],
  ['CMP03-API15-ERR', {method:'$$eval', values:{}, errors:{'dom-result':'E_VALUE_SERIALIZATION','cycle-result':'E_VALUE_SERIALIZATION','bigint-result':'E_VALUE_SERIALIZATION'},
    calls:[{args:['.item','()=>document.body',[]], error:'E_VALUE_SERIALIZATION'},
      {args:['.item','()=>{const x={};x.self=x;return x;}',[]], error:'E_VALUE_SERIALIZATION'},
      {args:['.item','()=>BigInt(1)',[]], error:'E_VALUE_SERIALIZATION'}]}],
  ['NAV01-API10-LIMIT',{method:'reload',fixtureFamily:'selector',operationKind:'browser',external:['zero-page-dispatch'],values:{},errors:{'reload-networkidle':'E_OPTION_UNSUPPORTED'},calls:[],zeroPageDispatch:true}],
  ['NAV01-API11-LIMIT',{method:'goto',fixtureFamily:'selector',operationKind:'browser',external:['zero-page-dispatch'],values:{},errors:{'goto-options':'E_OPTION_UNSUPPORTED'},calls:[],zeroPageDispatch:true,needsNextURL:true}],
  ['CMP04-API28-OK',{method:'screenshotInWebview',fixtureFamily:'selector',operationKind:'packaged',external:[],values:{},errors:{webview:'E_CAPABILITY_UNAVAILABLE'},calls:[],zeroPageDispatch:true}]
]);

export function originalReadPermission(ids) {
  assert(ids.length > 0 && ids.every(id => ORIGINAL_READ_IDS.includes(id)), 'Original case lacks a complete native driver');
  const states = new Set(ids.map(id => !ORIGINAL_FIXED_READ_IDS.includes(id)));
  assert.equal(states.size, 1, 'Original enabled/disabled permission groups require separate owned native profiles');
  return [...states][0];
}

function assertionView(v) {
  if (v === undefined) return {type:'undefined'};
  if (v === null) return {type:'null'};
  if (Array.isArray(v)) return {type:'array',items:v.map(assertionView)};
  if (typeof v === 'object') return {type:'object',entries:Object.keys(v).sort().map(k => [k,assertionView(v[k])])};
  return {type:typeof v,value:v};
}
const resourceKeys = ['pending', 'timers', 'subscriptions', 'ports', 'workers', 'blobs'];
export const FIXED_READ_B_BODY = '<div id="marker">B</div><input id="text" value="BaseB"><div id="screenshot-marker" style="width:32px;height:32px;background:rgb(0,0,255)">B</div>';

// Read the same immutable 603-case contract used by final acceptance. Working
// copies and old candidate verdicts cannot become this lane's case definitions.
export async function loadOriginalApi48Catalog(root) {
  const gates = JSON.parse(await readFile(path.join(root, 'docs/framework/execution-gates.json'), 'utf8'));
  const manifestPath = path.resolve(root, gates.currentPlan.manifest);
  const manifestBytes = await readFile(manifestPath);
  assert.equal(sha(manifestBytes), gates.currentPlan.manifestSha256, 'Approved plan manifest integrity failure');
  const manifest = JSON.parse(manifestBytes);
  const ref = manifest.files.find(file => file.path.endsWith('/test-spec-v5.json'));
  assert(ref, 'Approved original specification is missing');
  // The approved manifest was frozen on a Mac; its SHA identifies the bytes,
  // while its original absolute workspace prefix cannot exist in Linux CI.
  // Rebase only that exact historical prefix to this checkout. Never weaken
  // the manifest/spec SHA check or substitute a different fixture.
  const frozenRoot = '/Users/shopme/Documents/workspace/opendesk-browser';
  const relativeSpec = path.isAbsolute(ref.path) ? path.relative(frozenRoot, ref.path) : ref.path;
  assert(relativeSpec && relativeSpec !== '.' && !path.isAbsolute(relativeSpec) &&
    relativeSpec !== '..' && !relativeSpec.startsWith('..' + path.sep), 'Approved spec must stay under the repository');
  const specPath = path.resolve(root, relativeSpec), bytes = await readFile(specPath);
  assert.equal(sha(bytes), ref.sha256, 'Approved original specification integrity failure');
  const spec = JSON.parse(bytes);
  assert.equal(spec.cases.length, 603, 'Original case denominator changed');
  assert(spec.cases.every(row => row.required === true));
  assert.equal(new Set(spec.cases.map(row => row.id)).size, 603);
  return {cases: spec.cases, binding: {manifestPath, manifestSha256: sha(manifestBytes), specPath, specSha256: sha(bytes), denominator: 603}};
}

export function fixedReadFixtureHTML(role, family = 'fixed') {
  assert(['A', 'B'].includes(role));
  assert(['fixed','selector','click-error','input-actions','type-error','cookie','cookie-set','cookie-delete'].includes(family), 'Unknown original fixture family');
  const body = role === 'A' ? family === 'type-error' ? typeErrorBody : family === 'input-actions' ? inputActionBody : family === 'click-error' ? clickErrorBody : ['selector','cookie','cookie-set','cookie-delete'].includes(family) ? selectorBody : '<div id="marker">A</div>' : FIXED_READ_B_BODY;
  const observer = ['click-error','input-actions','type-error'].includes(family) ? `<script>(()=>{const events=[];for(const type of ['mousedown','mouseup','click','contextmenu','input','keydown','keypress','keyup'])document.addEventListener(type,event=>events.push({type:event.type,target:event.target?.id??null,isTrusted:event.isTrusted,detail:event.detail??null,button:event.button??null,key:event.key??null,data:event.data??null,value:event.target?.value??null,at:performance.now()}),true);Object.defineProperty(window,'OpenDeskInputEventObservations',{value:Object.freeze({read:()=>events.map(event=>({...event}))})});})();</script>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${role}-title</title>${observer}</head><body>${body}</body></html>`;
}

export function originalReadFixtureFamily(definition) {
  assert(ORIGINAL_READ_IDS.includes(definition?.id), 'Original case lacks its fixture');
  return ORIGINAL_FIXED_READ_IDS.includes(definition.id) ? 'fixed' : selectorCases.get(definition.id).fixtureFamily ?? 'selector';
}

export function originalReadPlan(definition, urls) {
  if (ORIGINAL_FIXED_READ_IDS.includes(definition?.id)) return {...fixedReadPlan(definition, urls), fixtureFamily:'fixed'};
  const spec = selectorCases.get(definition?.id);
  assert(spec, 'Original case has no complete native input/oracle driver');
  assert.equal(definition.required, true);
  const api = Number(definition.id.match(/-API(\d+)-/)[1]);
  assert.equal(definition.source.symbol, `ChromePage.${({3:'debug',10:'reload',11:'goto',12:'$',13:'$$',14:'$eval',15:'$$eval',16:'addScriptTag',17:'addStyleTag',18:'cookies',19:'setCookie',20:'deleteCookie',21:'click',22:'type',28:'screenshotInWebview'})[api]}`);
  const recipe = recipeFor(definition);
  assert.equal(recipe.userScripts, true); assert.deepEqual(recipe.gaps, []); assert.deepEqual(recipe.external, spec.external ?? []);
  const {aURL,bURL,barrierURL} = urls;
  for (const url of [aURL,barrierURL]) assert.equal(new URL(url).origin, new URL(aURL).origin);
  if(spec.cookieAction) {
    assert.equal(new URL(aURL).hostname,'127.0.0.1');assert.equal(new URL(bURL).hostname,'localhost','Original B needs a separate cookie hostname');
    assert.equal(new URL(bURL).protocol,new URL(aURL).protocol);assert.equal(new URL(bURL).port,new URL(aURL).port);
  }else assert.equal(new URL(bURL).origin,new URL(aURL).origin);
  assert.notEqual(aURL,bURL, 'Original A/B fixture URLs must differ');
  const family = spec.fixtureFamily ?? 'selector';
  for (const url of [aURL,bURL]) assert.equal(new URL(url).searchParams.get('family'), family, 'Original selector fixture is missing');
  if(spec.cookieRead||spec.cookieAction) {
    assert.equal(new URL(aURL).pathname,'/path/original-api48','Original cookie A path must admit both cookie paths');
    assert.equal(new URL(bURL).pathname,'/original-api48','Original cookie B path must exclude /path');
  }
  if(spec.styleAction){assert.equal(new URL(urls.styleBarrierURL).origin,new URL(aURL).origin);assert.notEqual(urls.styleBarrierURL,barrierURL);}
  if(spec.resourceError){assert.equal(urls.sdkURL,new URL('framework/sdk-main.js',urls.sdkRoot).href);assert.equal(new URL(urls.sdkURL).protocol,'chrome-extension:');assert.equal(new URL(aURL).searchParams.get('resourceFault'),'script-network');assert.equal(new URL(bURL).searchParams.has('resourceFault'),false);}
  const source = savedSource(definition, {...recipe,body:`await axiosx.get(params.nativeBarrierURL);\n${recipe.body}${spec.styleAction?'\nawait axiosx.get(params.nativeStyleBarrierURL);':''}`});
  const assertions = requiredAssertions(recipe), assertionExpected = Object.fromEntries(assertions.map(name =>
    [name, Object.hasOwn(spec.values,name) ? spec.values[name] : true]));
  const params={nativeBarrierURL:barrierURL,...(spec.needsNextURL?{nextURL:urls.nextURL}:{}),...(spec.cookieRead?{url:aURL}:{}),...(spec.resourceError?{sdkURL:urls.sdkURL}:{}),...(spec.styleAction?{nativeStyleBarrierURL:urls.styleBarrierURL}:{})};
  if(spec.needsNextURL){assert.equal(new URL(params.nextURL).origin,new URL(aURL).origin);assert.notEqual(params.nextURL,aURL);assert.notEqual(params.nextURL,bURL);}
  return {caseId:definition.id,definition,contractSha256:sha(JSON.stringify(definition)),method:spec.method,
    source,sourceSha256:sha(source),params,aURL,bURL,fixtureFamily:family,inputAction:spec.inputAction,styleAction:spec.styleAction,resourceError:spec.resourceError,cookieRead:spec.cookieRead,cookieAction:spec.cookieAction,zeroPageDispatch:spec.zeroPageDispatch,
    bodyHTML:family==='type-error'?typeErrorBody:family==='input-actions'?inputActionBody:family==='click-error'?clickErrorBody:selectorBody,
    requiredAssertions:assertions,assertionExpected,errors:spec.errors,calls:spec.resourceError?[{args:[{url:urls.sdkURL}],error:'E_RESOURCE_UNAVAILABLE'}]:spec.cookieRead?[{args:[[aURL,aURL]]},{args:[[]]}]:spec.calls,
    operationKind:spec.operationKind ?? (api <= 13 ? 'packaged' : 'user-script'),userScripts:true};
}

export function fixedReadPlan(definition, {aURL, bURL, barrierURL}) {
  assert(ORIGINAL_FIXED_READ_IDS.includes(definition?.id), 'Original case has no complete native input/oracle driver');
  assert.equal(definition.required, true);
  const api = Number(definition.id.match(/-API(\d+)-OK$/)[1]), method = fixedReads.get(api);
  assert.equal(definition.source.symbol, `ChromePage.${method}`);
  const recipe = recipeFor(definition);
  assert.equal(recipe.userScripts, false);
  assert.equal(recipe.activateB, true);
  assert.deepEqual(recipe.gaps, []);
  assert.deepEqual(recipe.external, []);
  for (const url of [aURL, bURL, barrierURL]) assert.equal(new URL(url).origin, new URL(aURL).origin);
  assert.notEqual(aURL, bURL, 'Original A/B fixture URLs must differ');
  assert(new URL(aURL).hash, 'Original URL oracle must preserve a nonempty fragment');
  const params = {title: 'A-title', bodyHTML: '<div id="marker">A</div>', url: aURL, nativeBarrierURL: barrierURL};
  const expected = params[{title: 'title', content: 'bodyHTML', url: 'url'}[method]];
  // This is an actual authorized Worker service request, held by the fixture
  // server until native observations show B active. No callback is fabricated.
  const source = savedSource(definition, {...recipe, body: `await axiosx.get(params.nativeBarrierURL);\n${recipe.body}`});
  return {caseId: definition.id, definition, contractSha256: sha(JSON.stringify(definition)), method,
    source, sourceSha256: sha(source), params, aURL, bURL, expected,
    requiredAssertions: requiredAssertions(recipe), userScripts: false};
}

export function validateFixedReadOracle(plan, observation) {
  assert(ORIGINAL_FIXED_READ_IDS.includes(plan.caseId));
  return validateOriginalReadOracle(plan, observation);
}

export async function captureOriginalReadOutcome(actual,readers) {
  const names=Object.keys(readers),reads={},readErrors={},decodeErrors={};
  const completed=await Promise.allSettled(names.map(name=>Promise.resolve().then(readers[name])));
  const project=error=>({code:error.code,message:error.message,stack:error.stack,actual:error.actual,observation:error.observation});
  for(let i=0;i<names.length;i++) {
    const result=completed[i];if(result.status==='fulfilled')reads[names[i]]=result.value;else readErrors[names[i]]=project(result.reason);
  }
  let value=null,params=null,decodeError;
  try{value=decodeRuntimeValue(actual.result.outcome.valueWire);}catch(error){decodeErrors.value=project(error);decodeError=error;}
  try{params=decodeRuntimeValue(actual.run.paramsWire);}catch(error){decodeErrors.params=project(error);decodeError??=error;}
  return {value,params,reads,readErrors,decodeErrors,decodeError,readError:completed.find(result=>result.status==='rejected')?.reason};
}

export function originalAdmittedRun(snapshot,plan,knownRunId=null) {
  const matches=(snapshot?.rows?.runs??[]).map(row=>row.value).filter(run=>{
    if(knownRunId&&run.runId!==knownRunId||run.revision?.sourceHash!==plan.sourceSha256)return false;
    try {assert.deepEqual(decodeRuntimeValue(run.paramsWire),plan.params);return true;}catch{return false;}
  });
  return matches.length===1?matches[0]:null;
}
export async function captureOriginalCaseFailure(error,{before={},recordBefore,cleanup={},after={}}) {
  const project=e=>({code:e?.code,name:e?.name,message:e?.message??String(e),stack:e?.stack,actual:e?.actual,observation:e?.observation});
  async function readAll(readers) {
    const names=Object.keys(readers),reads={},readErrors={},completed=await Promise.allSettled(names.map(name=>Promise.resolve().then(readers[name])));
    for(let i=0;i<names.length;i++){const r=completed[i];if(r.status==='fulfilled')reads[names[i]]=r.value;else readErrors[names[i]]=project(r.reason);}
    return {reads,readErrors};
  }
  const captured={failure:project(error),before:await readAll(before),cleanup:{results:{},errors:{}}};
  if(recordBefore)try{await recordBefore(captured);}catch(e){captured.cleanup.errors.recordBefore=project(e);}
  for(const [name,step] of Object.entries(cleanup))try{captured.cleanup.results[name]=await step(captured);}catch(e){captured.cleanup.errors[name]=project(e);}
  captured.after=await readAll(after);return captured;
}
function cookieProjection(rows, url, storeId, paths, rootValue='a=b', rootSameSite='lax') {
  assert(Array.isArray(rows),'Actual native cookie array is missing');assert.equal(rows.length,paths.length,'Unexpected native cookie count');
  assert.deepEqual(rows.map(row=>row.path).sort(),paths,'Native cookie paths differ');
  return rows.map(row=>{
    assert.equal(row.storeId,storeId);assert.equal(row.name,'sid');assert.equal(row.domain,new URL(url).hostname);
    assert.equal(row.value,row.path==='/'?rootValue:'path');assert.equal(row.httpOnly,true);assert.equal(row.hostOnly,true);
    assert.equal(row.secure,false);assert.equal(row.sameSite,row.path==='/'?rootSameSite:'lax');assert.equal(row.session,true);
    assert.equal(row.expirationDate,undefined);assert.equal(row.partitionKey,undefined);
    return {name:row.name,value:row.value,domain:row.domain,path:row.path,expires:row.expirationDate,
      httpOnly:row.httpOnly,secure:row.secure,sameSite:row.sameSite};
  });
}

function validateCookieReadEvidence(plan, observation, operations) {
  const {selected,run,bBefore,before,after}=observation,baseline=before.cookieObservation;
  for(const page of [observation.aBefore,observation.a,bBefore,observation.bAfter])
    assert.equal(page?.documentCookie,'','Actual document.cookie must not expose seeded HttpOnly cookies');
  assert(baseline,'Actual cookie baseline is missing');assert(Array.isArray(baseline.stores),'Actual cookie stores are missing');
  validateCookieAdmission(observation);
  const matched=baseline.stores.filter(store=>store.tabIds?.includes(selected.tabId));
  assert.equal(matched.length,1);const storeId=matched[0].id;assert.equal(typeof storeId,'string');assert.notEqual(storeId,'');
  assert(matched[0].tabIds.includes(bBefore.tabId),'A/B cookies must use the same observed native store');
  for(const [page,target,url,paths] of [[baseline.a,selected,plan.aURL,['/','/path']],[baseline.b,bBefore,plan.bURL,['/']]]) {
    assert.equal(page?.tabId,target.tabId);assert.equal(page.frame?.frameId,0);assert.equal(page.frame?.documentId,target.documentId);
    assert.equal(page.frame.url,url);assert.equal(page.frame.errorOccurred,false);
    if(page.frame.documentLifecycle)assert.equal(page.frame.documentLifecycle,'active');
    cookieProjection(page.cookies,url,storeId,paths);
  }
  assert.deepEqual(after.cookieObservation,baseline,'Read-only cookie case changed actual native cookies or documents');
  assert.equal(operations?.length,2,'Both original cookie reads are required');
  let explicit;
  for(const [i,read] of operations.entries()) {
    assert.equal(read.envelope.identity.runId,run.runId);assert.equal(read.envelope.identity.ownerEpoch,run.identity.ownerEpoch);
    assert.equal(read.reply?.requestId,read.envelope.requestId);assert.equal(read.reply.error,undefined);
    const receipts=read.nativeReceipts;assert(Array.isArray(receipts),'Actual native cookie receipts are missing');
    const one=stage=>{const rows=receipts.filter(row=>row.stage===stage);assert.equal(rows.length,1,`One exact ${stage} completion required`);
      assert.equal(rows[0].requestId,read.envelope.requestId);return rows[0];};
    const stores=one('cookies.getAllCookieStores'),native=one('cookies.getAll'),result=one('result');
    assert.deepEqual(stores.receipt,baseline.stores,'Native cookie store selection changed');
    assert(receipts.indexOf(stores)<receipts.indexOf(native),'Cookie store must be observed before reading');
    assert(receipts.indexOf(native)<receipts.indexOf(result),'Native cookie read must precede its result');
    const projected=cookieProjection(native.receipt,plan.aURL,storeId,['/','/path']);
    assert.deepEqual(native.receipt,baseline.a.cookies,'Cookie read differs from actual selected A baseline');
    assert.deepEqual(result.receipt,read.reply,'Native result completion differs from durable cookie reply');
    const value=decodeControlValue(read.reply.value);assert.deepEqual(value,projected,'Cookie result differs from complete native projection');
    if(i===0)explicit=value;else assert.deepEqual(value,explicit,'Default cookie URL did not use the selected A document');
    const frames=receipts.filter(row=>row.stage==='webNavigation.getAllFrames');
    assert(frames.some(row=>receipts.indexOf(row)<receipts.indexOf(native))&&frames.some(row=>receipts.indexOf(row)>receipts.indexOf(result)),
      'Actual document checks must surround cookie read and result');
    for(const row of frames) {
      assert.equal(row.requestId,read.envelope.requestId);const frame=row.receipt?.find(frame=>frame.frameId===selected.frameId);
      assert.equal(frame?.documentId,selected.documentId);assert.equal(frame.url,plan.aURL);assert.equal(frame.errorOccurred,false);
      if(frame.documentLifecycle)assert.equal(frame.documentLifecycle,'active');
    }
  }
  return explicit;
}

function validateCookieAdmission(observation) {
  const {before,run,barrier}=observation,admission=before.cookieAdmission;
  assert.equal(before.cookieObservation?.permissions?.cookies,true,'Actual cookie permission must exist after trusted Start');
  assert.equal(admission?.runId,run.runId);assert.equal(admission?.pendingRequestId,barrier.pendingOperation?.envelope?.requestId);
  assert.equal(typeof admission.pendingRequestId,'string');assert(admission.pendingRequestId);
  assert(admission.observedAt>=barrier.request.at&&admission.observedAt<=barrier.release.at,'Cookie baseline must occur during the actual held Worker barrier');
}

function validateCookieActionEvidence(plan,observation,operations) {
  const {before,after,selected,bBefore,run}=observation,baseline=before.cookieObservation,current=after.cookieObservation;
  validateCookieAdmission(observation);assert.equal(current?.permissions?.cookies,true);
  const bURL=new URL(plan.bURL),bOriginPattern=`${bURL.protocol}//${bURL.hostname}/*`;
  for(const state of [baseline,current]){assert.equal(state.permissions.bOriginPattern,bOriginPattern);assert.equal(state.permissions.bOriginGranted,false,'Actual B origin must remain ungranted before and after the cookie mutation');}
  assert(Array.isArray(baseline.stores));const stores=baseline.stores.filter(store=>store.tabIds?.includes(selected.tabId));
  assert.equal(stores.length,1);const storeId=stores[0].id;assert.equal(typeof storeId,'string');assert(storeId);assert(stores[0].tabIds.includes(bBefore.tabId));
  assert.deepEqual(current.stores,baseline.stores);assert.deepEqual(current.b,baseline.b,'Mutation changed isolated B cookies or document');
  for(const state of [baseline,current]) {
    for(const [page,target,url] of [[state.a,selected,plan.aURL],[state.b,bBefore,plan.bURL]]) {
      assert.equal(page.tabId,target.tabId);assert.equal(page.frame.frameId,0);assert.equal(page.frame.documentId,target.documentId);
      assert.equal(page.frame.url,url);assert.equal(page.frame.errorOccurred,false);if(page.frame.documentLifecycle)assert.equal(page.frame.documentLifecycle,'active');
    }
    assert.equal(state.b.cookieSource,'CDP.Network.getCookies');assert.equal(state.b.cookies.length,1);
    const b=state.b.cookies[0];for(const [key,value] of Object.entries({name:'sid',value:'B',domain:'localhost',path:'/',httpOnly:true,secure:false,sameSite:'Lax',session:true,expires:-1}))assert.equal(b[key],value);
  }
  const setting=plan.cookieAction==='set';cookieProjection(baseline.a.cookies,plan.aURL,storeId,['/','/path'],setting?'before':'a=b',setting?'strict':'lax');
  const afterPaths=setting?['/','/path']:['/path'],expected=cookieProjection(current.a.cookies,plan.aURL,storeId,afterPaths);
  for(const page of [observation.aBefore,observation.a,bBefore,observation.bAfter])assert.equal(page?.documentCookie,'');
  assert.equal(operations?.length,2,'Original mutation and default read are both required');
  for(const [index,operation] of operations.entries()) {
    assert.equal(operation.envelope.identity.runId,run.runId);assert.equal(operation.envelope.identity.ownerEpoch,run.identity.ownerEpoch);
    assert.equal(operation.reply?.requestId,operation.envelope.requestId);assert.equal(operation.reply.error,undefined);
    const receipts=operation.nativeReceipts;assert(Array.isArray(receipts));for(const r of receipts)assert.equal(r.requestId,operation.envelope.requestId);
    const one=stage=>{const matching=receipts.filter(r=>r.stage===stage);assert.equal(matching.length,1,`One exact ${stage} completion required`);return matching[0];};
    const nativeStores=one('cookies.getAllCookieStores'),result=one('result');assert.deepEqual(nativeStores.receipt,baseline.stores);assert.deepEqual(result.receipt,operation.reply);
    const completion=one(index===1?'cookies.getAll':setting?'cookies.set':'cookies.remove');
    assert(receipts.indexOf(nativeStores)<receipts.indexOf(completion)&&receipts.indexOf(completion)<receipts.indexOf(result));
    const cookieStages=receipts.filter(r=>r.stage.startsWith('cookies.')).map(r=>r.stage).sort();
    assert.deepEqual(cookieStages,index===1?['cookies.getAll','cookies.getAllCookieStores']:setting?['cookies.getAllCookieStores','cookies.set']:['cookies.getAll','cookies.getAll','cookies.getAllCookieStores','cookies.remove']);
    if(index===1) {assert.deepEqual(completion.receipt,current.a.cookies);assert.deepEqual(decodeControlValue(operation.reply.value),expected);}
    else {
      assert.equal(decodeControlValue(operation.reply.value),undefined);
      if(setting)assert.deepEqual(completion.receipt,current.a.cookies.find(c=>c.path==='/'));
      else {
        assert.deepEqual(completion.receipt,{url:new URL('/',plan.aURL).href,name:'sid',storeId});
        for(const r of receipts.filter(r=>r.stage==='cookies.getAll'))assert.deepEqual(r.receipt,[baseline.a.cookies.find(c=>c.path==='/')]);
      }
    }
    const frames=receipts.filter(r=>r.stage==='webNavigation.getAllFrames');
    assert(frames.some(r=>receipts.indexOf(r)<receipts.indexOf(completion))&&frames.some(r=>receipts.indexOf(r)>receipts.indexOf(result)),'Actual document checks must surround mutation/read and result');
    for(const r of frames) {const frame=r.receipt?.find(f=>f.frameId===selected.frameId);assert.equal(frame?.documentId,selected.documentId);assert.equal(frame.url,plan.aURL);assert.equal(frame.errorOccurred,false);if(frame.documentLifecycle)assert.equal(frame.documentLifecycle,'active');}
  }
}

export function validateOriginalReadOracle(plan, observation) {
  const {value, before, after, selected, run, result, barrier, a, bBefore, bAfter, cleanup, fixedReadOperations} = observation;
  const unsorted=plan.calls?observation.pageOperations:fixedReadOperations;
  const operations=plan.inputAction||plan.styleAction||plan.cookieRead||plan.cookieAction?[...(unsorted??[])].sort((a,b)=>a.dispatchAt-b.dispatchAt||a.receiptAt-b.receiptAt):unsorted;
  const cookieValue=plan.cookieRead?validateCookieReadEvidence(plan,observation,operations):undefined;
  if(plan.cookieAction)validateCookieActionEvidence(plan,observation,operations);
  if(plan.styleAction)validateStyleDisposal(plan,observation);
  if(plan.resourceError){
    const resource=observation.scriptResource;assert.equal(resource.ready,false);assert.equal(resource.nodes,0);
    const loads=resource.network.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url===plan.params.sdkURL);
    assert.equal(loads.length,1);assert.equal(loads[0].params.type,'Script');
    assert(resource.network.some(e=>e.method==='Network.loadingFailed'&&e.params.requestId===loads[0].params.requestId&&e.params.blockedReason==='inspector'));
    assert(!resource.network.some(e=>e.method==='Network.loadingFinished'&&e.params.requestId===loads[0].params.requestId));
    assert.equal(resource.fault.url,plan.params.sdkURL);assert.equal(resource.fault.method,'Network.setBlockedURLs');assert.deepEqual(resource.fault.params,{urls:[plan.params.sdkURL]});assert.deepEqual(resource.fault.reply,{});
  }
  assert.equal(value?.caseId, plan.caseId);
  assert.equal(value.failure, null, 'Original saved script failed');
  assert.deepEqual(observation.params, plan.params, 'Original saved script params changed');
  assert.deepEqual(value.checks?.map(check => check.name), plan.requiredAssertions, 'Original assertion coverage differs');
  for (const check of value.checks) {
    const expectedWire = plan.calls ? assertionView(plan.cookieRead&&check.name==='cookie-default'?cookieValue:plan.assertionExpected[check.name]) : {type:'string',value:plan.expected};
    assert.deepEqual(check.expected, expectedWire, 'Assertion expected value differs from the original fixture');
    assert.deepEqual(check.actual, expectedWire, 'Original assertion failed');
  }
  assert.equal(before.userScripts.available, plan.userScripts, 'Original function execution permission precondition differs');
  assert.equal(after.userScripts.available, plan.userScripts, 'Function execution permission changed during the case');
  assert.equal(selected.url, plan.aURL);
  assert.equal(selected.documentId, a.documentId);
  assert.equal(selected.frameId, 0);
  assert.deepEqual(run.target, {...run.target, tabId: selected.tabId, documentId: selected.documentId, frameId: selected.frameId});
  assert.equal(run.state, 'completed');
  assert.equal(run.retirementState, 'released');
  assert.equal(result.tag, 'controller-result');
  assert.equal(result.state, 'completed');
  assert.equal(result.runId, run.runId);
  assert.equal(result.resultId, run.resultId);
  assert.equal(run.revision.sourceHash, plan.sourceSha256);
  assert(result.revision, 'The result itself must carry its admitted revision');
  assert.equal(result.revision.sourceHash, plan.sourceSha256);
  assert.deepEqual(result.revision, run.revision, 'The result itself must carry the admitted revision');
  assert(barrier.request && barrier.release, 'Actual Worker HTTP admission barrier is missing');
  const pending = barrier.pendingOperation;
  assert.equal(pending?.tag, 'controller-operation');
  assert.equal(pending.runId, run.runId);
  assert.equal(pending.state, 'dispatched');
  assert.equal(pending.envelope.operation.kind, 'service');
  assert.equal(pending.envelope.operation.method, 'AXIOS_GET');
  assert.equal(pending.envelope.revision.sourceHash, plan.sourceSha256);
  assert.equal(barrier.pendingArgs[0].url, plan.params.nativeBarrierURL);
  assert.equal(barrier.request.method, 'GET');
  assert.equal(barrier.request.url, new URL(plan.params.nativeBarrierURL).pathname + new URL(plan.params.nativeBarrierURL).search);
  assert(barrier.release.at >= barrier.request.at);
  assert.equal(barrier.release.activeTab.id, bBefore.tabId);
  assert.equal(barrier.release.activeTab.url, plan.bURL);
  assert.equal(barrier.release.activeTab.active, true);
  assert.equal(barrier.release.focusedB, true);
  assert.equal(after.activeTab.id, bBefore.tabId);
  assert.equal(after.activeTab.url, plan.bURL);
  assert.equal(after.activeTab.active, true);
  assert.equal(after.focusedB, true);
  if(plan.zeroPageDispatch) {
    const currentRunOperations = observation.currentRunOperations ?? [];
    assert.equal(currentRunOperations.length, 2, 'Original zero-dispatch oracle allows only the barrier and 350ms preamble operations');
    const barrierOps = currentRunOperations.filter(operation => operation.envelope?.requestId === barrier.pendingOperation.envelope.requestId);
    const preambleOps = currentRunOperations.filter(operation => operation.envelope?.requestId === observation.preambleOperations?.[0]?.envelope?.requestId);
    assert.equal(barrierOps.length, 1, 'Original zero-dispatch oracle requires exactly one barrier service operation');
    assert.equal(preambleOps.length, 1, 'Original zero-dispatch oracle requires exactly one 350ms preamble operation');
    assert.equal(barrierOps[0], barrier.pendingOperation, 'Original barrier operation must be the observed pending service request');
    assert.equal(preambleOps[0], observation.preambleOperations[0], 'Original preamble operation must be the observed waitForTimeout request');
    for (const operation of currentRunOperations) assert.equal(operation.runId, run.runId, 'Foreign operation included in current run oracle');
  }
  assert.equal(operations?.length, plan.calls?.length ?? 1, 'Original read dispatch count differs');
  assert.equal(new Set(operations.map(row => row.envelope.requestId)).size, operations.length, 'Duplicate original read completion');
  for (const [index,read] of operations.entries()) {
    const call=plan.inputAction||plan.styleAction||plan.cookieRead||plan.cookieAction?plan.calls[index]:null;
  assert.equal(read.tag, 'controller-operation');
  assert.equal(read.runId, run.runId);
  assert.equal(read.state, 'durable');
  assert.equal(read.submissionCount, 1);
  assert.equal(read.envelope.operation.kind, call?.kind ?? plan.operationKind ?? 'packaged');
  assert.equal(read.envelope.operation.method, call?.method ?? plan.method);
  if(call)assert.deepEqual(decodeControlValue(read.envelope.operation.args),call.args,'Original input operation order differs');
    if (['click-error','type-error'].includes(plan.fixtureFamily) || plan.inputAction || plan.styleAction) {
    assert.equal(read.envelope.identity.runId, run.runId); assert.equal(read.envelope.identity.ownerEpoch, run.identity.ownerEpoch);
  }
  assert.equal(read.envelope.target.tabId, selected.tabId);
  assert.equal(read.envelope.target.documentId, selected.documentId);
  assert.equal(read.envelope.target.frameId, selected.frameId);
  assert.equal(read.envelope.revision.sourceHash, plan.sourceSha256);
  assert(read.dispatchAt >= barrier.release.at, 'Original read dispatched before the observed B activation');
  }
  if (plan.calls) {
    const checked = new Set();
    for (const call of plan.calls) {
      const operand = JSON.stringify([call.method??plan.method,call.kind??plan.operationKind,call.args]); if (checked.has(operand)) continue; checked.add(operand);
      const expected = plan.calls.filter(item=>JSON.stringify([item.method??plan.method,item.kind??plan.operationKind,item.args])===operand);
      const matching = operations.filter(row => JSON.stringify([row.envelope.operation.method,row.envelope.operation.kind,decodeControlValue(row.envelope.operation.args)]) === operand);
      assert.equal(matching.length, expected.length, 'Exactly one completion for each original operand is required');
      for (const [index,read] of matching.entries()) {
      const call = expected[index]; assert.equal(read.reply?.requestId, read.envelope.requestId);
      if (call.error) {
        assert.equal(read.effectState, 'failure-observed'); assert.equal(read.reply.error?.code, call.error);
        assert.equal(read.reply.error.name, 'PageError'); assert.equal(Object.hasOwn(read.reply,'value'),false, 'Failure became a fake successful value');
        const receipts = read.nativeReceipts?.filter(r => r.stage === (plan.operationKind==='packaged'?'packaged.finalFailure':'userScripts.finalFailure'));
        assert.equal(receipts?.length, 1, 'A failed operation requires one exact native completion');
        assert.equal(receipts[0].requestId, read.envelope.requestId); assert.equal(receipts[0].receipt.frameId, selected.frameId);
        assert.equal(receipts[0].receipt.documentId, selected.documentId); assert.deepEqual(receipts[0].receipt.error, read.reply.error);
        if(plan.operationKind==='packaged') {
          assert.equal(receipts[0].receipt.runId,run.runId);assert.equal(receipts[0].receipt.ownerEpoch,run.identity.ownerEpoch);
        }
        if (call.cause) assert.deepEqual(read.reply.error.cause, call.cause, 'Original failure name/message changed');
      } else {
        assert.equal(read.reply?.error, undefined); if(!plan.cookieRead&&!call.cookieValues)assert.deepEqual(decodeControlValue(read.reply.value),call.value);
          if(plan.inputAction||plan.styleAction) {
          const kind=call.kind??plan.operationKind;
          const receipts=read.nativeReceipts?.filter(receipt=>receipt.stage===(kind==='packaged'?'tabs.sendMessage':'userScripts.execute'));
          const sessionReady=kind==='packaged'?receipts?.filter(receipt=>receipt.receipt?.type==='OPENDESK_CONTROLLER_PAGE_SESSION_V1'):[];
          assert(sessionReady.length<=1,'Original operation has duplicate page-session handshakes');
          for(const receipt of sessionReady) { assert.equal(receipt.requestId,read.envelope.requestId);assert.equal(receipt.receipt.ready,true); }
          const native=receipts?.filter(receipt=>!sessionReady.includes(receipt));
          assert.equal(native?.length,1,'Original input requires one actual native completion');
          assert.equal(native[0].requestId,read.envelope.requestId);
          if(kind==='packaged') {
            const reply=native[0].receipt;assert.equal(reply.requestId,read.envelope.requestId);assert.equal(reply.runId,run.runId);assert.equal(reply.ownerEpoch,run.identity.ownerEpoch);
            assert.equal(reply.error,undefined);assert.deepEqual(decodeControlValue(reply.value),call.value);
          }else {
            const replies=native[0].receipt;assert.equal(replies.length,1);assert.equal(replies[0].frameId,selected.frameId);
            assert.equal(replies[0].documentId,selected.documentId);assert.equal(replies[0].error,undefined);assert.equal(replies[0].result.ok,true);
            assert.deepEqual(decodeControlValue(replies[0].result.value),call.value);
          }
          const documentReads=read.nativeReceipts.filter(receipt=>receipt.stage==='webNavigation.getAllFrames');
          assert(documentReads.length>=2,'Input completion must retain actual before/after native document checks');
          const completionIndex=read.nativeReceipts.indexOf(native[0]);
          assert(documentReads.some(receipt=>read.nativeReceipts.indexOf(receipt)<completionIndex)&&
            documentReads.some(receipt=>read.nativeReceipts.indexOf(receipt)>completionIndex),'Actual document checks must surround the native completion');
          for(const documentRead of documentReads) {
            assert.equal(documentRead.requestId,read.envelope.requestId);
            const frame=documentRead.receipt?.find(frame=>frame.frameId===selected.frameId);
            assert.equal(frame?.documentId,selected.documentId);assert.equal(frame.errorOccurred,false);
            if(frame.documentLifecycle)assert.equal(frame.documentLifecycle,'active');
          }
        }
      }
      }
    }
    assert.deepEqual(Object.keys(value.artifacts).sort(), Object.keys(plan.errors).sort(), 'Original rejection artifacts differ');
    for (const [name,code] of Object.entries(plan.errors)) {
      const error = value.artifacts[name]; assert.equal(error.code, code); assert.equal(error.name,'PageError'); assert.equal(typeof error.message,'string');
      if (['throw-eval','reject-eval'].includes(name)) { assert.equal(error.message,'boom'); assert.deepEqual(error.cause,{name:'Error',message:'boom'}); }
    }
    assert.equal(observation.preambleOperations?.length,1, 'Original recipe timeout preamble differs');
    assert.deepEqual(decodeControlValue(observation.preambleOperations[0].envelope.operation.args),[350]);
    assert.equal(observation.preambleOperations[0].state,'durable');
  }
  assert.equal(a.url, plan.aURL);
  assert.equal(a.title, 'A-title');
  assert.equal(a.bodyHTML, plan.bodyHTML ?? '<div id="marker">A</div>');
  assert.equal(bBefore.url, plan.bURL);
  assert.equal(bBefore.title, 'B-title');
  assert.equal(bBefore.bodyHTML, FIXED_READ_B_BODY);
  assert.equal(bBefore.inputValue, 'BaseB');
  assert.equal(bBefore.screenshotMarker.color, 'rgb(0, 0, 255)');
  assert.equal(bBefore.screenshotMarker.visible, true);
  assert.deepEqual(bAfter, bBefore, 'The active B document changed');
  if(['click-error','type-error'].includes(plan.fixtureFamily)) {
    for(const page of [observation.aBefore,a,bBefore,bAfter])assert.deepEqual(page?.inputEvents,[], 'Original click errors must produce zero observed input events');
  }
  if(plan.fixtureFamily==='type-error') {
    assert.equal(observation.aBefore.inputValue,'Base');assert.equal(a.inputValue,'Base');
    assert.equal(observation.aBefore.readonlyValue,'Locked');assert.equal(a.readonlyValue,'Locked');
  }
  if(plan.inputAction) {
    const aBefore=observation.aBefore;assert(aBefore,'Actual A baseline is missing');
    assert.equal(a.tabId,selected.tabId);assert.equal(a.frameId,selected.frameId);
    assert.equal(typeof a.nativeTargetId,'string');assert.notEqual(a.nativeTargetId,'');
    assert.deepEqual(aBefore.inputEvents,[],'Original A must start with no input events');
    assert.deepEqual(bBefore.inputEvents,[],'Original B must start with no input events');
    assert.equal(aBefore.inputValue,'Base');
    for(const key of ['url','title','bodyHTML','tabId','frameId','documentId','nativeTargetId','screenshotMarker'])assert.deepEqual(a[key],aBefore[key],`Input operation changed A ${key}`);
    assert(Array.isArray(a.inputEvents),'Actual input events are missing');
    if(plan.inputAction==='click') {
      assert.equal(a.inputValue,'Base');
      assert.deepEqual(a.inputEvents.map(({type,target,isTrusted,detail,button})=>({type,target,isTrusted,detail,button})),
        ['mousedown','mouseup','click','mousedown','mouseup','click'].map(type=>({type,target:'submit',isTrusted:false,detail:2,button:0})));
    }else {
      const characters=Array.from('AB'+literalInput),expected=[];let value='Base';
      for(const char of characters) {
        expected.push({type:'keydown',target:'text',isTrusted:false,key:char,value});value+=char;
        expected.push({type:'input',target:'text',isTrusted:false,key:null,value});
        for(const type of ['keypress','keyup'])expected.push({type,target:'text',isTrusted:false,key:char,value});
      }
      assert.deepEqual(a.inputEvents.map(({type,target,isTrusted,key,value})=>({type,target,isTrusted,key,value})),expected,'Original per-character input events differ');
      assert.deepEqual(a.inputEvents.filter(event=>event.type==='input').map(event=>event.data),characters);
      assert.equal(a.inputValue,'BaseAB'+literalInput);
    }
    assert(a.inputEvents.every(event=>Number.isFinite(event.at)&&event.at>=0),'Actual input event timestamps are missing');
    assert(a.inputEvents.every((event,i)=>i===0||event.at>=a.inputEvents[i-1].at),'Actual input event order changed');
  }
  for (const key of resourceKeys) {
    assert(Number.isInteger(cleanup.before?.[key]) && cleanup.before[key] >= 0, `Missing actual ${key} baseline`);
    assert.equal(cleanup.after?.[key], cleanup.before[key], `${key} did not return to the actual baseline`);
  }
  return {caseId: plan.caseId, contractSha256: plan.contractSha256, assertions: [...plan.requiredAssertions],
    originalInput: plan.definition.input, originalExpected: plan.definition.expected, oraclePassed: true};
}
