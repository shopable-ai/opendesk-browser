// Run with ego-browser nodejs; Replace EGO_TEST_SPACE with your dedicated TaskSpace ID via stdin.
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const t=await taskSpace(EGO_TEST_SPACE);
const p=await t.newPage();
const base='http://127.0.0.1:62824';
const build='/projects/ai-send-queue/dist';
await p.goto(base+'/projects/ai-send-queue/tests/fixtures/sidebar-status.html?build='+encodeURIComponent(build));
const expectStatus=text=>p.waitForFunction(s=>document.querySelector('[role=status]')?.textContent===s,text,{timeout:4000});
await expectStatus('队列已就绪');
for(const w of [680,320,680]){
  await p.cdp('Emulation.setDeviceMetricsOverride',{width:w,height:650,deviceScaleFactor:1,mobile:false});
  await p.evaluate(()=>window.sidebarFixture.target('https://chatgpt.com','composer-unavailable'));
  await p.click('.send-queue-status-row button');
  await expectStatus('输入框暂不可用');
  await p.click('summary');
  const a=await p.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
    diagnostic:document.querySelector('details').innerText.includes('未找到输入框'),
    status:document.querySelector('[role=status]').textContent}));
  assert(!a.overflow&&a.diagnostic,'side panel state clipped or diagnostic hidden');
  await p.evaluate(()=>window.sidebarFixture.target('https://chatgpt.com','ready'));
  await p.click('.send-queue-status-row button');await expectStatus('队列已就绪');
  assert(await p.evaluate(()=>!document.querySelector('details')),'stale diagnostic after ready');
  console.log('SIDEBAR',JSON.stringify(a));
}
await p.evaluate(()=>window.sidebarFixture.target('https://gemini.google.com/app/fixture','ready'));
await p.click('.send-queue-status-row button');await expectStatus('队列已就绪');
assert(await p.evaluate(()=>window.sidebarFixture.calls.at(-1)==='page.request'),'supported Gemini conversation did not reach page bridge');
for(const url of ['https://gemini.google.com/library','https://chat.deepseek.com/a/chat/s/1234','https://example.test']){
  // After an unsupported result there is no recheck button; reopen the view
  // with the next simulated active URL (before its first host response).
  await p.goto(base+'/projects/ai-send-queue/tests/fixtures/sidebar-status.html?build='+encodeURIComponent(build));
  await expectStatus('队列已就绪');
  await p.evaluate(target=>window.sidebarFixture.target(target,'ready'),url);
  await p.click('.send-queue-status-row button');await expectStatus('请打开 ChatGPT 或 Gemini 对话');
  assert(await p.evaluate(()=>window.sidebarFixture.calls.at(-1)==='currentPage.info'),'unsupported target reached page bridge');
}
console.log('SIDEBAR Gemini ready; unsupported routes did not call the page bridge');
await p.close();
