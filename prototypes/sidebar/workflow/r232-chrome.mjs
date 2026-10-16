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
const errors=[],checks=[],screenshots=[],externalRequests=[];
page.on('pageerror',err=>errors.push('pageerror: '+err.message));
page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text())});
page.on('request',req=>{if(!req.url().startsWith('file:')&&!req.url().startsWith('data:'))externalRequests.push(req.url())});
const mark=name=>checks.push(name);
const shot=async name=>{const qa=page.locator('#r233-qa'),wasOpen=await qa.evaluate(el=>el.open);if(wasOpen)await qa.evaluate(el=>{el.open=false});await page.screenshot({path:resolve(out,name+'.png'),fullPage:true});if(wasOpen)await qa.evaluate(el=>{el.open=true});screenshots.push(name+'.png')};
const state=()=>page.evaluate(()=>window.workflowPreviewState());
const expectState=async stage=>{await page.waitForFunction(expected=>window.workflowPreviewState()?.stage===expected,stage,{timeout:9000})};
const send=async text=>{await page.locator('#prompt').fill(text);await page.locator('.send-btn').click()};
const nameValue=()=>page.locator('#r23-name').inputValue();
const first='请在当前网页的姓名输入框中填写：给我一个亿的项目。填写后读取输入框的实际值并告诉我，不要点击提交按钮，不要跳转网页。';
const second='把刚才填写的内容改成：项目已启动，并重新读取验证。不要提交表单，也不要跳转。';
// R23.4 test: offline rules only, never a real provider, browser SDK, RunHost or Chrome grant.
async function reset(){
  if((await state()).stage==='approval')await page.locator('[data-action="deny"]').click();
  await page.locator('[data-action="reset"]').click();
  if(await page.locator('#r23-modal-root [role="dialog"]').count())await page.locator('[data-action="discard-proceed"]').click();
  assert.equal((await state()).stage,'empty');
  assert.equal((await state()).provider,'local_codex','reset defaults to Native Codex');
  assert.equal(await page.locator('#r236-native').isChecked(),true);
  assert.equal(await page.locator('#r236-https').isChecked(),false);
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
  assert.equal(await page.locator('#r236-native').isChecked(),true);
  assert.equal(await page.locator('#r236-https').isChecked(),false);
  assert.equal((await state()).provider,'local_codex','first-load provider must be Native Codex');
  assert.equal((await state()).mode,'standard');
  assert.equal(await page.locator('#r23-settings-panel').isVisible(),false,
    'initial HTML must not render an invisible-but-interactive settings sheet');
  assert.equal(await page.locator('#r239-sheet-backdrop').isVisible(),false,
    'initial HTML must not leave a ghost backdrop');
  assert.equal(await page.locator('#r23-modal-root').isVisible(),false,
    'initial HTML must not leave a hidden but visible confirmation modal');
  assert.equal(await page.locator('#r23-remote-config').isVisible(),false);
  mark('R23.9.1 exact HTML hidden-state recovery: sheet / backdrop / modal / inactive HTTPS');
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
  await shot('r234-readonly');
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


  await reset();
  await page.locator('#prompt').fill('尚未发送的设置前草稿');
  await page.locator('#settings').click();
  assert.equal(await page.locator('#r234-back').isVisible(),true);
  assert.equal(await page.locator('[data-action="close-settings"]').count(),1,
    'one clear return action; no misleading duplicate completion button');
  assert.equal(await page.locator('.r234-footer').count(),0);
  assert.equal(await page.locator('#r23-advanced').count(),0,
    'remove redundant technical explanation rather than hiding nested notes');
  assert.equal(await page.locator('#form').evaluate(el=>el.inert),true);
  assert.equal(await page.locator('#history').evaluate(el=>el.closest('.title-bar').inert),true);
  // Do not inspect transform animation mid-flight; test the settled real geometry.
  await page.locator('#r23-settings-panel').evaluate(el=>
    Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  const r239ShortSheet=await page.evaluate(()=>{
    const d=document.querySelector('.device').getBoundingClientRect(),
      p=document.querySelector('.r23-settings').getBoundingClientRect();
    return {bottomPinned:Math.abs(p.bottom-d.bottom)<=2,
      naturallyShort:p.height>120&&p.height<d.height*.70};
  });
  console.log('R2391_CODEX_GEOMETRY '+JSON.stringify(r239ShortSheet));
  assert.ok(r239ShortSheet.bottomPinned&&r239ShortSheet.naturallyShort,
    'Codex must use a bottom-pinned short sheet without replacing the chat');
  assert.equal(await page.locator('#r236-native').isChecked(),true);
  assert.equal(await page.locator('#r23-native-status').isVisible(),true);
  await shot('r236-settings-local');

  const nativeLayout=await page.evaluate(()=>{
    const rect=q=>document.querySelector(q).getBoundingClientRect();
    const slider=rect('.r236-switch'),card=rect('#r23-local-config'),
      body=rect('#r234-body'),details=rect('.r238-native-state'),
      action=rect('#r23-local-config button'),
      padLeft=parseFloat(getComputedStyle(document.querySelector('#r234-body')).paddingLeft),
      padTop=parseFloat(getComputedStyle(document.querySelector('#r234-body')).paddingTop);
    const legend=document.querySelector('.r236-switch legend');
    return {
      noVisibleSourceHeading:!document.querySelector('#r236-source-title'),
      accessibleLegend:legend?.textContent.trim()==='AI 来源'&&legend.classList.contains('visually-hidden'),
      sourceLeftAligned:Math.abs(slider.left-(body.left+padLeft))<=2,
      sourceStartsAtTop:Math.abs(slider.top-(body.top+padTop))<=2,
      switchWidth:slider.width,
      cardInside:card.left>=body.left+9&&card.right<=body.right-9,
      cardWidth:card.width,
      statusAligned:Math.abs((details.top+details.bottom)/2-(action.top+action.bottom)/2),
      statusVisible:details.width>90&&action.width>=64,
      choices:document.querySelectorAll('.r236-switch input[type=radio]').length,
      title:document.querySelector('.r238-native-title').textContent.trim()
    };
  });
  assert.equal(nativeLayout.choices,2,'preserve two radio sources');
  assert.ok(nativeLayout.noVisibleSourceHeading&&nativeLayout.accessibleLegend,
    'remove visible AI 来源 text but keep accessible fieldset name');
  assert.ok(nativeLayout.sourceLeftAligned&&nativeLayout.sourceStartsAtTop,
    'two source choices must start the settings content without a blank heading');
  assert.ok(nativeLayout.switchWidth>=290,'source selector fills the bottom sheet content rail');
  assert.ok(nativeLayout.cardInside&&nativeLayout.cardWidth>=300,'native controls must form one coherent row');
  assert.ok(nativeLayout.statusAligned<=6&&nativeLayout.statusVisible,'native status and check action vertically aligned');
  assert.equal(nativeLayout.title,'本机连接');
  await page.locator('#r236-native').focus();
  await page.locator('#r236-native').press('ArrowRight');
  assert.equal(await page.locator('#r236-https').isChecked(),true,'native segmented radio keyboard ArrowRight');
  assert.equal((await state()).provider,'cloud_responses','default HTTPS is Responses');
  assert.equal((await state()).connected,false);
  for(const id of ['r23-endpoint','r23-model','r23-api-key']){
    assert.equal(await page.locator('#'+id).isVisible(),true);
  }
  assert.equal(await page.locator('#r23-endpoint').inputValue(),'https://api.openai.com/v1/responses');
  assert.equal(await page.locator('#r236-clear-endpoint').isVisible(),true);
  assert.equal(await page.locator('#r23-api-key').getAttribute('type'),'password');
  assert.ok((await page.locator('#r236-protocol-note').innerText()).includes('Responses'));
  await shot('r236-https-default');
  mark('Native Codex default, visible AI 来源 removed, accessible radio legend and source switching preserved');

  await page.locator('[data-action="simulate-config"]').click();
  assert.equal(await page.locator('#r234-feedback').getAttribute('data-kind'),'error');
  await page.locator('#r23-endpoint').fill('http://api.openai.com/v1/responses');
  await page.locator('#r23-model').fill('gpt-4o-mini');
  await page.locator('#r23-api-key').fill('demo-openai-test');
  await page.locator('[data-action="simulate-config"]').click();
  assert.equal(await page.locator('#r23-endpoint').getAttribute('aria-invalid'),'true');
  assert.ok((await page.locator('#r234-field-error').innerText()).includes('HTTPS'));
  assert.equal(await page.locator('#r23-endpoint').getAttribute('aria-describedby'),'r234-field-error');

  await page.locator('#r23-endpoint').fill('https://api.openai.com/v1/responses');
  assert.equal(await page.locator('#r23-api-key').inputValue(),'','editing recipient clears previously entered secret');
  await page.locator('[data-action="simulate-config"]').click();
  assert.equal(await page.locator('#r23-api-key').getAttribute('aria-invalid'),'true');
  await page.locator('#r23-api-key').fill('demo-openai-test');
  await page.locator('#r234-key-toggle').click();
  assert.equal(await page.locator('#r23-api-key').getAttribute('type'),'text');
  await page.locator('#r234-key-toggle').click();
  assert.equal(await page.locator('#r23-api-key').getAttribute('type'),'password');
  await page.locator('[data-action="simulate-config"]').click();
  assert.equal(await page.locator('#r234-feedback').getAttribute('data-kind'),'checked');
  assert.ok((await page.locator('#r234-feedback').textContent()).includes('真实连接'));
  await shot('r236-responses-config');
  mark('Responses HTTPS, separate Model ID, masked API key and clear-on-recipient-change');

  const feedbackVisible=()=>page.evaluate(()=>{
    const field=document.querySelector('#r234-feedback').getBoundingClientRect();
    const scroller=document.querySelector('#r234-body').getBoundingClientRect();
    return field.top>=scroller.top-1&&field.bottom<=scroller.bottom+1;
  });
  assert.equal(await feedbackVisible(),true);
  await page.locator('#r236-clear-endpoint').click();
  assert.equal(await page.locator('#r23-endpoint').inputValue(),'');
  assert.equal(await page.locator('#r23-api-key').inputValue(),'');
  assert.equal((await state()).provider,'custom_https');
  assert.equal((await state()).sourceReady.cloud_responses,false);
  assert.equal(await page.locator('#r236-clear-endpoint').isVisible(),false);
  assert.ok((await page.locator('#r236-protocol-note').innerText()).includes('Chat Completions'));
  await page.locator('[data-action="simulate-config"]').click();
  assert.equal(await page.locator('#r23-endpoint').getAttribute('aria-invalid'),'true');
  await shot('r236-https-cleared');

  await page.locator('#r23-endpoint').fill('https://example.test/v1/chat/completions');
  assert.equal((await state()).provider,'custom_https');
  await page.locator('#r23-model').fill('my-chat-model');
  await page.locator('#r23-api-key').fill('demo-custom-test');
  await page.locator('[data-action="simulate-config"]').click();
  assert.equal(await page.locator('#r234-feedback').getAttribute('data-kind'),'checked');
  assert.equal(await feedbackVisible(),true);
  await shot('r236-https-custom');
  mark('one shared HTTPS form, clear endpoint, custom Chat Completions auto-routing');

  await page.locator('#r23-endpoint').fill('https://api.other.example/v1/responses?unexpected=1');
  assert.equal((await state()).provider,'cloud_responses','Responses path selects Responses adapter regardless of hostname');
  assert.equal(await page.locator('#r23-api-key').inputValue(),'');
  await page.locator('#r23-api-key').fill('demo-other-test');
  await page.locator('[data-action="simulate-config"]').click();
  assert.equal(await page.locator('#r23-endpoint').getAttribute('aria-invalid'),'true');
  await page.locator('#r23-endpoint').fill('https://api.openai.com/v1/responses');
  await page.locator('#r23-api-key').fill('demo-openai-test');
  await page.locator('[data-action="simulate-config"]').click();
  assert.equal(await page.locator('#r234-feedback').getAttribute('data-kind'),'checked');
  const visibleText=await page.locator('#r234-body').innerText();
  assert.equal(visibleText.includes('模型连接参数'),false);
  assert.equal(visibleText.includes('旧版兼容'),false);
  assert.equal((visibleText.match(/Chat Completions/g)||[]).length<=1,true);

  const compact=await page.evaluate(()=>{
    const rows=[...document.querySelectorAll('#r23-remote-config .r234-field')];
    const remote=document.getElementById('r23-remote-config').getBoundingClientRect();
    return{height:remote.height,rows:rows.map(row=>{
      const label=row.querySelector('label').getBoundingClientRect();
      const control=(row.querySelector('.r234-secret')||row.querySelector('.r236-input-action')||row.querySelector('input')).getBoundingClientRect();
      return{stacked:label.bottom<=control.top-4,leftAligned:Math.abs(label.left-control.left)<=2,width:control.width};
    }),iconOnly:document.querySelector('#r234-key-toggle').textContent.trim()==='',
      demoSubmitCount:document.querySelectorAll('.r23-demo button').length};
  });
  assert.ok(compact.rows.every(row=>row.stacked&&row.leftAligned&&row.width>=300),
    'full-width HTTPS fields have labels above inputs on the same rail');
  assert.ok(compact.height<=380,'HTTPS settings fit the default Sidebar');
  assert.equal(compact.iconOnly,true);assert.equal(compact.demoSubmitCount,0);
  mark('full-width HTTPS form with stacked labels, one protocol hint and no demo submit button');

  await page.locator('[data-action="close-settings"]').last().click();
  assert.equal(await page.locator('#prompt').inputValue(),'尚未发送的设置前草稿');
  assert.equal(await page.locator('#form').evaluate(el=>el.inert),false);
  await page.locator('#prompt').fill('');
  await send(first);await expectState('sharing-required');
  await page.locator('[data-action="open-settings"]').click();
  await page.locator('#r23-share').check();
  await page.locator('[data-action="close-settings"]').last().click();
  await send(first);await expectState('result');
  assert.equal(await nameValue(),'给我一个亿的项目');
  await page.locator('#settings').click();
  assert.equal((await state()).shareApproved.cloud_responses,true);
  await page.locator('#r23-endpoint').fill('https://replacement.example/v1/responses');
  assert.equal((await state()).shareApproved.cloud_responses,false);
  assert.equal(await page.locator('#r23-share').isChecked(),false);
  assert.equal(await page.locator('#r23-api-key').inputValue(),'');
  await page.locator('#r236-native').check();
  assert.equal((await state()).provider,'local_codex');
  await page.locator('#r236-https').check();
  assert.equal((await state()).shareApproved.cloud_responses,false);
  await page.locator('[data-action="close-settings"]').last().click();
  mark('existing chat draft, two-way switch, recipient-change consent revocation and readback');


  // R23.9.1 regression: real Chromium pointer, focus, geometry and scroll.
  await reset();
  await page.locator('#prompt').fill('保留的抽屉关闭后草稿');
  await page.evaluate(()=>window.__r239ChatNode=document.getElementById('content'));
  const preservedScroll=await page.locator('#content').evaluate(el=>el.scrollTop);
  await page.locator('#settings').click();
  assert.equal(await page.locator('#r23-settings-panel').isVisible(),true);
  assert.equal(await page.locator('#r239-sheet-backdrop').isVisible(),true);
  assert.equal(await page.locator('#r23-settings-panel').getAttribute('aria-modal'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'r234-back');
  assert.equal(await page.locator('#r23-remote-config').isVisible(),false);
  await page.locator('#r23-settings-panel').evaluate(el=>
    Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  const codexBounds=await page.evaluate(()=>{
    const d=document.querySelector('.device').getBoundingClientRect(),
      s=document.querySelector('#r23-settings-panel').getBoundingClientRect();
    return {bottom:Math.abs(d.bottom-s.bottom),height:s.height,deviceHeight:d.height};
  });
  console.log('R2391_CODEX_REOPEN_GEOMETRY '+JSON.stringify(codexBounds));
  assert.ok(codexBounds.bottom<=2&&codexBounds.height>120
    &&codexBounds.height<codexBounds.deviceHeight*.7,
    'Native Codex uses natural-height bottom sheet');
  assert.equal(await page.locator('#form').evaluate(el=>el.inert),true);
  await page.locator('#prompt').evaluate(el=>el.focus());
  assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'prompt');
  await page.locator('#r234-back').focus();
  for(let n=0;n<16;n++){
    await page.keyboard.press(n%3===0?'Shift+Tab':'Tab');
    assert.equal(await page.evaluate(()=>
      document.querySelector('#r23-settings-panel').contains(document.activeElement)),true);
  }
  mark('R23.9.1 natural Codex height, background inert, focus trap and initial focus');
  await shot('r2391-bottom-sheet-codex');
  await page.locator('#r236-https').check();
  assert.equal(await page.locator('#r23-local-config').isVisible(),false);
  assert.equal(await page.locator('#r23-remote-config').isVisible(),true);
  const httpsBounds=await page.evaluate(()=>{
    const d=document.querySelector('.device').getBoundingClientRect(),
      s=document.querySelector('#r23-settings-panel').getBoundingClientRect();
    return {bottom:Math.abs(d.bottom-s.bottom),height:s.height,deviceHeight:d.height};
  });
  assert.ok(httpsBounds.height>codexBounds.height+70);
  assert.ok(httpsBounds.bottom<=2&&httpsBounds.height<=httpsBounds.deviceHeight-56);
  for(let n=0;n<5;n++){
    await page.locator('#r236-native').check();
    assert.equal(await page.locator('#r23-remote-config').isVisible(),false);
    await page.locator('#r236-https').check();
    assert.equal(await page.locator('#r23-remote-config').isVisible(),true);
    assert.equal((await state()).settingsOpen,true);
  }
  assert.equal(await page.evaluate(()=>
    document.getElementById('content')===window.__r239ChatNode),true);
  await shot('r2391-bottom-sheet-https');
  mark('R23.9.1 HTTPS natural height, bottom pin and 5 source round trips');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'settings');
  assert.equal((await state()).settingsOpen,false);
  await page.waitForTimeout(220);
  assert.equal(await page.locator('#r23-settings-panel').isVisible(),false);
  await page.locator('#settings').click();
  await page.locator('#r239-sheet-backdrop').click({position:{x:8,y:8}});
  assert.equal((await state()).settingsOpen,false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'settings');
  await page.waitForTimeout(220);
  await page.locator('#settings').click();
  await page.locator('#r234-back').click();
  assert.equal((await state()).settingsOpen,false);
  await page.waitForTimeout(220);
  assert.equal(await page.locator('#r239-sheet-backdrop').isVisible(),false);
  assert.equal(await page.locator('#prompt').inputValue(),'保留的抽屉关闭后草稿');
  assert.equal(await page.locator('#content').evaluate(el=>el.scrollTop),preservedScroll);
  assert.equal(await page.locator('#form').evaluate(el=>el.inert),false);
  mark('R23.9.1 Escape / backdrop / close, return focus, draft and scroll preservation');
  // Deliberately small viewport to force a real overflow; then restore legacy runner size.
  await page.setViewportSize({width:470,height:530});
  await page.locator('#settings').click();
  await page.locator('#r236-https').check();
  const overflow=await page.evaluate(()=>{
    const b=document.querySelector('#r234-body'),
      d=document.querySelector('.device').getBoundingClientRect(),
      s=document.querySelector('#r23-settings-panel').getBoundingClientRect();
    return {scrollHeight:b.scrollHeight,clientHeight:b.clientHeight,
      bottom:Math.abs(d.bottom-s.bottom),fits:s.height<=d.height-56};
  });
  assert.ok(overflow.scrollHeight>overflow.clientHeight,
    'HTTPS content must scroll inside a short bottom sheet');
  assert.ok(overflow.bottom<=2&&overflow.fits);
  await page.locator('#r23-api-key').scrollIntoViewIfNeeded();
  await shot('r2391-bottom-sheet-https-scroll');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
  await page.setViewportSize({width:1100,height:900});
  mark('R23.9.1 short viewport internal scrollbar is reachable and not clipped');

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

  // R23.8: both the short Native view and the full HTTPS form use one visual rail.
  for(const width of ['360','420','520']){
    await page.locator('#r23-width').selectOption(width);
    await page.locator('#settings').click();
    const nativeGeo=await page.evaluate(()=>{
      const a=document.querySelector('#r23-native-status').getBoundingClientRect(),
        b=document.querySelector('#r23-local-config button').getBoundingClientRect(),
        card=document.querySelector('#r23-local-config').getBoundingClientRect();
      return{inside:card.left<=a.left&&card.right>=b.right,
        verticallyAligned:Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2)<17};
    });
    assert.ok(nativeGeo.inside&&nativeGeo.verticallyAligned,'Native status card has a coherent layout at '+width);
    await shot('r238-native-'+width);
    await page.locator('#r236-https').check();
    await page.locator('#r23-api-key').scrollIntoViewIfNeeded();
    const g=await page.evaluate(()=>{
      const d=document.querySelector('.device').getBoundingClientRect(),
        p=document.querySelector('#r23-settings-panel').getBoundingClientRect(),
        body=document.querySelector('#r234-body').getBoundingClientRect(),
        field=document.querySelector('#r23-api-key').getBoundingClientRect(),
        slider=document.querySelector('.r236-switch').getBoundingClientRect(),
        endpoint=document.querySelector('#r23-endpoint').closest('.r236-input-action').getBoundingClientRect(),
        note=document.querySelector('#r236-protocol-note').getBoundingClientRect();
      const rows=[...document.querySelectorAll('#r23-remote-config .r234-field')].map(row=>{
        const a=row.querySelector('label').getBoundingClientRect(),
          b=(row.querySelector('.r234-secret')||row.querySelector('.r236-input-action')||row.querySelector('input')).getBoundingClientRect();
        return{labelAbove:a.bottom<b.top-4,
          sameRail:Math.abs(a.left-b.left)<=2&&Math.abs(b.left-body.left-20)<=3,
          visible:b.left>=p.left-1&&b.right<=p.right+1};
      });
      return{
        panelFits:Math.abs(p.width-d.width)<=2&&Math.abs(p.bottom-d.bottom)<=2&&p.height<d.height,
        sliderLeftAligned:Math.abs(slider.left-(body.left+parseFloat(getComputedStyle(document.querySelector('#r234-body')).paddingLeft)))<=2,
        sourceAtTop:Math.abs(slider.top-(body.top+parseFloat(getComputedStyle(document.querySelector('#r234-body')).paddingTop)))<=2,
        sourceLabelAbsent:!document.querySelector('#r236-source-title'),
        accessibleName:document.querySelector('.r236-switch legend')?.textContent.trim()==='AI 来源',
        sliderWidth:slider.width,
        protocolAligned:Math.abs(note.left-endpoint.left)<=2,
        fieldVisible:field.left>=p.left&&field.right<=p.right,
        pageNoOverflow:document.documentElement.scrollWidth<=innerWidth+1,rows};
    });
    assert.ok(g.panelFits&&g.fieldVisible&&g.pageNoOverflow,'settings route must fit at '+width);
    assert.ok(g.sliderLeftAligned&&g.sourceAtTop&&g.sourceLabelAbsent&&g.accessibleName,'unlabeled visual selector remains accessible and aligned at '+width);
    assert.ok(g.sliderWidth>=width-58,'source toggle fills bottom sheet at '+width);
    assert.equal(g.protocolAligned,true,'protocol hint belongs below the endpoint at '+width);
    assert.ok(g.rows.every(x=>x.labelAbove&&x.sameRail&&x.visible),'stacked full-width inputs at '+width);
    await shot('r238-https-'+width);
    await page.locator('#r234-back').click();
  }
  mark('R23.9.1 Codex bottom sheet and unlabeled source selector align across 360/420/520');
  // Source-identical HTML is injected as srcdoc: isolate sandbox scripting separately
  // from file:// Chromium PASS. This does NOT prove the ChatGPT UI itself runs scripts.
  const embedded=await browser.newPage({viewport:{width:1100,height:850}});
  const embeddedErrors=[];
  embedded.on('pageerror',error=>embeddedErrors.push(error.message));
  await embedded.setContent('<iframe id="embedded" sandbox="allow-scripts" style="width:420px;height:770px;border:0"></iframe>');
  await embedded.locator('#embedded').evaluate((node,html)=>node.srcdoc=html,bytes.toString('utf8'));
  const frame=embedded.frameLocator('#embedded');
  await frame.locator('#content .intro').waitFor({timeout:10000});
  await frame.locator('#prompt').fill('给我一个亿的项目');
  await frame.locator('.send-btn').click();
  await frame.locator('[data-action="clarify-fill"]').click({timeout:10000});
  await frame.locator('#r23-readback').filter({hasText:'给我一个亿的项目'}).waitFor({timeout:10000});
  await frame.locator('#prompt').fill('把刚才的内容改成：项目已启动');
  await frame.locator('.send-btn').click();
  await frame.locator('#r23-readback').filter({hasText:'项目已启动'}).waitFor({timeout:10000});
  assert.equal(await frame.locator('#r23-name').inputValue(),'项目已启动');
  assert.deepEqual(embeddedErrors,[]);
  await embedded.screenshot({path:resolve(out,'r234-sandbox-embedded.png'),fullPage:true});
  screenshots.push('r234-sandbox-embedded.png');
  await embedded.close();
  mark('sandbox allow-scripts srcdoc embedded two-round button-click test; ChatGPT host NOT_TESTED');

  assert.deepEqual(errors,[]);
  assert.deepEqual(externalRequests,[],'offline HTML must not request network/CDN or AI');
  const report={status:'PREVIEW_CHROMIUM_PASS',scope:'R23.4 simulated DOM and scripted sandbox iframe; NOT the ChatGPT host, real AI provider, Chrome permission, Mac IME or RunHost',head,gitBlobSha:blob,sha256:hash,
    chromiumVersion:browser.version(),checks,errors,externalRequests,screenshots,independentUxScore:'NOT_SCORED'};
  console.log('R2391_SOURCE_BOUND_CHROMIUM_PASS '+checks.length);
  await writeFile(resolve(out,'r232-evidence.json'),JSON.stringify(report,null,2));
}catch(error){
  const report={status:'PREVIEW_CHROMIUM_FAIL',scope:'R23.4 offline HTML',head,gitBlobSha:blob,sha256:hash,error:String(error?.stack||error),checks,errors,screenshots,chromiumVersion:browser.version()};
  await writeFile(resolve(out,'r232-evidence.json'),JSON.stringify(report,null,2));
  console.error(error);process.exitCode=1;
}finally{await browser.close()}
