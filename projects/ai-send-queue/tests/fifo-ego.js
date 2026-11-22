// Run against the local fixture only; replace EGO_TEST_SPACE before running.
const t=await taskSpace(EGO_TEST_SPACE);
const p=await t.newPage();
const assert=(value,message)=>{if(!value)throw Error(message);};
const size=width=>p.cdp('Emulation.setDeviceMetricsOverride',{width,height:870,deviceScaleFactor:1,mobile:false});
const state=()=>p.evaluate(()=>window.fifoFixture.state());
const step=ms=>p.evaluate(ms=>window.fifoFixture.step(ms),ms);
const finishReply=()=>p.evaluate(()=>window.fifoFixture.finishReply());
const expected=['第一条，本地模拟 🙂','第二条，本地模拟'];
await size(390);
await p.goto('http://127.0.0.1:62824/projects/ai-send-queue/tests/fixtures/long-text.html?fifo');
await p.waitForFunction(()=>!!window.fifoFixture,undefined,{timeout:4000});
assert(await p.evaluate(()=>window.queueFixture.fit()),'crown did not fit narrow composer');
for(const text of expected){
  await p.focus('#prompt-textarea');await p.keyboard.insertText(text);
  const point=await p.evaluate(()=>{
    const button=document.querySelector('[data-fixture-ui$=".button"]')?.shadowRoot?.querySelector('button.sq-send');
    const r=button?.getBoundingClientRect();return r?.width&&r?.height?[r.x+r.width/2,r.y+r.height/2]:null;
  });
  assert(point,'crown is not visible');
  await p.mouse.click(...point,{label:'Queue local sample message'});
  assert((await state()).draft==='','queued draft not cleared');
}
assert((await state()).items.map(item=>item.text).join('|')===expected.join('|'),'queued order or text changed');
await step(0);await step(1200);await step(0);await step(0);
let reply=await state();
assert(reply.sends.length===1&&reply.sends[0]===expected[0]&&reply.items[0]?.text===expected[1],'wrong first dispatch');
await size(800);assert(await p.evaluate(()=>window.queueFixture.fit()),'queue disappeared on resize');
await step(1600);await step(1600);reply=await state();
assert(reply.sends.length===1&&reply.draft===''&&reply.reason.includes('回复完成'),'second message dispatched before first reply completed');
await finishReply();await step(0);await step(1200);await step(1200);await step(0);await step(0);
const second=await state();
assert(second.sends.join('|')===expected.join('|')&&second.items.length===0,'second message not sent exactly once after reply');
await finishReply();await step(0);await step(1200);
console.log({fixture:'local source and simulated reply',widths:[390,800],sends:2,ordered:true,waitedForReply:true,realMessages:0});
await p.close();
