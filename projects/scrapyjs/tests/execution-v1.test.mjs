import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {
  CONTRACT_VERSION,CONTRACT_SCHEMA,HEADER_CLASSES,classifyHeader,ContractError,
  validateShape,validateRecipe,validateHeaderProfile,validateNetworkProfile,
  validateNodeCapabilities,validateExecutionPlan,validateOrigin,validateTargetUrl,
  evaluateExecution,assertExecutable,validateRunReceipt,hashRecipe,verifyRecipeHash
} from '../contracts/execution-v1.mjs';
const copy=x=>structuredClone(x);
const LIMITS={maxPages:3,maxRequests:5,maxResponseBytes:65536,maxTotalBytes:196608,deadlineMs:45000,maxRedirects:2};
const ORIGIN='https://example.com';
async function fixture() {
  const recipe={schemaVersion:CONTRACT_VERSION,recipeId:'recipe:sample',version:'1.0.0',sha256:'0'.repeat(64),
    description:'Public example catalog',target:{url:ORIGIN+'/catalog?page=1',origins:[ORIGIN],session:'none'},
    extraction:{kind:'dom',fields:[{name:'标题',selector:'.item h2',read:'text'}]},
    limits:copy(LIMITS)};
  recipe.sha256=await hashRecipe(recipe,webcrypto.subtle);
  const headers={schemaVersion:CONTRACT_VERSION,profileId:'headers:default',version:'1.0.0',
    entries:[],userAgent:{mode:'inherit'}};
  const network={schemaVersion:CONTRACT_VERSION,profileId:'network:default',version:'1.0.0',mode:'browser-current'};
  const node={schemaVersion:CONTRACT_VERSION,nodeId:'node:browser',kind:'browser-tab',availability:'verified',
    evidenceRef:'trusted-host:fixture-only',approvedOrigins:[ORIGIN],supportedExtraction:['dom'],
    supportedNetworks:['browser-current'],verifiedHeaderNames:[],javascriptRendering:true,
    canOverrideUserAgent:false,canUseCredentialRefs:false,canUseCurrentTabSession:true,
    enforcesDnsGuard:true,inspectsRedirects:true,stopReadback:true,resultReadback:true,
    cellularBindingVerified:false,egressVerification:false,maxLimits:copy(LIMITS)};
  const plan={schemaVersion:CONTRACT_VERSION,planId:'plan:sample',recipeId:recipe.recipeId,
    recipeVersion:recipe.version,recipeHash:recipe.sha256,phase:'trial',
    executionKind:node.kind,nodeId:node.nodeId,headerProfileId:headers.profileId,
    headerProfileVersion:headers.version,networkProfileId:network.profileId,
    networkProfileVersion:network.version,limits:copy(LIMITS),
    approval:{approvalRef:'approval:fixture-only',approvedOrigin:ORIGIN,executionKind:node.kind,
      networkMode:network.mode,headerProfileId:headers.profileId,permissions:['read']}};
  return {recipe,plan,headers,network,node};
}
const has=(bundle,code)=>evaluateExecution(bundle).reasons.some(r=>r.code===code);
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof ContractError&&e.code===code);
const base=await fixture();
test('portable JSON Schema is generated from exactly one Browser authority',async()=>{
  const generated=JSON.parse(await readFile(new URL('../contracts/execution-v1.schema.json',import.meta.url)));
  assert.deepEqual(generated,CONTRACT_SCHEMA);
  assert.deepEqual(Object.keys(generated.$defs).sort(),[
    'ExecutionPlan','ExtractionField','HeaderEntry','HeaderProfile','Limits','NetworkProfile','NodeCapabilities','Recipe','RunReceipt'].sort());
});
test('valid Browser DOM sample and deterministic immutable hash',async()=>{
  const b=copy(base);
  assert.equal(assertExecutable(b).supported,true);
  assert.equal(await verifyRecipeHash(b.recipe,webcrypto.subtle),true);
  assert.equal(await hashRecipe(b.recipe,webcrypto.subtle),await hashRecipe({...b.recipe},webcrypto.subtle));
  b.recipe.extraction.fields[0].selector='.other';
  await assert.rejects(verifyRecipeHash(b.recipe,webcrypto.subtle),e=>e.code==='E_RECIPE_HASH');
});
test('schema is strict at every level and does not accept executable properties',()=>{
  const a=copy(base);a.recipe.payload='async function main(){}';reject(()=>validateRecipe(a.recipe),'E_SCHEMA');
  const b=copy(base);b.recipe.target.redirectTo='http://localhost';reject(()=>validateRecipe(b.recipe),'E_SCHEMA');
  const c=copy(base);c.plan.approval.grant=true;reject(()=>validateExecutionPlan(c.plan),'E_SCHEMA');
  const d=copy(base);d.node.sshCommand='curl';reject(()=>validateNodeCapabilities(d.node),'E_SCHEMA');
  const e=copy(base);e.headers.entries=[{name:'accept',value:'*/*',executable:true}];reject(()=>validateHeaderProfile(e.headers),'E_SCHEMA');
});
test('never accepts private destinations or credentialed URLs',()=>{
  for(const origin of ['http://example.com','https://127.0.0.1','https://192.168.1.1',
    'https://169.254.169.254','https://localhost','https://metadata.google.internal',
    'https://internal.local','https://[::1]','https://example.com:8443','https://x.test',
    'https://user:pass@example.com'])reject(()=>validateOrigin(origin),'E_ORIGIN');
  reject(()=>validateTargetUrl('https://example.com.evil.net/path',ORIGIN),'E_TARGET');
  reject(()=>validateTargetUrl('https://example.com/path#secret',ORIGIN),'E_TARGET');
  assert.equal(validateOrigin('http://127.0.0.1:43111',{fixture:true}),'http://127.0.0.1:43111');
  reject(()=>validateOrigin('http://127.0.0.1:43112',{fixture:true}),'E_ORIGIN');
});
test('separately authorized and forbidden header categories',()=>{
  assert.equal(classifyHeader('Accept'),'configurable');
  assert.equal(classifyHeader('x-job-id'),'configurable');
  assert.equal(classifyHeader('User-Agent'),'environment-managed');
  assert.equal(classifyHeader('Sec-CH-UA'),'environment-managed');
  assert.equal(classifyHeader('cookie'),'separately-authorized');
  assert.equal(classifyHeader('Authorization'),'separately-authorized');
  for(const n of ['host','origin','referer','connection','transfer-encoding','proxy-authorization',
    'x-forwarded-for','x-original-host','x-real-ip','forwarded','sec-fetch-mode','set-cookie']){
    const b=copy(base);b.headers.entries=[{name:n,value:'anything'}];
    reject(()=>validateHeaderProfile(b.headers),'E_HEADER');
  }
  assert.ok(HEADER_CLASSES.unsupported.includes('host'));
});
test('header canonicalization and CRLF injection fail closed',()=>{
  const a=copy(base);a.headers.entries=[{name:'Accept',value:'application/json'}];
  reject(()=>validateHeaderProfile(a.headers),'E_HEADER');
  const b=copy(base);b.headers.entries=[{name:'accept',value:'ok'},{name:'accept',value:'no'}];
  reject(()=>validateHeaderProfile(b.headers),'E_HEADER');
  const c=copy(base);c.headers.entries=[{name:'x-job-id',value:'one\r\nInjected: yes'}];
  reject(()=>validateHeaderProfile(c.headers),'E_HEADER');
  const d=copy(base);d.headers.userAgent={mode:'override',value:'UA\r\nCookie: secret'};
  reject(()=>validateHeaderProfile(d.headers),'E_HEADER');
});
test('Browser tab cannot claim network-request header control for DOM navigation',()=>{
  const b=copy(base);b.headers.entries=[{name:'accept',value:'application/json'}];
  assert.equal(has(b,'E_HEADER_UNSUPPORTED'),true);
  b.node.verifiedHeaderNames=['accept'];
  reject(()=>evaluateExecution(b),'E_NODE_CAPABILITIES');
});
test('Desktop HTTP supports static HTML, not JS DOM, by verified capability only',()=>{
  const b=copy(base);
  b.node={...b.node,nodeId:'node:desktop-http',kind:'desktop-http',supportedExtraction:['static-html'],
    supportedNetworks:['direct'],verifiedHeaderNames:['accept','x-client-tag'],javascriptRendering:false,
    canUseCurrentTabSession:false,evidenceRef:'trusted-desktop:sample-only'};
  b.plan.executionKind='desktop-http';b.plan.nodeId=b.node.nodeId;
  b.plan.approval.executionKind='desktop-http';b.plan.approval.networkMode='direct';
  b.network.mode='direct';
  b.headers.entries=[{name:'accept',value:'text/html'}];
  assert.equal(has(b,'E_EXTRACTION_UNSUPPORTED'),true);
  b.recipe.extraction.kind='static-html';
  assert.equal(evaluateExecution(b).supported,true);
  b.node.javascriptRendering=true;
  reject(()=>evaluateExecution(b),'E_NODE_CAPABILITIES');
});
test('Android cellular requires verified route, consent, egress attestation and static HTML',()=>{
  const b=copy(base);
  b.node={...b.node,nodeId:'node:android',kind:'android-cellular',
    supportedExtraction:['static-html'],supportedNetworks:['cellular'],javascriptRendering:false,
    canUseCurrentTabSession:false,cellularBindingVerified:false,egressVerification:false,
    availability:'unverified',evidenceRef:'poc-source-not-real-device'};
  b.plan.executionKind='android-cellular';b.plan.nodeId=b.node.nodeId;
  b.plan.approval.executionKind='android-cellular';b.plan.approval.networkMode='cellular';
  b.network.mode='cellular';b.recipe.extraction.kind='static-html';
  assert.equal(has(b,'E_NODE_UNVERIFIED'),true);
  assert.equal(has(b,'E_CELLULAR_PROOF'),true);
  b.node.availability='verified';b.node.cellularBindingVerified=true;b.node.egressVerification=true;
  b.plan.approval.permissions.push('cellular-use');
  assert.equal(evaluateExecution(b).supported,true);
});
test('current tab credentials cannot be silently transferred to desktop or Android',()=>{
  const b=copy(base);
  b.recipe.target.session='current-tab';b.plan.approval.permissions.push('session-use');
  assert.equal(evaluateExecution(b).supported,true);
  b.node.kind='desktop-browser';b.node.supportedNetworks=['direct'];b.node.canUseCurrentTabSession=false;
  b.network.mode='direct';b.plan.executionKind='desktop-browser';b.plan.nodeId=b.node.nodeId;
  b.plan.approval.executionKind='desktop-browser';b.plan.approval.networkMode='direct';
  assert.equal(has(b,'E_SESSION'),true);
});
test('User-Agent override and credential refs require separate consent and engine proof',()=>{
  const b=copy(base);b.headers.userAgent={mode:'override',value:'ApprovedAgent/1.0'};
  assert.equal(has(b,'E_UA_UNSUPPORTED'),true);
  b.node.canOverrideUserAgent=true;b.plan.approval.permissions.push('ua-override');
  assert.equal(evaluateExecution(b).supported,true);
  b.headers.credentialRef='vault:authorized-entry';
  assert.equal(has(b,'E_CREDENTIAL_UNSUPPORTED'),true);
  b.node.canUseCredentialRefs=true;b.plan.approval.permissions.push('credential-use');
  assert.equal(evaluateExecution(b).supported,true);
});
test('proxy profiles require approved ref and exact per-task execution consent',()=>{
  const b=copy(base);b.network.mode='approved-proxy';
  reject(()=>validateNetworkProfile(b.network),'E_NETWORK_PROFILE');
  b.network.proxyRef='proxy:stored-approved-profile';
  b.plan.approval.networkMode='approved-proxy';
  assert.equal(has(b,'E_PROXY_APPROVAL'),true);
  assert.equal(has(b,'E_NETWORK_UNSUPPORTED'),true);
  b.node.kind='desktop-browser';b.node.supportedNetworks=['approved-proxy'];b.node.nodeId='node:desktop-browser';
  b.plan.executionKind='desktop-browser';b.plan.nodeId=b.node.nodeId;b.plan.approval.executionKind='desktop-browser';
  b.plan.approval.permissions.push('proxy-use');
  assert.equal(evaluateExecution(b).supported,true);
});
test('approval and profile snapshots cannot be cross-bound or expanded',()=>{
  const b=copy(base);b.plan.approval.approvedOrigin='https://other.example.com';
  assert.equal(has(b,'E_APPROVAL_SCOPE'),true);
  const c=copy(base);c.plan.recipeHash='0'.repeat(64);
  assert.equal(has(c,'E_RECIPE_BINDING'),true);
  const d=copy(base);d.plan.headerProfileVersion='2.0.0';
  assert.equal(has(d,'E_PROFILE_BINDING'),true);
  const e=copy(base);e.plan.approval.permissions=[];
  reject(()=>validateExecutionPlan(e.plan),'E_SCHEMA');
});
test('trial is capped to three pages; full run requires separate consent and trial proof',()=>{
  const b=copy(base);b.plan.limits.maxPages=4;b.plan.limits.maxRequests=5;
  reject(()=>validateExecutionPlan(b.plan),'E_TRIAL_PAGES');
  const c=copy(base);c.plan.phase='full';
  reject(()=>validateExecutionPlan(c.plan),'E_FULL_APPROVAL');
  c.plan.trialReceiptRef='receipt:verified-sample';
  c.plan.approval.permissions.push('full-run');
  assert.equal(evaluateExecution(c).supported,true);
});
test('runtime DNS and redirect inspection must be positively attested',()=>{
  const b=copy(base);b.node.enforcesDnsGuard=false;b.node.inspectsRedirects=false;
  assert.equal(has(b,'E_SSRF_GUARD'),true);
  const c=copy(base);c.node.stopReadback=false;
  assert.equal(has(c,'E_RECEIPT'),true);
});
test('effective limits never exceed recipe or node and internal budgets remain coherent',()=>{
  const a=copy(base);a.plan.limits.maxTotalBytes=200000;
  assert.equal(has(a,'E_RECIPE_LIMIT'),true);
  const b=copy(base);b.node.maxLimits.maxPages=2;
  assert.equal(has(b,'E_NODE_LIMIT'),true);
  const c=copy(base);c.recipe.limits.maxRequests=2;
  reject(()=>validateRecipe(c.recipe),'E_LIMITS');
});
test('receipt cannot claim completed without independent readback and release',()=>{
  const plan=copy(base.plan);
  const receipt={schemaVersion:CONTRACT_VERSION,runId:'run:example',planId:plan.planId,recipeHash:plan.recipeHash,
    nodeId:plan.nodeId,executionKind:plan.executionKind,status:'completed',stopState:'none',
    retirementState:'released',startedAt:'2026-10-30T08:00:00Z',endedAt:'2026-10-30T08:00:10Z',
    counters:{requests:1,pages:1,bytes:4096,records:0},
    network:{expected:'browser-current',observed:'browser-current',egressVerified:false,evidenceRef:null},
    result:{sha256:'a'.repeat(64),readbackVerified:true,evidenceRef:'independent:readback'},errorCode:null,idempotencyKey:'idemp:one'};
  assert.equal(validateRunReceipt(receipt,plan),receipt);
  const bad=copy(receipt);bad.result.readbackVerified=false;
  reject(()=>validateRunReceipt(bad,plan),'E_RESULT_UNVERIFIED');
  const bad2=copy(receipt);bad2.retirementState='pending';
  reject(()=>validateRunReceipt(bad2,plan),'E_RESULT_UNVERIFIED');
  const bad3=copy(receipt);bad3.network.observed='cellular';bad3.network.egressVerified=true;
  reject(()=>validateRunReceipt(bad3,plan),'E_EGRESS_PROOF');
  const bad4=copy(receipt);bad4.counters.requests=100;
  reject(()=>validateRunReceipt(bad4,plan),'E_RECEIPT_BUDGET');
});
test('Stop acknowledgement is not a released instance; unknown is not a completed run',()=>{
  const b=copy(base);
  const receipt={schemaVersion:CONTRACT_VERSION,runId:'run:stopped',planId:b.plan.planId,
    recipeHash:b.plan.recipeHash,nodeId:b.plan.nodeId,executionKind:b.plan.executionKind,status:'stopped',
    stopState:'requested',retirementState:'pending',startedAt:'2026-10-30T08:00:00Z',endedAt:null,
    counters:{requests:1,pages:0,bytes:0,records:0},
    network:{expected:'browser-current',observed:'unknown',egressVerified:false,evidenceRef:null},
    result:{sha256:null,readbackVerified:false,evidenceRef:null},errorCode:null,idempotencyKey:'idemp:stop'};
  reject(()=>validateRunReceipt(receipt,b.plan),'E_STOP_UNVERIFIED');
  receipt.stopState='accepted';receipt.retirementState='released';receipt.endedAt='2026-10-30T08:00:10Z';
  assert.equal(validateRunReceipt(receipt,b.plan),receipt);
  receipt.status='unknown';reject(()=>validateRunReceipt(receipt,b.plan),'E_RECEIPT_STATUS');
});
test('URL parser permits single exact trusted localhost fixture only for browser Task',async()=>{
  const b=await fixture();
  b.recipe.target={url:'http://127.0.0.1:43111/demo-form.html',origins:['http://127.0.0.1:43111'],session:'none'};
  b.recipe.sha256=await hashRecipe(b.recipe,webcrypto.subtle);b.plan.recipeHash=b.recipe.sha256;
  b.plan.approval.approvedOrigin=b.recipe.target.origins[0];
  b.node.approvedOrigins.push(b.recipe.target.origins[0]);
  assert.equal(evaluateExecution(b).supported,true);
  b.node.kind='android-cellular';b.node.supportedNetworks=['cellular'];b.node.supportedExtraction=['static-html'];
  b.node.javascriptRendering=false;b.node.canUseCurrentTabSession=false;
  b.network.mode='cellular';b.plan.executionKind='android-cellular';b.plan.approval.executionKind='android-cellular';
  b.plan.approval.networkMode='cellular';
  reject(()=>evaluateExecution(b),'E_NODE_ORIGIN');
});
