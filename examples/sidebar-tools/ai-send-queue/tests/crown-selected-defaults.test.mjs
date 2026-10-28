import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const text=path=>readFileSync(resolve(root,path),'utf8');
const css=text('assets/queue.css'),html=text('preview/index.html'),tuner=text('preview/tools/crown-tuner.html');
const declared=(key)=>{const found=css.match(new RegExp('--sq-crown-'+key+':(-?\\d+(?:\\.\\d+)?)(px|deg)'));assert.ok(found,'missing '+key);return Number(found[1]);};

test('34/42 use CSS-owned artwork geometry, not frozen historical slider numbers',()=>{
 const desktop={w:declared('desktop-w'),h:declared('desktop-h'),x:declared('desktop-x'),y:declared('desktop-y'),angle:declared('desktop-angle')};
 const touch={w:declared('touch-w'),h:declared('touch-h'),x:declared('touch-x'),y:declared('touch-y'),angle:declared('touch-angle')};
 assert.ok(desktop.w>=20&&desktop.w<=38&&desktop.h>=18&&desktop.h<=34);
 assert.ok(touch.w>desktop.w&&touch.h>desktop.h&&touch.w<=43);
 for(const p of [desktop,touch]){assert.ok(p.angle>=-30&&p.angle<=25);assert.ok(Math.abs(p.x)<12&&Math.abs(p.y)<27)}
 assert.match(css,/--sq-crown-w:var\(--sq-crown-desktop-w\)/);
 assert.match(css,/@media\(pointer:coarse\)[\s\S]*--sq-crown-w:var\(--sq-crown-touch-w\)/);
 assert.match(html,/\.size-34 \.sq-send\{--sq-crown-w:var\(--sq-crown-desktop-w\)/);
 assert.match(html,/\.size-42 \.sq-send\{--sq-crown-w:var\(--sq-crown-touch-w\)/);
 assert.match(css,/\.sq-crown\{[^}]*pointer-events:none/);
});

test('standalone tuner derives temporary defaults from formal CSS without modifying main preview',()=>{
 assert.match(tuner,/function readBase\(\)/);
 assert.match(tuner,/getComputedStyle\(preview\)/);
 assert.match(tuner,/for\(const key of keys\)preview\.style\.removeProperty\(key\)/);
 assert.match(tuner,/\$\('reset'\)\.addEventListener\('click',reset\)/);
 assert.match(tuner,/\$\('angle'\)\.value=String\(official\.angle\)/);
 assert.doesNotMatch(html,/tools\/crown-tuner\.html/);
 assert.doesNotMatch(html,/id="angle"|id="scale"|id="restore-style"/);
});

test('preview keeps three initial rows, expansion, conservative draft protection',()=>{
 assert.match(html,/expanded\?items:items\.slice\(0,3\)/);
 assert.match(html,/items\.length<=3/);
 assert.match(html,/aria-expanded/);
 assert.match(html,/输入框已有草稿：不会覆盖/);
 assert.match(html,/暂停此条/);
 assert.doesNotMatch(html,/队列已暂停|id="toggle-pause"/);
 assert.match(html,/模拟 AI 回复完成/);
});

test('production queue view retains original three-item window and no crown behavior change',()=>{
 const view=text('src/page/view.js');
 assert.ok(view.includes('state.expanded?items:items.slice(0,3)'));
 assert.ok(view.includes('if(items.length>3)'));
 assert.ok(view.includes("'展开其余 '+(items.length-3)+' 条'"));
 assert.ok(view.includes("more.setAttribute('aria-expanded',String(state.expanded))")||view.includes("more.setAttribute('aria-expanded',String(expanded))"));
 assert.ok(view.includes("crown.setAttribute('aria-hidden','true')"));
});

test('approved frontal crown is wide, source-bound, and minimally corrected by default',()=>{
 for(const name of ['desktop','touch']){
   assert.ok(declared(name+'-w')>declared(name+'-h'));
   assert.equal(declared(name+'-angle'),-1);
 }
 assert.match(css,/pointer-events:none;z-index:2/);
 assert.match(tuner,/<output id="angle-out"><\/output>/);
 assert.match(tuner,/id="angle" type="range"/);
 assert.match(tuner,/\$\('angle'\)\.value=String\(official\.angle\)/);
});

test('34/42 fixed CSS geometry centers the artwork and preserves a clear arrow zone',()=>{
 for(const [name,button,svg] of [['desktop',34,17],['touch',42,20]]){
   const w=declared(name+'-w'),h=declared(name+'-h'),x=declared(name+'-x'),y=declared(name+'-y');
   assert.ok(Math.abs(x+w/2-button/2)<=3,'CSS box must align with blue button center: '+name);
   assert.ok(y+h>=button*.16,'crown must sit over the upper blue arc: '+name);
   const arrowStart=(button-svg)/2+svg*5/24;
   assert.ok(y+h<arrowStart-1,'crown CSS box must not reach the arrow head: '+name);
   assert.ok(Math.abs(declared(name+'-angle'))<=5,'avoid an exaggerated second tilt: '+name);
 }
 assert.match(css,/\.sq-crown\{[^}]*filter:none/,'do not add a synthetic shadow layer');
});

test('R5.4 selected values are baked exactly once into formal CSS for both button sizes',()=>{
 const base={desktop:{w:32,h:23,x:1,y:-13},touch:{w:39,h:28,x:1,y:-16}};
 const round=v=>Number(v.toFixed(2));
 for(const [name,p] of Object.entries(base)){
   const w=round(p.w*.85),h=round(p.h*.85);
   const x=round(p.x-(w-p.w)*.5-2),y=round(p.y-(h-p.h)*.78-3);
   assert.deepEqual([declared(name+'-w'),declared(name+'-h'),declared(name+'-x'),declared(name+'-y'),declared(name+'-angle')],[w,h,x,y,-1],name);
 }
 assert.match(tuner,/<link rel="stylesheet" href="\.\.\/\.\.\/assets\/queue\.css">/);
 assert.match(tuner,/id="scale" type="range"[^>]*value="100"/);
 assert.match(tuner,/id="x" type="range"[^>]*value="0"/);
 assert.match(tuner,/id="y" type="range"[^>]*value="0"/);
 assert.match(tuner,/\$\('scale'\)\.value='100'/);
 assert.match(tuner,/\$\('x'\)\.value='0'/);
 assert.match(tuner,/\$\('y'\)\.value='0'/);
});
