/**
 * ScrapyJS R2.4.1: independent, fail-closed static HTTP trial business adapter.
 * The existing Browser/Native transport must provide real trust and networking.
 * Neither an iframe's approvalRef nor NodeCapabilities are runtime grants.
 */
import {
  assertExecutable, verifyRecipeHash, validateTargetUrl, validateRunReceipt,
  classifyHeader
} from '../contracts/execution-v1.mjs';

const CAP = Object.freeze({pages:3, requests:3, pageBytes:65536,
  totalBytes:196608, deadlineMs:60000, rows:1000});
const encoder = new TextEncoder();
const bytes = value => encoder.encode(value).byteLength;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const failure = (code, message=code) => Object.assign(new Error(message), {code});
const requireValue = (condition, code) => {if(!condition)throw failure(code);};
const unsafe = name => ['__proto__','constructor','prototype'].includes(name);
const fieldName = name => typeof name==='string' &&
  /^[\p{L}_][\p{L}\p{N}_-]{0,63}$/u.test(name) && !unsafe(name);
const attrName = name => typeof name==='string' &&
  /^[a-zA-Z_:][a-zA-Z0-9_:.-]{0,63}$/.test(name);
const pathPart = part => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(part) && !unsafe(part);
async function sha(value, cryptoSubtle) {
  requireValue(Boolean(cryptoSubtle),'E_HASH_UNAVAILABLE');
  const digest=await cryptoSubtle.digest('SHA-256',encoder.encode(value));
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
function selector(value){
  requireValue(typeof value==='string'&&value.length>0&&value.length<=1024&&
    !/[\x00-\x1f]/.test(value)&&!/^\s*(?:\/\/|xpath:|javascript:)/i.test(value),'E_SELECTOR');
  return value==='.'?':scope':value;
}
function one(root,css){
  if(css===':scope')return root;
  try{return root.querySelector(css);}catch{throw failure('E_SELECTOR');}
}
function many(root,css){
  if(!css)return [root];
  try{return Array.from(root.querySelectorAll(css));}catch{throw failure('E_SELECTOR');}
}

/** Reuse the CSS/text/attribute subset of the existing ScrapyJS itemConfig.
 * Nested, many, XPath and processing syntax must not be silently reinterpreted.
 */
export function legacyStaticFields(itemConfig){
  requireValue(plain(itemConfig),'E_FIELDS');
  const fields=[];
  for(const [name,rule] of Object.entries(itemConfig)){
    if(name==='_listContainer'||name==='_listItem')continue;
    requireValue(fieldName(name),'E_FIELD');
    let css,read,attribute;
    if(typeof rule==='string'){
      const match=/^(.+)::([a-zA-Z][a-zA-Z0-9:_-]*)$/.exec(rule);
      requireValue(Boolean(match),'E_STATIC_FIELD_UNSUPPORTED');
      css=selector(match[1].trim());
      read=match[2]==='text'?'text':'attribute';
      if(read==='attribute')attribute=match[2];
    }else if(plain(rule)&&typeof rule.selector==='string'&&
      ['text','attr'].includes(rule.read)&&
      ['one',undefined].includes(rule.cardinality)&&
      Object.keys(rule).every(k=>['selector','read','attr','cardinality'].includes(k))){
      css=selector(rule.selector.trim());
      read=rule.read==='attr'?'attribute':'text';
      attribute=read==='attribute'?rule.attr:undefined;
      requireValue(read==='attribute'||rule.attr===undefined,'E_FIELD');
    }else throw failure('E_STATIC_FIELD_UNSUPPORTED');
    if(read==='attribute')requireValue(attrName(attribute),'E_FIELD');
    fields.push({name,selector:css,read,...(attribute?{attribute}:{})});
  }
  requireValue(fields.length>=1&&fields.length<=32,'E_FIELDS');
  return fields;
}

/** Inert downloaded HTML, never executed as JS or inserted into live page DOM. */
export function extractStaticHtml(html,{fields,listContainer,listItem}={},parseHtml){
  requireValue(typeof html==='string'&&html.length>0,'E_HTML_BODY');
  requireValue(Array.isArray(fields)&&fields.length>=1&&fields.length<=32,'E_FIELDS');
  const parse=parseHtml??(text=>new DOMParser().parseFromString(text,'text/html'));
  const doc=parse(html);
  requireValue(doc&&typeof doc.querySelector==='function','E_HTML_PARSER');
  const root=listContainer?one(doc,selector(listContainer)):doc;
  if(!root)return [];
  const items=many(root,listItem?selector(listItem):null);
  requireValue(items.length<=CAP.rows,'E_ROW_LIMIT');
  const names=new Set();
  for(const field of fields){
    requireValue(plain(field)&&fieldName(field.name)&&!names.has(field.name)&&
      ['text','attribute'].includes(field.read),'E_FIELD');
    selector(field.selector);
    requireValue(field.read==='text'?field.attribute===undefined:attrName(field.attribute),'E_FIELD');
    names.add(field.name);
  }
  return items.map(item=>{
    const row=Object.create(null);
    for(const field of fields){
      const element=one(item,selector(field.selector));
      if(!element)continue;
      const value=field.read==='text'?element.textContent?.trim():element.getAttribute(field.attribute);
      if(value!==undefined&&value!==null)row[field.name]=value;
    }
    return row;
  });
}

/** JSON mapping is an auxiliary parser only: execution.v1 has no JSONPath field.
 * Do NOT manufacture a v1 RunReceipt for this function.
 */
export function extractStaticJson(text,mapping,{rootPath=''}={}){
  requireValue(typeof text==='string'&&bytes(text)<=CAP.pageBytes,'E_JSON_BODY');
  requireValue(plain(mapping)&&Object.keys(mapping).length>=1&&Object.keys(mapping).length<=32,'E_JSON_MAPPING');
  const mappings=Object.entries(mapping).map(([name,path])=>{
    requireValue(fieldName(name)&&typeof path==='string'&&path.length<=128,'E_JSON_MAPPING');
    const parts=path.split('.');
    requireValue(parts.length<=4&&parts.every(pathPart),'E_JSON_MAPPING');
    return [name,parts];
  });
  requireValue(rootPath===''||pathPart(rootPath),'E_JSON_ROOT');
  let data;
  try{data=JSON.parse(text);}catch{throw failure('E_JSON_PARSE');}
  const source=rootPath?data?.[rootPath]:data;
  const rows=Array.isArray(source)?source:[source];
  requireValue(rows.length<=CAP.rows&&rows.every(plain),'E_JSON_ROWS');
  return rows.map(item=>{
    const row=Object.create(null);
    for(const [name,parts] of mappings){
      let value=item;
      for(const part of parts)value=plain(value)?value[part]:undefined;
      if(typeof value==='string'||typeof value==='boolean'||
        typeof value==='number'&&Number.isFinite(value))row[name]=value;
    }
    return row;
  });
}
function normalizeHeaders(profile){
  requireValue(!profile.credentialRef&&profile.userAgent.mode==='inherit','E_CREDENTIAL_OR_UA_UNATTESTED');
  const headers=Object.create(null);
  for(const item of profile.entries){
    requireValue(classifyHeader(item.name)==='configurable'&&
      !Object.hasOwn(headers,item.name),'E_HEADER');
    headers[item.name]=item.value;
  }
  return headers;
}
function reviewedTargets(recipe,plan,urls){
  requireValue(plan.phase==='trial'&&recipe.extraction.kind==='static-html'&&
    recipe.target.session==='none','E_STATIC_ONLY');
  requireValue(plan.limits.maxPages<=CAP.pages&&plan.limits.maxRequests<=CAP.requests&&
    plan.limits.maxResponseBytes<=CAP.pageBytes&&
    plan.limits.maxTotalBytes<=CAP.totalBytes&&
    plan.limits.deadlineMs<=CAP.deadlineMs&&plan.limits.maxRedirects===0,'E_TRIAL_LIMITS');
  requireValue(Array.isArray(urls)&&urls.length>=1&&urls.length<=CAP.pages&&
    urls.length<=plan.limits.maxPages&&urls.length<=plan.limits.maxRequests&&
    urls[0]===recipe.target.url,'E_URL_LIST');
  const seen=new Set();
  return urls.map(url=>{
    // No fixed local test fixture can be converted into a production HTTP grant.
    const canonical=validateTargetUrl(url,recipe.target.origins[0]);
    requireValue(!seen.has(canonical),'E_URL_DUPLICATE');
    seen.add(canonical);
    return canonical;
  });
}

/** Host adapter is the ONLY authority:
 * - admit independently rechecks installed package/Recipe SHA/grants/actual
 *   node identity and capability, returning a trusted opaque admission.
 * - get guarantees DNS + selected peer IP checks, no redirect, no credentials,
 *   streamed byte limits and AbortSignal enforcement.
 * - persistAndReadback saves under run identity, independently reads records
 *   back, and returns {readbackRecords,receipt} for strict verification.
 * A browser network.request projection alone does NOT meet this contract.
 */
export function createStaticHttpTrialRunner(host,{parseHtml,subtle=globalThis.crypto?.subtle}={}){
  let active=null;
  function stop(){
    if(!active)return {requested:false,retired:false};
    active.abort(failure('E_CANCELLED'));
    return {requested:true,retired:false}; // Never claim native retirement.
  }
  async function run(bundle,urls,{listContainer,listItem}={}){
    requireValue(!active,'E_RUN_BUSY');
    requireValue(host&&['admit','get','persistAndReadback'].every(k=>typeof host[k]==='function'),
      'E_TRUSTED_HOST_REQUIRED');
    assertExecutable(bundle); // Contract only, not authorization.
    await verifyRecipeHash(bundle.recipe,subtle);
    const targets=reviewedTargets(bundle.recipe,bundle.plan,urls);
    const headers=normalizeHeaders(bundle.headers);
    const controller=new AbortController();
    active=controller;
    const deadline=setTimeout(()=>controller.abort(failure('E_TIMEOUT')),bundle.plan.limits.deadlineMs);
    let requests=0,totalBytes=0;
    const rows=[],pages=[];
    try{
      const admission=await host.admit({bundle,urls:targets,headers,signal:controller.signal});
      requireValue(admission!==null&&admission!==undefined,'E_APPROVAL_DENIED');
      if(controller.signal.aborted)throw controller.signal.reason;
      for(const url of targets){
        if(controller.signal.aborted)throw controller.signal.reason;
        requests++;
        const response=await host.get({admission,url,headers,
          timeoutMs:Math.min(15000,bundle.plan.limits.deadlineMs),
          maxBytes:bundle.plan.limits.maxResponseBytes,signal:controller.signal});
        if(controller.signal.aborted)throw controller.signal.reason;
        requireValue(response&&response.status===200&&response.finalUrl===url&&
          response.redirectCount===0&&response.mediaType==='text/html'&&
          typeof response.body==='string','E_HTTP_RESPONSE');
        const n=bytes(response.body);
        requireValue(n<=bundle.plan.limits.maxResponseBytes,'E_RESPONSE_BYTES');
        totalBytes+=n;
        requireValue(totalBytes<=bundle.plan.limits.maxTotalBytes,'E_TOTAL_BYTES');
        const extracted=extractStaticHtml(response.body,{fields:bundle.recipe.extraction.fields,
          listContainer,listItem},parseHtml);
        rows.push(...extracted);
        requireValue(rows.length<=CAP.rows,'E_ROW_LIMIT');
        pages.push({url,decodedUtf8Bytes:n,textSha256:await sha(response.body,subtle),
          records:extracted.length,status:200});
      }
      const resultSha256=await sha(JSON.stringify(rows),subtle);
      if(controller.signal.aborted)throw controller.signal.reason;
      const persisted=await host.persistAndReadback({admission,plan:bundle.plan,
        records:rows,resultSha256,pages,
        counters:{requests,pages:pages.length,bytes:totalBytes,records:rows.length},
        signal:controller.signal});
      if(controller.signal.aborted)throw controller.signal.reason;
      requireValue(persisted&&Array.isArray(persisted.readbackRecords)&&
        persisted.receipt?.result?.sha256===resultSha256,'E_RESULT_READBACK');
      const fromStorage=await sha(JSON.stringify(persisted.readbackRecords),subtle);
      requireValue(fromStorage===resultSha256,'E_RESULT_HASH_MISMATCH');
      validateRunReceipt(persisted.receipt,bundle.plan);
      const counters=persisted.receipt.counters;
      requireValue(persisted.receipt.status==='completed'&&
        counters.requests===requests&&counters.pages===pages.length&&
        counters.bytes===totalBytes&&counters.records===rows.length,'E_RECEIPT_COUNTERS');
      return {status:'completed',records:persisted.readbackRecords,pages,resultSha256,
        headerEvidence:{configured:headers,submittedToHost:headers,
          serverObserved:null,wireObserved:null},
        receipt:persisted.receipt};
    }finally{clearTimeout(deadline);active=null;}
  }
  return Object.freeze({run,stop});
}

/** Accurate discovery only. Never expose an enabled run button based on this. */
export function assessCurrentBrowserNetwork(){
  return Object.freeze({
    availableForV1Production:false,
    reason:'E_SSRF_GUARD_AND_RECEIPT_HOST_MISSING',
    responseLimitBytes:12000, // Tool envelope, not transport stream cap.
    authorization:'per-request-trusted-click',
    userAgentWireVerified:false
  });
}
