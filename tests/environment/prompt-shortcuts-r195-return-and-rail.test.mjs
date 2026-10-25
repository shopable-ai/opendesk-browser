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

test('R1.1 prompt rail no longer owns conversation dock',async()=>{
  const [page,preview,sidepanel]=await Promise.all([
    file('trusted/page.js'),file('preview/index.html'),file('src/index.html')]);
  assert.match(page,/background:var\(--od-rail-bg\);border:1px solid var\(--od-rail-border\);/);
  assert.match(preview,/background:var\(--ps-rail-bg\);box-shadow:var\(--ps-rail-shadow\);/);
  assert.match(page,/rail\.replaceChildren\(\);rail\.dataset\.imageSize=imageSize/);
  assert.match(page,/for\(const row of items\)/);
  assert.match(preview,/for\(const item of active\)/);
  assert.doesNotMatch(page,/compactExpanded|usesCompactMenu|data-scroll-conversation|dataset\.scrollConversation|\.nav-item/);
  assert.match(page,/brand\.addEventListener\('click',openSidebar\)/,'brand retains existing trusted panel open');
  assert.match(preview,/page-brand/,'brand is mirrored only in preview webpage rail');
  assert.doesNotMatch(preview,/previewCompactExpanded|starter-toggle|page-shortcut nav-preview/);
  assert.doesNotMatch(sidepanel,/ps-scroll-settings|data-scroll-nav=/,
    'management list must not restore the removed navigation switches');
  assert.match(preview,/id="previewScrollAdvanced"/,
    'optional navigation recovery remains under preview tool settings only');
  assert.doesNotMatch(page,/floatingHost|navigationSettings|installJumpToTop/,
    'Prompt runtime does not mount or configure conversation navigation');
  const floating=await readFile('examples/programs/chatgpt-jump-top/src/floating-navigation.js','utf8');
  assert.match(floating,/data-opendesk-ai-scroll-navigation/);
  assert.match(preview,/id="mockConversationNav"/);
  assert.match(preview,/el\('mockConversationBottom'\)\.addEventListener\('click'/);
  assert.match(preview,/el\('demoReplyBottom'\)\.addEventListener\('click'/);
  assert.doesNotMatch(page,/insert\(row,event\)\.finally/);
  assert.doesNotMatch(preview,/usePrompt\(item\)\.finally/);
});

test('R2.17 prompt-only rail scrolls only for genuinely long libraries',async()=>{
  const [page,preview]=await Promise.all([file('trusted/page.js'),file('preview/index.html')]);
  assert.match(page,/max-height:min\(400px,calc\(100dvh - 16px\)\);overflow-y:auto;overflow-x:hidden;/);
  assert.match(preview,/max-height:min\(400px,calc\(100% - 16px\)\);overflow-y:auto;overflow-x:hidden;/);
  assert.doesNotMatch(page,/max-height:min\(248px/);
  assert.doesNotMatch(preview,/max-height:248px|max-height:min\(340px/);
  assert.match(page,/railHeight=Math.min\(rail.offsetHeight\|\|rail.scrollHeight\|\|222,maxHeight\)/);
  const verticalHeight=count=>count*38+(count-1)*5+2*6+2;
  assert.equal(verticalHeight(4),181,'one OD entry plus three prompts fit without scrolling');
  assert(verticalHeight(12)>400,'long saved lists retain bounded internal scrolling');
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

test('R1.9.6 formal R4 image drop remains a single Trusted Host upload path',async()=>{
 const [js,html,css]=await Promise.all([file('src/main.js'),file('src/index.html'),file('src/style.css')]);
 assert.match(js,/async function uploadImage\(droppedFile=null\)/);
 assert.match(js,/const dropZones=\['ps-image-upload-controls','ps-image-live'\]/);
 assert.match(js,/void uploadImage\(files\[0\]\);/);
 assert.match(js,/request\('prompt.asset.put'/);
 assert.match(js,/!unconfirmedWrite&&!siteUnconfirmedWrite/);
 assert.match(html,/id="ps-image-drop-hint"/);
 assert.match(html,/id="ps-image-live"/);
 assert.match(css,/\.ps-image-upload-controls\.is-dragover/);
 assert.doesNotMatch(js,/new (?:TrustedHost|OpenDeskSDK|AssetHost)/);
});
