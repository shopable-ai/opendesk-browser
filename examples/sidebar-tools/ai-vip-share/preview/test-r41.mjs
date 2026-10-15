// Offline model tests only. No Chrome API, network, provider or SDK acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('./ai-vip-share-r4-preview.html',import.meta.url),'utf8');
const script=html.match(/<script id="proxy-demo-model">([\s\S]*?)<\/script>/)?.[1];
assert(script,'Offline model script is required');
const sandbox={};runInNewContext(script,sandbox);
const M=sandbox.AIVipProxyPreview;
const stop=s=>{const next=M.reduce(s,{type:'stop'});return M.reduce(next,{type:'stopped',revision:next.revision});};
for(const scenario of ['member','conflict','other-tool','locked','unknown','stop-failed','provider-stop','expired-stop']){
 test(`stop remains accessible: ${scenario}`,()=>assert.equal(M.canStop(M.initial(scenario)),true));
}
for(const scenario of ['member','conflict','other-tool','locked','provider-stop','expired-stop']){
 test(`local stop does not change external controller: ${scenario}`,()=>{
  const before=M.initial(scenario),after=stop(before);
  assert.equal(after.desired,false);assert.equal(after.mode,'existing');
  assert.equal(after.operation,'idle');assert.equal(after.ownPreference,false);
  assert.equal(after.owner,before.owner==='self'?'none':before.owner);
  assert.equal(after.member,before.member);assert.equal(after.provider,before.provider);
 });
}
test('stop invalidates a delayed start completion',()=>{
 const starting=M.reduce(M.initial('existing'),{type:'start'});
 const stopping=M.reduce(starting,{type:'stop'});
 const late=M.reduce(stopping,{type:'started',revision:starting.revision});
 assert.equal(late.desired,false);assert.equal(late.owner,'none');assert.equal(late.operation,'stopping');
});
test('only matching start acknowledgement reports enabled',()=>{
 const s=M.reduce(M.initial('existing'),{type:'start'});
 assert.equal(s.owner,'none');
 assert.equal(M.reduce(s,{type:'started',revision:s.revision+1}).owner,'none');
 assert.equal(M.reduce(s,{type:'started',revision:s.revision}).owner,'self');
});
test('unknown release does not claim successful stop',()=>{
 const s=stop(M.initial('unknown'));assert.equal(s.desired,false);
 assert.equal(s.operation,'stop_failed');assert.equal(M.canStop(s),true);
});
test('failed stop remains retryable',()=>{
 const s=stop(M.initial('stop-failed'));assert.equal(s.operation,'stop_failed');
 assert.equal(M.canStop(s),true);assert.equal(stop(s).owner,'none');
});
for(const scenario of ['conflict','other-tool','locked','unknown','blocked','guest','expired']){
 test(`no start without eligibility or ownership: ${scenario}`,()=>{
  const s=M.initial(scenario);assert.equal(M.canStart(s),false);
  assert.equal(M.reduce(s,{type:'start'}),s);
 });
}
for(const event of ['wake','refresh','redeemed']){
 test(`${event} does not resume proxy after stop`,()=>{
  const s=stop(M.initial('member'));assert.equal(M.reduce(s,{type:event}),s);
 });
}
test('external controller disappearing does not reactivate dormant preference',()=>{
 const s=stop(M.initial('conflict'));
 const after=M.reduce(s,{type:'ownerChanged',owner:'none'});
 assert.equal(after.desired,false);assert.equal(after.ownPreference,false);assert.equal(after.mode,'existing');
});
test('ownership change cancels a pending start',()=>{
 const s=M.reduce(M.initial('existing'),{type:'start'});
 const changed=M.reduce(s,{type:'ownerChanged',owner:'extension'});
 assert.equal(M.reduce(changed,{type:'started',revision:s.revision}),changed);
});
test('prototype has separate selection and explicit confirmation',()=>{
 assert.match(html,/选择后仍需确认，不会立即更改网络/);
 assert.match(html,/id="proxy-confirm"/);assert.match(html,/id="proxy-cancel"/);
 assert.match(html,/id="proxy-toggle"/);assert.match(html,/会员有效期仍继续计算/);
});
