// R1.9.5 source-bound regression: real installed tool code and original preview.
// The Node fixture is NOT an installed Chrome or live-site acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const ROOT='examples/sidebar-tools/prompt-shortcuts';
const file=relative=>readFile(ROOT+'/'+relative,'utf8');
function between(source,start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from);
  assert(from>=0&&to>from,'expected real function boundaries');
  return source.slice(from,to);
}

test('R1.9.5 webpage rail defaults expanded, keeps its background and remains manually collapsible',async()=>{
  const page=await file('trusted/page.js');
  const preview=await file('preview/index.html');
  assert.match(page,/let compactExpanded=true;/);
  assert.match(page,/compactExpanded=true;clearFeedback\(\);hideTip\(\);/);
  assert.match(page,/if\(compact&&!compactExpanded\)\{schedule\(\);return;\}/);
  assert.match(page,/background:var\(--od-rail-bg\);border:1px solid var\(--od-rail-border\);/);
  assert.doesNotMatch(page,/insert\(row,event\)\.finally/);
  assert.match(preview,/let previewCompactExpanded=true;/);
  assert.match(preview,/background:var\(--stage-bubble\);box-shadow:0 6px/);
  assert.doesNotMatch(preview,/usePrompt\(item\)\.finally/);
});

test('R1.9.5 current iframe Cancel/Back discards a draft directly, but never exits during unknown writes',async()=>{
  const js=await file('src/main.js'),html=await file('src/index.html');
  const snippet=between(js,'function back(callback=index){','function start(');
  const context={runs:0,errors:[]};
  const api=new Function('ctx',
    'let busy=false,uploadBusy=false,transferBusy=false,siteBusy=false,siteUnconfirmedWrite=false,unconfirmedWrite=false;'+
    'const index=()=>ctx.runs++;const error=msg=>ctx.errors.push(msg);'+snippet+
    'return {back,setBusy:v=>busy=v,setUnknown:v=>unconfirmedWrite=v,setSiteUnknown:v=>siteUnconfirmedWrite=v};')(context);
  api.back();assert.equal(context.runs,1,'dirty draft returns directly');
  api.setBusy(true);api.back();assert.equal(context.runs,1);
  api.setBusy(false);api.setUnknown(true);api.back();
  assert.equal(context.runs,1);assert.match(context.errors[0],/结果尚未确认/);
  api.setUnknown(false);api.setSiteUnknown(true);api.back();
  assert.equal(context.runs,1);
  api.setSiteUnknown(false);api.back();assert.equal(context.runs,2);
  assert.doesNotMatch(js,/ps-leave|ps-stay|ps-discard|pendingLeave/);
  assert.doesNotMatch(html,/id="ps-leave"/);
  assert.match(js,/uploadBusy\|\|unconfirmedWrite\|\|siteUnconfirmedWrite/);
  assert.match(html,/id="ps-image-file"/);
  assert.match(html,/id="ps-image-url"/);
});

test('R1.9.5 original preview has direct Back without the previous blocking inline warning',async()=>{
  const preview=await file('preview/index.html');
  const js=[...preview.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
  assert.equal(js.length,1);
  new Function(js[0]); // parse the actual complete preview, do not execute its DOM boot.
  assert.doesNotMatch(preview,/id="leaveConfirm"/);
  const snippet=between(js[0],"function requestBack(destination='index'){","function returnIndex(){");
  const run=overrides=>{
    const ctx={actions:[],error:{hidden:true,textContent:''},...overrides};
    const fn=new Function('ctx',
      'let saving=Boolean(ctx.saving),imageUploadBusy=Boolean(ctx.imageUploadBusy),currentView="form";'+
      'const el=()=>ctx.error;const showFormError=s=>ctx.actions.push("blocked:"+s);'+
      'const exitTool=()=>ctx.actions.push("host");const returnIndex=()=>ctx.actions.push("index");'+
      snippet+'return requestBack;')(ctx);
    return {ctx,fn};
  };
  const ordinary=run();ordinary.fn('index');ordinary.fn('host');
  assert.deepEqual(ordinary.ctx.actions,['index','host']);
  const saving=run({saving:true});saving.fn('index');assert.match(saving.ctx.actions[0],/^blocked:/);
  const unknown=run({error:{hidden:false,textContent:'E_OUTCOME_UNKNOWN'}});
  unknown.fn('index');assert.match(unknown.ctx.actions[0],/^blocked:E_OUTCOME_UNKNOWN/);
  assert.match(preview,/id="imageDropzone"/);
  assert.match(preview,/id="imageReplace"/);
});

test('R1.9.5 Host skips duplicate prompt confirmation but retains write-busy guard and other tools confirmation',async()=>{
  const host=await readFile('src/ui/sidebar-tools.js','utf8');
  const section=between(host,'function canLeave(onApproved) {','function mountTool(');
  assert(section.indexOf('if(toolSaving)')>=0);
  assert(section.indexOf('if(active?.id===PROMPT_ID)return true;')>section.indexOf('if(toolSaving)'));
  assert(section.indexOf('if(toolDirty||isDirty())')>section.indexOf('if(active?.id===PROMPT_ID)return true;'));
});

test('R1.9.5 distributable remains source-bound and seeds exactly three editable text prompts',async()=>{
  const candidate=await createSidebarToolPackage(ROOT);
  const released=JSON.parse(await file('prompt-shortcuts.opendesk-tool.json'));
  const config=JSON.parse(await file('tool.config.json'));
  const admission=await readFile('src/ui/trusted-prompt-admission.js','utf8');
  assert.deepEqual(released,candidate,'official installation package must match current source-built candidate');
  assert.equal(released.version,config.version);
  assert(admission.includes("TRUSTED_PROMPT_VERSION='"+released.version+"'"));
  assert.equal(released.initialData.library.items.length,3);
  assert.deepEqual(released.initialData.library.items.map(row=>row.label),['插件','外包','提示']);
});
