import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Regression guard: the offline preview is a design review surface, not a
// replacement icon library or a second production navigation engine.
const source=readFileSync(new URL('../src/floating-navigation.js',import.meta.url),'utf8');
const preview=readFileSync(new URL('../preview/index.html',import.meta.url),'utf8');

test('offline preview preserves all four production navigation SVG paths',()=>{
  const icons=[
    ['top','i-jump-top'],
    ['previous','i-up'],
    ['next','i-down'],
    ['bottom','i-jump-bottom']
  ];
  for(const [key,symbol] of icons){
    const actual=source.match(new RegExp(`\\b${key}:make\\('[^']+','[^']+','([^']+)'\\)`));
    const displayed=preview.match(new RegExp(`<symbol id="${symbol}"[^>]*>\\s*<path d="([^"]+)"`));
    assert.ok(actual,'production SVG for '+key+' must exist');
    assert.ok(displayed,'preview SVG symbol '+symbol+' must exist');
    assert.equal(displayed[1],actual[1],symbol+' must match the production SVG path');
  }
});

test('preview retains compact dock geometry and production viewport breakpoint',()=>{
  assert.ok(source.includes('.stack.paging:not(.compact){gap:3px}'));
  assert.ok(source.includes('height:28px;border-radius:9px'));
  assert.ok(preview.includes('.sim-dock #sim-prev,.sim-dock #sim-next{height:28px'));
  assert.ok(preview.includes('.sim-dock{position:absolute;left:120px;bottom:84px;z-index:3;display:flex;align-items:center;flex-direction:column;gap:3px}'));
  assert.ok(source.includes('const compact=win.innerWidth<600;'));
  assert.ok(preview.includes('@media(max-width:599px)'));
});

test('preview exposes the accepted interaction without adding a second runtime',()=>{
  assert.ok(preview.includes('R4.4 正式图标与紧凑导航交互预览'));
  for(const id of ['sim-scroll','sim-first','sim-prev','sim-next','sim-last',
    'sim-add','sim-toggle-count','sim-status','sim-status-text']){
    assert.equal(preview.split('id="'+id+'"').length-1,1,'one '+id+' control is expected');
  }
  assert.ok(preview.includes('sim-status-text'));
  assert.ok(preview.includes("const available=labels.filter"));
  assert.ok(preview.includes("('sim-toggle-count').checked"));
  assert.ok(preview.includes("('flag-show-turn-count').checked"));
  assert.ok(preview.includes('id="sim-count" class="sim-count" role="status" aria-live="off" hidden'));
});

test('R4.4 preview pager returns to current question before previous round',()=>{
  const start=preview.indexOf('  function simIndex(){');
  const end=preview.indexOf('  function renderSim(){',start);
  assert.ok(start>=0&&end>start,'preview exports a bounded offline navigation model');
  const simScroll={scrollTop:0,scrollHeight:2400,clientHeight:400};
  const rows=[10,390,770,1150,1530,1910].map(offsetTop=>({offsetTop}));
  const {simIndex,simDestination}=new Function('simScroll','simRows',
    preview.slice(start,end)+'\nreturn {simIndex,simDestination};'
  )(simScroll,()=>rows);
  simScroll.scrollTop=2000;
  assert.equal(simIndex(),5);
  assert.equal(simDestination('previous'),5,'bottom returns to the last question');
  assert.equal(simDestination('next'),-1,'no next question after the last one');
  simScroll.scrollTop=1902;
  assert.equal(simDestination('previous'),4,'at last question go to preceding round');
  simScroll.scrollTop=320;
  assert.equal(simIndex(),0);
  assert.equal(simDestination('previous'),0,'long first reply returns to its question');
  simScroll.scrollTop=2;
  assert.equal(simDestination('previous'),-1,'first question is the upper boundary');
});

test('preview boundary controls remain keyboard focusable and non-navigating',()=>{
  assert.ok(preview.includes("setAttribute('aria-disabled',String(previousPage<0))"));
  assert.ok(preview.includes("setAttribute('aria-disabled',String(nextPage<0))"));
  assert.ok(preview.includes("getAttribute('aria-disabled')==='true')return"));
  assert.ok(preview.includes("simJump(simDestination('previous'))"));
  assert.ok(preview.includes("simJump(simDestination('next'))"));
});
