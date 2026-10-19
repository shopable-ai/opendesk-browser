import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';

test('R37 trusted settings use projections/actions and clear them with the view',()=>{
  const view=createSidebarToolsView();
  const model={visible:true,busy:false},actions={grantIdle(){}};
  view.trustedSettings.timeReview.connect(actions);
  view.trustedSettings.timeReview.render(model);
  assert.deepEqual(view.getSnapshot().trustedSettings.timeReview,model);
  assert.equal(view.trustedSettingsActions.timeReview,actions);
  view.dispose();
  view.trustedSettings.timeReview.render({visible:true});
  assert.equal(view.getSnapshot().trustedSettings.timeReview,null);
  assert.equal(view.trustedSettingsActions.timeReview,undefined);
});

test('R37 trusted settings controllers have no legacy DOM renderer',async()=>{
  for(const feature of ['time-review','stay-focus','ai-vip-share']){
    const source=await readFile(`examples/sidebar-tools/${feature}/trusted/host-controls.js`,'utf8');
    assert.doesNotMatch(source,/createElement|addEventListener|replaceChildren|getElementById|\.textContent|\.hidden\s*=/,feature);
  }
  const source=await readFile('src/ui/react/tabs/tool-host.tsx','utf8');
  assert.doesNotMatch(source,/TrustedSettingsIsland|runtimeRefs\.(trustedSettings|aiProxy)/);
});

import {settingsReactFixture} from '../helpers/trusted-settings-react-fixture.mjs';
import {createTimeReviewPermissionControls} from '../../examples/sidebar-tools/time-review/trusted/host-controls.js';
import {createStayFocusPermissionControls} from '../../examples/sidebar-tools/stay-focus/trusted/host-controls.js';
import {createAiAccessPermissionControls} from '../../examples/sidebar-tools/ai-vip-share/trusted/host-controls.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('R37 React settings forwards the original native click synchronously and escapes site labels',t=>{
  const f=settingsReactFixture('timeReview',t);let received;
  f.ui.connect({'time-review-grant-idle':event=>{received=event;}});
  f.ui.render({visible:true,busy:false,origins:['<script>private</script>'],siteStatus:'ready'});
  const event=new f.window.Event('click',{bubbles:true});
  f.find('time-review-grant-idle').dispatchEvent(event);
  assert.equal(received,event);
  assert.equal(f.root.querySelector('script'),null);
  assert.match(f.find('time-review-site-grants-list').textContent,/<script>private/);
});

test('R37 Focus permission starts synchronously, denial and disposal cannot enable',async t=>{
  const f=settingsReactFixture('stayFocus',t);let approve,requests=0,operations=0;
  const controls=createStayFocusPermissionControls({ui:f.ui,notice(){},api:{permissions:{request(){
    requests++;return new Promise(resolve=>{approve=resolve;});}}},runOperation:async()=>{operations++;}});
  controls.render({id:'stay-focus',capabilities:['focus.control']},false,true);
  f.invoke('stay-focus-enable-native',{isTrusted:false});assert.equal(requests,0);
  f.invoke('stay-focus-enable-native');assert.equal(requests,1);
  controls.dispose();approve(true);await tick();
  assert.equal(operations,0);assert.equal(f.model,null);assert.equal(f.actions,null);
});

test('R37 Time permission reply and site read cannot revive disposed settings',async t=>{
  const f=settingsReactFixture('timeReview',t);let approve;
  const controls=createTimeReviewPermissionControls({ui:f.ui,notice(){},api:{permissions:{request(){
    return new Promise(resolve=>{approve=resolve;});}}},runOperation:async()=>assert.fail('no Host after dispose')});
  controls.render({id:'time-review',capabilities:['time.review']});
  f.invoke('time-review-grant-idle');controls.dispose();approve(true);await tick();
  assert.equal(f.model,null);assert.equal(f.actions,null);
});

test('R37 AI STOP interrupts pending ENABLE and ignores its late reply',async t=>{
  const f=settingsReactFixture('aiAccess',t);let enable;const calls=[];
  const controls=createAiAccessPermissionControls({ui:f.ui,notice(){},api:{},runOperation:async op=>{
    calls.push(op);if(op==='aiAccess.enable')return new Promise(resolve=>{enable=resolve;});
    return {state:'disabled',canStop:false};}});
  controls.render({id:'ai-vip-share',capabilities:['ai.access']},false,true);await tick();
  f.invoke('ai-access-toggle');await tick();
  assert.equal(f.find('ai-access-toggle').disabled,false);assert.equal(f.find('ai-access-toggle').textContent,'停用代理');
  f.invoke('ai-access-toggle');await tick();await tick();enable({state:'enabled'});await tick();
  assert.deepEqual(calls,['aiAccess.status','aiAccess.enable','aiAccess.disable','aiAccess.status']);
  assert.equal(f.find('ai-access-toggle').textContent,'启用代理');
  controls.dispose();assert.equal(f.model,null);assert.equal(f.actions,null);
});
