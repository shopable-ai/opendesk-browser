import test from 'node:test';
import assert from 'node:assert/strict';
import {readingTocSafeViewport,foldPoint} from '../trusted/view.js';
import {tocPlacementPoint} from '../trusted/placement.js';

const win=(width,clientWidth=width)=>({
  innerWidth:width,innerHeight:900,document:{documentElement:{clientWidth}}
});
const folded={width:38,height:46};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,
  'expected '+actual+' to equal '+expected);

for(const width of [1440,1024,720,320,200]){
  test('compact edge gap stays free in expanded and folded TOC at '+width+'px',()=>{
    const safe=readingTocSafeViewport(win(width));
    const guard=Math.min(8,width/10);
    // Custom placement uses the existing 8px position gap, not the default
    // wide viewport's 12px tab protrusion.
    const tabGap=8;
    const panel={width:Math.min(254,safe.width-24),height:350};
    for(const side of ['left','right']){
      const saved={v:1,dock:side,x:side==='right'?1:0,y:.4};
      const tab=foldPoint(0,220,side,saved,safe);
      close(side==='left'?tab.left:width-tab.left-folded.width,guard);
      assert.equal(tab.top,220);
      const point=tocPlacementPoint(saved,panel,safe);
      const clearance=side==='left'?point.left-tabGap:width-point.left-panel.width-tabGap;
      assert.ok(clearance>=guard-1e-6);
    }
    const defaultTab=foldPoint(width,220,'right',null,safe);
    close(width-defaultTab.left-folded.width,guard);
    const free={v:1,dock:'free',x:.9,y:.4};
    const freeTab=foldPoint(width,220,'right',free,safe);
    assert.ok(freeTab.left+folded.width<=width-guard+1e-6);
  });
}
test('classic scrollbar width is excluded once, then the overlay guard is applied',()=>{
  const safe=readingTocSafeViewport(win(1440,1425));
  assert.deepEqual(safe,{left:8,top:0,width:1409,height:900});
  const measured=readingTocSafeViewport({...win(1440,1425),visualViewport:{
    width:1425,height:900,offsetLeft:0,offsetTop:0
  }});
  assert.deepEqual(measured,safe);
});
test('visual viewport resize and offset still constrain a folded tab',()=>{
  const safe=readingTocSafeViewport({...win(1440,1425),visualViewport:{
    width:800,height:500,offsetLeft:100,offsetTop:30
  }});
  assert.deepEqual(safe,{left:108,top:30,width:784,height:500});
  const tab=foldPoint(999,999,'right',null,safe);
  close(tab.left+folded.width,892);
  assert.ok(tab.top+folded.height<=530);
});
