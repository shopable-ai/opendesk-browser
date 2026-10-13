// D02/D03 — real Chrome + actual Side Panel clicks; no simulated RPC approvals.
import assert from 'node:assert/strict';
const URL='https://cdn.jsdelivr.net/npm/marked@15.0.12/lib/marked.umd.js';
const CODE=['// ==UserScript==','// @name R7.2 fixed marked test','// @require '+URL,
'// ==/UserScript==','async function main(){const html=globalThis.marked?.parse("**OpenDesk**");',
'if(!html?.includes("<strong>OpenDesk</strong>"))throw Error("E_REAL_MARKED");',
'return {library:"marked@15.0.12",html};}'].join('\n');
export async function runR72PageClassicCycle({sidebar,website,browser,base,extensionId,cdp,until,clickReal,report}){
  const proof={caseId:'D02/D03-R71-MANUAL-AB-PARTIAL',url:URL,world:'USER_SCRIPT',steps:[],status:'IN_PROGRESS'}, observed=[];
  report.tests.push(proof);
  const read=x=>sidebar.read(x);
  const status=id=>read('(function(){const el=document.getElementById('+JSON.stringify(id)+');return {state:el?.dataset?.state,text:el?.textContent}})()');
  const step=(name,value)=>proof.steps.push({name,value});
  async function type(selector,value){
    assert.equal(await read('(function(){const el='+selector+';if(!el||el.disabled)return false;el.focus();el.select();return true})()'),true);
    await sidebar.call('Input.insertText',{text:value});
    await until(()=>read(selector+'.value==='+JSON.stringify(value)),'real editor input',15000);
  }
  async function approve(label){
    const r=await until(async()=>{
      const s=await status('page-dependency-status');
      if(s.state==='error')throw Error(s.text);
      return await read('document.querySelector("#page-dependency-review")?.hidden===false')?true:null;
    },'real review for '+label,60000);
    assert(r);
    const text=await read('document.querySelector("#page-dependency-review-list").textContent');
    const sha=/SHA-256[：:\s]+([a-f0-9]{64})/.exec(text)?.[1];
    assert(sha,'downloaded bytes SHA must be shown');assert(text.includes(URL));
    await clickReal(sidebar,'document.querySelector("#page-dependency-review-list input[type=checkbox]")');
    await until(()=>read('!document.querySelector("#page-dependency-approve").disabled'),'human acknowledgment',15000);
    await clickReal(sidebar,'document.querySelector("#page-dependency-approve")');
    const lockId=await until(async()=>{
      const s=await status('page-dependency-status');
      if(s.state==='error')throw Error(s.text);
      return read('(function(){const sel=document.querySelector("#page-dependency-lock");return [...(sel?.options||[])].map(x=>x.value).find(x=>/^dep-lock-[a-f0-9]{64}$/.test(x))||null})()');
    },'independent owner lock',60000);
    step(label+'-review',{sha256:sha,lockId,text:text.slice(0,1400)});
    return {sha,lockId,text};
  }
  async function runAndSave(label){
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    if(!await read('document.querySelector("#page-preview-tools").open'))
      await clickReal(sidebar,'document.querySelector("#page-preview-tools > summary")');
    await until(()=>read('!document.querySelector("#page-preview-run").disabled'),'run enabled',20000);
    await clickReal(sidebar,'document.querySelector("#page-preview-run")');
    const outcome=await until(async()=>{
      const s=await status('page-preview-status');
      return s.state==='error'?{error:s.text}:
        s.state==='completed'?{value:await read('document.querySelector("#page-preview-result").textContent')}:null;
    },'real library invocation',60000);
    assert(!outcome.error,outcome.error||'');
    assert.match(outcome.value,/<strong>OpenDesk<\/strong>/);
    const receipt=JSON.parse(await read('document.querySelector("#page-preview-technical").textContent'));
    assert.equal(receipt.state,'preview-evaluated');assert.equal(receipt.world,'USER_SCRIPT');
    step(label+'-run',{result:outcome.value,sourceHash:receipt.sourceHash,tabId:receipt.tabId,documentId:receipt.documentId});
    await until(()=>read('!document.querySelector("#page-candidate-save").disabled'),'candidate Save button',12000);
    await clickReal(sidebar,'document.querySelector("#page-candidate-save")');
    const saved=await until(async()=>{
      const s=await status('page-candidate-status');
      return s.state==='error'?{error:s.text}:
        /已保存 Page Candidate/.test(s.text||'')?{receipt:s.text}:null;
    },'frozen saved Page Candidate',35000);
    assert(!saved.error,saved.error||'');
    step(label+'-save',saved.receipt);
  }
  let observer;
  try{
    const targets=await(await fetch(base+'/json/list')).json();
    const sw=targets.find(x=>x.type==='service_worker'&&x.url?.startsWith('chrome-extension://'+extensionId+'/')&&x.webSocketDebuggerUrl);
    assert(sw,'actual background network observer required');
    observer=await cdp(sw.webSocketDebuggerUrl);
    observer.on('Network.requestWillBeSent',e=>{if(e?.request?.url?.startsWith(URL))observed.push(e.request.url);});
    await observer.call('Network.enable');
    if(!await read('document.querySelector("#script-library-tools").open'))
      await clickReal(sidebar,'document.querySelector("#script-library-tools > summary")');
    await type('document.querySelector("#script-id")','r72-marked-a');
    await type('document.querySelector("#script-source")',CODE);
    await until(()=>read('document.querySelector("#page-dependency-panel").hidden===false&&'+
      '!document.querySelector("#page-dependency-prepare").disabled'),'new Classic inspection',30000);
    assert.equal(observed.length,0,'inspect must not fetch');
    await clickReal(sidebar,'document.querySelector("#page-dependency-prepare")');
    const a=await approve('program-a');await runAndSave('program-a');
    const fetched=observed.length;assert(fetched>0,'A must fetch the new version in Chrome');
    await type('document.querySelector("#script-id")','r72-marked-b');
    await until(()=>read('(function(){const n=document.querySelector("#page-dependency-list select");return !!n&&[...n.options].some(o=>o.value==="shared:'+a.sha+'")})()'),
      'B sees A SHA but no permission',30000);
    await until(()=>read('!document.querySelector("#page-preview-run").disabled'),'unapproved B run',15000);
    await clickReal(sidebar,'document.querySelector("#page-preview-run")');
    const blocked=await until(async()=>{const s=await status('page-preview-status');return s.state==='error'?s.text:null;},
      'unapproved B must fail',30000);
    assert.match(blocked,/E_DEPENDENCY_UNLOCKED|E_DEPENDENCY_PENDING/);
    step('program-b-before-approval',blocked);
    const picker='document.querySelector("#page-dependency-list select")';
    assert(await read('(function(){const n='+picker+';if(!n)return false;n.focus();return true})()'));
    for(const type of ['keyDown','keyUp'])await sidebar.call('Input.dispatchKeyEvent',{type,key:'End',code:'End',windowsVirtualKeyCode:35,nativeVirtualKeyCode:35});
    for(const type of ['keyDown','keyUp'])await sidebar.call('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
    await until(()=>read(picker+'.value==='+JSON.stringify('shared:'+a.sha)),'real SHA cache selection',15000);
    await until(()=>read('!document.querySelector("#page-dependency-prepare").disabled'),'reuse prepared',12000);
    await clickReal(sidebar,'document.querySelector("#page-dependency-prepare")');
    const b=await approve('program-b');
    assert.equal(b.sha,a.sha);assert.notEqual(b.lockId,a.lockId);
    assert.match(b.text,/获得方式：shared-content-cache/);
    assert.equal(observed.length,fetched,'second program must do zero CDN fetch');
    await runAndSave('program-b');
    proof.sha256=a.sha;proof.programLocks={a:a.lockId,b:b.lockId};
    proof.network={firstProgramRequests:fetched,secondProgramRequests:0};
    proof.status='CHROME_PASS_R71_MANUAL_AB_ONLY';
  }catch(error){
    proof.status='CHROME_FAIL';
    proof.error={code:error.code||'E_R72_NATIVE',message:String(error.message||error)};
    proof.networkObservedRequests=observed.length;
    throw error;
  }finally{observer?.close();}
}
