// Run with EGO_TEST_SPACE and EGO_TEST_BASE (the repository's local test server).
const task=await taskSpace(EGO_TEST_SPACE),page=task.page('p1');
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const state=()=>page.evaluate(()=>emptyCrownFixture.state());
const crown=()=>page.click('.sq-send',{label:'Click the queue crown'});
const toast=text=>page.waitForFunction(text=>emptyCrownFixture.state().toast===text,text,{timeout:2000});
const tick=(ms=0)=>page.evaluate(ms=>{emptyCrownFixture.advance(ms);return emptyCrownFixture.poll();},ms);
const edit=text=>page.fill('#prompt-textarea',text);
const queue=async text=>{
  await edit(text);await crown();
  await page.waitForFunction(()=>emptyCrownFixture.state().draft==='',undefined,{timeout:2000});
  await tick();
};

await page.cdp('Network.enable');
await page.cdp('Network.setCacheDisabled',{cacheDisabled:true});
await page.goto(EGO_TEST_BASE+'/projects/ai-send-queue/tests/fixtures/empty-crown.html');
await page.waitForFunction(()=>emptyCrownFixture.ready,undefined,{timeout:4000});
await page.evaluate(()=>emptyCrownFixture.go('/'));
await crown();await toast('发送队列为空');
assert((await state()).sends.length===0,'empty home composer sent a message');
await edit('新对话草稿');await page.dblclick('.sq-send',{label:'Double click the crown'});
await tick();
assert((await state()).sends.join('|')==='新对话草稿','home crown did not submit the first draft exactly once');

await queue('暂停样例');
await page.click('button[data-action=pause]',{label:'Pause the queued message'});
await crown();await toast('请先恢复要发送的队列消息');
let current=await state();
assert(current.rows[0]?.paused&&current.sends.length===1,'empty click resumed a paused message');
await page.click('button[data-action=remove]',{label:'Remove the paused sample'});

await queue('队列第一条');await queue('队列第二条');
await crown();await tick(2000);current=await state();
assert(current.draft===''&&current.sends.length===1&&current.stopClicks===0,'empty click interrupted an active reply');
await page.evaluate(()=>emptyCrownFixture.finishReply());
// The click must start the normal idle check before any scheduled poll.
const checks=(await state()).checks;
await crown();
await page.waitForFunction(checks=>emptyCrownFixture.state().checks>checks,checks,{timeout:2000});
await crown();
await tick(1200);await tick(1200);
assert((await state()).draft==='队列第一条','empty click did not start normal FIFO dispatch');
await tick();await tick();
await tick(3200);current=await state();
assert(current.sends.join('|')==='新对话草稿|队列第一条'&&current.draft===''&&current.stopClicks===0,
  'repeated click sent a duplicate or bypassed the active reply');
await page.evaluate(()=>emptyCrownFixture.finishReply());
await tick();await tick(1200);await tick(1200);await tick();await tick();
current=await state();
assert(current.sends.join('|')==='新对话草稿|队列第一条|队列第二条'&&current.rows.length===0&&current.stopClicks===0,
  'FIFO dispatch was not confirmed exactly once per message');
console.log({fixture:'LOCAL_SOURCE_NOT_INSTALLED',sends:current.sends,stopClicks:current.stopClicks,
  newChatEmpty:true,firstSendOnce:true,pausedPreserved:true,waitedForReply:true,realMessages:0});
