import assert from 'node:assert/strict';
import test from 'node:test';
import {createGestureTrack,updateGestureTrack,gestureOutcome,normalizeGestureMappings} from '../src/page/segments.js';
const play=(...points)=>{const t=createGestureTrack(200,100);for(const [x,y] of points)updateGestureTrack(t,x,y);return t;};
test('ordinary right click and candidate path never execute',()=>{
  assert.equal(gestureOutcome(play([190,100])).action,null);
  for(const [dir,dx,dy] of [['left',-1,0],['right',1,0],['up',0,-1],['down',0,1]]){
    for(const distance of [11,12,55,56]){
      const t=play([200+dx*distance,100+dy*distance]);
      const label=`${dir} ${distance}px`;
      assert.equal(t.intent,distance>=12,label);
      assert.equal(t.invalid,false,label);
      assert.equal(t.current?.dir??null,distance>=12?dir:null,label);
      assert.equal(t.stage,distance<12?'pending':distance<56?'dragging':'recognized',label);
      assert.deepEqual(gestureOutcome(t),distance<56
        ?{sequence:'',action:null,state:'pending'}
        :{sequence:dir,action:dir,state:'mapped'},label);
    }
  }
});
test('diagonal intent uses total distance without recognizing an axis',()=>{
  for(const sx of [-1,1])for(const sy of [-1,1]){
    for(const [offset,intent,stage] of [[8,false,'pending'],[9,true,'dragging'],[28,true,'dragging']]){
      const t=play([200+sx*offset,100+sy*offset]);
      assert.equal(t.intent,intent);
      assert.equal(t.stage,stage);
      assert.equal(t.current,null);
      assert.deepEqual(gestureOutcome(t),{sequence:'',action:null,state:'pending'});
    }
    const t=play([200+sx*56,100+sy*28]);
    const dir=sx<0?'left':'right';
    assert.deepEqual(gestureOutcome(t),{sequence:dir,action:dir,state:'mapped'});
  }
});
test('reversal of exactly 12px is tolerated but 13px invalidates the track',()=>{
  for(const [dir,dx,dy] of [['left',-1,0],['right',1,0],['up',0,-1],['down',0,1]]){
    for(const peak of [55,56])for(const reverse of [12,13]){
      const t=play([200+dx*peak,100+dy*peak],
        [200+dx*(peak-reverse),100+dy*(peak-reverse)]);
      const label=`${dir} peak ${peak}px reverse ${reverse}px`;
      assert.equal(t.invalid,reverse===13,label);
      assert.deepEqual(gestureOutcome(t),{
        sequence:peak===56?dir:'',
        action:peak===56&&reverse===12?dir:null,
        state:reverse===13?'invalid':peak===56?'mapped':'pending'
      },label);
      if(reverse===13){
        updateGestureTrack(t,200+dx*80,100+dy*80);
        assert.equal(gestureOutcome(t).state,'invalid',label);
      }
    }
  }
});
test('second segment needs 56px and an explicit mapping for every right-angle combination',()=>{
  const vectors={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};
  for(const first of ['left','right','up','down']){
    const turns=first==='left'||first==='right'?['up','down']:['left','right'];
    for(const second of turns){
      const [dx,dy]=vectors[first], [tx,ty]=vectors[second];
      const x=200+dx*56,y=100+dy*56;
      const key=`${first}-${second}`;
      const mappings={[key]:'up'};
      const t=play([x,y],[x+tx*11,y+ty*11]);
      assert.equal(t.turning,false,key);
      assert.deepEqual(gestureOutcome(t,mappings),{sequence:first,action:first,state:'mapped'},key);
      for(const distance of [12,55]){
        updateGestureTrack(t,x+tx*distance,y+ty*distance);
        assert.equal(t.turning,true,key);
        assert.equal(t.segments.length,1,key);
        assert.deepEqual(gestureOutcome(t,mappings),{sequence:first,action:null,state:'incomplete'},key);
      }
      updateGestureTrack(t,x+tx*56,y+ty*56);
      assert.equal(t.turning,false,key);
      assert.equal(t.segments.length,2,key);
      assert.deepEqual(gestureOutcome(t),{sequence:key,action:null,state:'unmapped'},key);
      assert.deepEqual(gestureOutcome(t,{[`${second}-${first}`]:'right'}),
        {sequence:key,action:null,state:'unmapped'},key);
      assert.deepEqual(gestureOutcome(t,mappings),{sequence:key,action:'up',state:'mapped'},key);
    }
  }
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
