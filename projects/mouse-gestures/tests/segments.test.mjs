import assert from 'node:assert/strict';
import test from 'node:test';
import {createGestureTrack,updateGestureTrack,gestureOutcome,normalizeGestureMappings} from '../src/page/segments.js';
const play=(...points)=>{const t=createGestureTrack(200,100);for(const [x,y] of points)updateGestureTrack(t,x,y);return t;};
test('ordinary right click and candidate path never execute',()=>{
  assert.equal(gestureOutcome(play([190,100])).action,null);
  assert.equal(gestureOutcome(play([188,100])).action,null);
  assert.equal(gestureOutcome(play([145,100])).action,null);
});
test('single directions and same-direction movement stay one segment',()=>{
  for(const [pt,dir] of [[[110,100],'left'],[[290,100],'right'],[[200,10],'up'],[[200,190],'down']]){
    assert.equal(gestureOutcome(play(pt)).action,dir);
  }
  const t=play([150,100],[110,100],[70,100]);
  assert.equal(t.segments.length,1);assert.equal(gestureOutcome(t).action,'left');
});
test('two right-angle turns recognize, but are not mapped by default',()=>{
  for(const [p1,p2,key] of [[[110,100],[110,175],'left-down'],[[200,180],[285,180],'down-right'],[[200,10],[280,10],'up-right']]){
    const t=play(p1,p2);assert.deepEqual(t.segments.map(x=>x.dir).join('-'),key);
    assert.deepEqual(gestureOutcome(t),{sequence:key,action:null,state:'unmapped'});
    assert.equal(gestureOutcome(t,{[key]:'up'}).action,'up');
  }
});
test('unfinished turn must never fall back to one-direction action',()=>{
  const t=play([110,100],[110,118]);
  assert.equal(t.turning,true);assert.equal(gestureOutcome(t).action,null);
  assert.equal(gestureOutcome(t).state,'incomplete');
  updateGestureTrack(t,110,105);assert.equal(gestureOutcome(t).action,null);
});
test('reversals, diagonal and third-turn attempts remain invalid',()=>{
  const r=play([110,100],[130,100]);assert.equal(gestureOutcome(r).action,null);
  const d=play([110,155]);assert.equal(gestureOutcome(d).action,null);
  const t=play([110,100],[110,170],[170,170]);assert.equal(gestureOutcome(t).action,null);
});
test('mapping rejects unknown keys or privileged actions',()=>{
  assert.deepEqual(normalizeGestureMappings({'left-down':'close-tab','up-right':'left','left-right':'right'}),{'up-right':'left'});
});
