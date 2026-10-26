import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const text=path=>readFileSync(resolve(root,path),'utf8');
const css=text('assets/queue.css'),html=text('preview/index.html');
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

test('preview reset gets formal values from computed styles; tuning is temporary only',()=>{
 assert.match(html,/function restoreStyle\(\)/);
 assert.match(html,/getComputedStyle\(b\)/);
 assert.match(html,/for\(const key of crownKeys\)b\.style\.removeProperty\(key\)/);
 assert.match(html,/\$\('restore-style'\)\.addEventListener\('click',restoreStyle\)/);
 assert.match(html,/restoreStyle\(\);render\(\);toast\('已恢复正式方案 C/);
 assert.doesNotMatch(html,/\[\['angle',-25\],\['scale',85\],\['offsetX',-4\],\['offsetY',2\]\]/);
});

test('preview keeps three initial rows, expansion, conservative draft protection',()=>{
 assert.match(html,/expanded\?items:items\.slice\(0,3\)/);
 assert.match(html,/items\.length<=3/);
 assert.match(html,/aria-expanded/);
 assert.match(html,/输入框已有草稿：不会覆盖/);
 assert.match(html,/暂停队列/);
 assert.match(html,/模拟 AI 回复完成/);
});

test('production queue view retains original three-item window and no crown behavior change',()=>{
 const view=text('src/view.js');
 assert.ok(view.includes('state.expanded?items:items.slice(0,3)'));
 assert.ok(view.includes('if(items.length>3)'));
 assert.ok(view.includes("'展开其余 '+(items.length-3)+' 条'"));
 assert.ok(view.includes("more.setAttribute('aria-expanded',String(state.expanded))")||view.includes("more.setAttribute('aria-expanded',String(expanded))"));
 assert.ok(view.includes("crown.setAttribute('aria-hidden','true')"));
});

test('approved frontal crown is wide, source-bound, and minimally corrected by default',()=>{
 for(const name of ['desktop','touch']){
   assert.ok(declared(name+'-w')>declared(name+'-h'));
   assert.equal(declared(name+'-angle'),4);
 }
 assert.match(css,/pointer-events:none;z-index:2/);
 assert.match(html,/id="angle-out">4°/);
 assert.match(html,/id="angle" type="range"[^>]*value="4"/);
});

test('34/42 fixed CSS geometry centers the artwork and preserves a clear arrow zone',()=>{
 for(const [name,button,svg] of [['desktop',34,17],['touch',42,20]]){
   const w=declared(name+'-w'),h=declared(name+'-h'),x=declared(name+'-x'),y=declared(name+'-y');
   assert.ok(Math.abs(x+w/2-button/2)<=1,'CSS box must align with blue button center: '+name);
   assert.ok(y+h>=button*.23,'crown must sit over the upper blue arc: '+name);
   const arrowStart=(button-svg)/2+svg*5/24;
   assert.ok(y+h<arrowStart-1,'crown CSS box must not reach the arrow head: '+name);
   assert.ok(declared(name+'-angle')<=5,'avoid an exaggerated second tilt: '+name);
 }
 assert.match(css,/\.sq-crown\{[^}]*filter:none/,'do not add a synthetic shadow layer');
});
