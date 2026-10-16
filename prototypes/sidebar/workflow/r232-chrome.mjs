// R23.2 source-bound Chrome/Chromium PREVIEW test. This does not test a real extension/RunHost.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const input=resolve('prototypes/sidebar/workflow/index.html');
const out=resolve(process.argv[2]||'artifacts/workflow-r232-preview');
await mkdir(out,{recursive:true});
const bytes=await readFile(input);
const hash=createHash('sha256').update(bytes).digest('hex');
const blob=execFileSync('git',['hash-object',input],{encoding:'utf8'}).trim();
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1100,height:900}});
const errors=[],checks=[],screenshots=[];
page.on('pageerror',err=>errors.push('pageerror: '+err.message));
page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text())});
const mark=name=>checks.push(name);
const shot=async name=>{const qa=page.locator('#r233-qa'),wasOpen=await qa.evaluate(el=>el.open);if(wasOpen)await qa.evaluate(el=>{el.open=false});await page.screenshot({path:resolve(out,name+'.png'),fullPage:true});if(wasOpen)await qa.evaluate(el=>{el.open=true});screenshots.push(name+'.png')};
const state=()=>page.evaluate(()=>window.workflowPreviewState());
const expectState=async stage=>{await page.waitForFunction(expected=>window.workflowPreviewState()?.stage===expected,stage,{timeout:9000})};
const send=async text=>{await page.locator('#prompt').fill(text);await page.locator('.send-btn').click()};
const nameValue=()=>page.locator('#r23-name').inputValue();
const first='请在当前网页的姓名输入框中填写：给我一个亿的项目。填写后读取输入框的实际值并告诉我，不要点击提交按钮，不要跳转网页。';
const second='把刚才填写的内容改成：项目已启动，并重新读取验证。不要提交表单，也不要跳转。';
// R23.3 test: offline rules only, never a real provider, browser SDK, RunHost or Chrome grant.
async function reset(){
  if((await state()).stage==='approval')await page.locator('[data-action="deny"]').click();
  await page.locator('[data-action="reset"]').click();
  if(await page.locator('#r23-modal-root [role="dialog"]').count())await page.locator('[data-action="discard-proceed"]').click();
  assert.equal((await state()).stage,'empty');
}
const mode=async value=>{
  await page.locator('#r23-mode-button').click();
  await page.locator('[data-mode="'+value+'"]').click();
  assert.equal((await state()).mode,value);
};
const assertNoEffect=async()=>{
  const s=await state();
  assert.equal(s.submits,0);assert.equal(s.navigations,0);
};
try{
  await page.goto(pathToFileURL(input).href);
  await page.locator('#content .intro').waitFor();
  for(const [id,label] of [['history','查看历史版本'],['new-chat','新对话'],['new-workflow','新建工作流']]){
    const button=page.locator('#'+id),box=await button.boundingBox();
    assert.equal(await button.getAttribute('aria-label'),label);
    assert.equal((await button.innerText()).trim(),'');
    assert.equal(await button.locator('svg').count(),1);
    assert.ok(box&&box.width>=40&&box.height>=40,'top icon too small: '+id);
  }
  assert.equal(await page.locator('#r23-provider').inputValue(),'local_codex');
  assert.equal((await state()).mode,'standard');
  await shot('r233-default');
  await page.locator('#r233-qa > summary').click();
  mark('first screen, 3 icon actions, source and mode are separate');

  await send('给我一个亿的项目');
  await expectState('clarifying');
  assert.equal(await nameValue(),'旧的预填内容');
  await shot('r233-clarification');
  await page.locator('[data-action="clarify-fill"]').click();
  await expectState('result');
  let s=await state();
  assert.equal(await nameValue(),'给我一个亿的项目');
  assert.equal(s.documentChecks,1);
  assert.equal(s.messages.filter(m=>m.kind==='success').length,1);
  assert.equal(await page.locator('[data-stage="approval"]').count(),0);
  mark('short natural language -> 1-click clarification -> DOM fill/readback, no routine popup');

  await page.locator('#prompt').fill('把刚才的内容改成：项目已启动');
  await page.locator('#prompt').press('Enter');
  await expectState('result');
  s=await state();
  assert.equal(await nameValue(),'项目已启动');
  assert.equal(s.documentChecks,2);
  assert.equal(s.messages.filter(m=>m.role==='user').length,2);
  assert.equal(s.messages.filter(m=>m.kind==='success').length,2);
  assert.ok(s.messages.some(m=>m.text==='把刚才的内容改成：项目已启动'));
  await assertNoEffect();await shot('r233-two-rounds');
  mark('second round context, Enter, preserved history, exact DOM readback, no submit/navigation');

  await reset();await send(first);await expectState('result');
  assert.equal(await nameValue(),'给我一个亿的项目');
  await send(second);await expectState('result');
  assert.equal(await nameValue(),'项目已启动');
  mark('two original full instructions work without exact-template parser or routine approval');

  await reset();await send('请打开一个新闻网站');await expectState('unsupported');
  s=await state();assert.equal(s.messages[0].role,'user');
  assert.ok(s.messages.some(m=>m.role==='assistant'&&m.text.includes('不会访问其他网站')));
  assert.equal(await nameValue(),'旧的预填内容');
  mark('unsupported arbitrary non-empty prompt receives boundary response');

  await reset();
  await page.locator('#prompt').fill('测试');
  await page.locator('#prompt').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'测'})));
  await page.locator('#prompt').press('Enter');
  assert.equal((await state()).messages.length,0);
  await page.locator('#prompt').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'测'})));
  await page.locator('#prompt').press('Shift+Enter');
  assert.ok((await page.locator('#prompt').inputValue()).includes('\n'));
  await page.locator('#prompt').press('Enter');await expectState('unsupported');
  mark('synthetic Chinese composition, Shift+Enter newline, Enter response; OS IME NOT_TESTED');

  await reset();await mode('readonly');await send(first);await expectState('readonly');
  assert.equal(await nameValue(),'旧的预填内容');await assertNoEffect();
  mark('readonly has no DOM writes or clicks');

  await reset();await mode('confirm');await send(first);await expectState('approval');
  assert.equal(await nameValue(),'旧的预填内容');
  await shot('r233-confirm');
  await page.locator('[data-action="deny"]').click();
  assert.equal(await nameValue(),'旧的预填内容');
  await send(first);await expectState('approval');
  await page.locator('[data-action="grant"]').click();await expectState('result');
  assert.equal(await nameValue(),'给我一个亿的项目');
  mark('per-action confirmation: reject and approve with explicit DOM verification');

  await reset();await send('请点击提交按钮');await expectState('approval');
  await shot('r233-risk-review');
  await page.locator('[data-action="grant"]').click();await expectState('failed');
  assert.equal(await nameValue(),'旧的预填内容');
  await assertNoEffect();
  mark('high-risk submit still not executed even after review in this prototype');

  await reset();await send(first);await expectState('planning');
  await page.locator('.send-btn').click();await expectState('stopped');
  await page.waitForTimeout(850);
  assert.equal(await nameValue(),'旧的预填内容');
  await reset();await send(first);await expectState('running');
  await page.locator('.send-btn').click();await expectState('stopped');
  await page.waitForTimeout(1450);
  assert.equal(await nameValue(),'旧的预填内容');await assertNoEffect();
  await shot('r233-stop');
  mark('Stop cancels planning and running timers, no delayed writes');

  await reset();await page.locator('[data-scenario="disconnected"]').click();
  await send('给我一个亿的项目');
  assert.equal((await state()).stage,'disconnected');
  assert.ok((await state()).messages.length>0);
  await page.locator('[data-action="reconnect"]').first().click();
  assert.equal((await state()).connected,true);
  mark('AI disconnect, error feedback, and explicit simulated recovery');

  await reset();await page.locator('#settings').click();
  await page.locator('#r23-provider').selectOption('cloud_responses');
  s=await state();assert.equal(s.connected,false);assert.equal(s.shareApproved.cloud_responses,false);
  assert.equal(await page.locator('#r23-model').isVisible(),true);
  await shot('r233-ai-settings');
  await page.locator('[data-action="simulate-config"]').click();
  await page.locator('[data-action="close-settings"]').click();
  await send(first);await expectState('sharing-required');
  assert.equal(await nameValue(),'旧的预填内容');
  await page.locator('[data-action="open-settings"]').click();
  await page.locator('#r23-share').check();
  await page.locator('[data-action="close-settings"]').click();
  await send(first);await expectState('result');
  assert.equal(await nameValue(),'给我一个亿的项目');
  await page.locator('#settings').click();
  await page.locator('#r23-provider').selectOption('local_codex');
  await page.locator('#r23-provider').selectOption('cloud_responses');
  assert.equal((await state()).shareApproved.cloud_responses,false);
  await page.locator('[data-action="close-settings"]').click();
  mark('OpenAI Responses model config, new recipient disclosure, source-scoped approval');

  await reset();await page.locator('[data-action="revoke-site"]').click();
  await send(first);await expectState('permission');
  assert.equal(await nameValue(),'旧的预填内容');
  await page.locator('[data-action="restore-site"]').click();
  await send(first);await expectState('result');
  assert.equal(await nameValue(),'给我一个亿的项目');
  await page.locator('[data-action="change-document"]').click();
  assert.equal((await state()).documentId,'demo-form:2');
  assert.equal((await state()).shareApproved.cloud_responses,false);
  mark('website permission revoke/restore, document identity change, no unauthorized writes');

  await reset();await send(first);await expectState('result');
  await page.locator('[data-action="save"]').click();
  s=await state();assert.equal(s.versions.length,1);assert.equal(s.dirty,false);
  const oldId=s.workflowId;
  await page.locator('#prompt').fill('尚未发送的草稿');
  await page.locator('#new-chat').click();
  s=await state();assert.equal(s.workflowId,oldId);assert.equal(s.messages.length,0);
  assert.equal(await page.locator('#prompt').inputValue(),'尚未发送的草稿');
  assert.equal(await nameValue(),'给我一个亿的项目');
  await page.locator('#new-workflow').click();
  assert.equal(await page.locator('#r23-modal-root [role="dialog"]').count(),1);
  await page.locator('[data-action="cancel-dialog"]').click();
  assert.equal((await state()).workflowId,oldId);
  await page.locator('#new-workflow').click();
  await page.locator('[data-action="discard-proceed"]').click();
  assert.notEqual((await state()).workflowId,oldId);
  await page.locator('#history').click();await shot('r233-history');
  await page.locator('[data-action="restore"]').first().click();
  s=await state();assert.equal(s.workflowId,oldId);
  assert.equal(await nameValue(),'给我一个亿的项目');
  mark('save, new chat preserving workflow/draft, guarded new workflow, history restore');

  await reset();await page.locator('[data-scenario="unknown"]').click();
  assert.equal((await state()).stage,'unknown');
  await page.locator('[data-action="inspect"]').click();
  assert.equal(await nameValue(),'旧的预填内容');
  assert.equal((await state()).documentChecks,1);
  await assertNoEffect();
  mark('unknown effect read-only DOM inspect does not replay');

  await reset();
  for(const width of ['360','420','520']){
    await page.locator('#r23-width').selectOption(width);
    if(width==='360'||width==='420')await page.locator('#r23-theme').click();
    const geometry=await page.evaluate(()=>{
      const d=document.querySelector('.device'),h=d.querySelector('.title-bar');
      return {w:Math.round(d.getBoundingClientRect().width),overflow:h.scrollWidth>h.clientWidth+1,
        pageOverflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    assert.equal(geometry.w,Number(width));
    assert.equal(geometry.overflow,false);
    assert.equal(geometry.pageOverflow,false);
    await shot('r233-'+width+(width==='360'?'-dark':'-light'));
  }
  mark('responsive 360/420/520 light/dark screenshots');
  assert.deepEqual(errors,[]);
  const report={status:'PREVIEW_CHROMIUM_PASS',scope:'R23.3 simulated DOM only; not a real AI provider, Chrome permission, Mac IME or RunHost',head,gitBlobSha:blob,sha256:hash,
    chromiumVersion:browser.version(),checks,errors,screenshots,independentUxScore:'NOT_SCORED'};
  console.log('R233_SOURCE_BOUND_CHROMIUM_PASS '+checks.length);
  await writeFile(resolve(out,'r232-evidence.json'),JSON.stringify(report,null,2));
}catch(error){
  const report={status:'PREVIEW_CHROMIUM_FAIL',scope:'R23.3 offline HTML',head,gitBlobSha:blob,sha256:hash,error:String(error?.stack||error),checks,errors,screenshots,chromiumVersion:browser.version()};
  await writeFile(resolve(out,'r232-evidence.json'),JSON.stringify(report,null,2));
  console.error(error);process.exitCode=1;
}finally{await browser.close()}
