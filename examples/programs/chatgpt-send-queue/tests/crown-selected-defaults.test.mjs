import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const text=path=>readFileSync(resolve(root,path),'utf8');
const css=text('assets/queue.css'),html=text('preview/index.html');

test('selected -25° / 85% / -4px / +2px crown positioning at 34 and 42px',()=>{
  assert.match(css,/--sq-crown-w:26px;--sq-crown-h:20px;--sq-crown-x:-2px;--sq-crown-y:-11px;--sq-crown-angle:-25deg/);
  assert.match(css,/--sq-crown-w:31px;--sq-crown-h:23px;--sq-crown-x:-1px;--sq-crown-y:-14px;width:42px;height:42px/);
  assert.match(css,/\.sq-crown\{[^}]*pointer-events:none/);
  assert.match(html,/\.size-34 \.sq-send\{--sq-crown-w:26px;--sq-crown-h:20px;--sq-crown-x:-2px;--sq-crown-y:-11px\}/);
  assert.match(html,/\.size-42 \.sq-send\{--sq-crown-w:31px;--sq-crown-h:23px;--sq-crown-x:-1px;--sq-crown-y:-14px\}/);
});

test('preview defaults, visible controls and reset use selected parameters',()=>{
  for(const [id,value,unit] of [['angle','-25','°'],['scale','85','%'],['offsetX','-4','px'],['offsetY','2','px']]){
    assert.match(html,new RegExp('id="'+id+'"[^>]*value="'+value+'"'));
    assert.ok(html.includes('id="'+id+'-out">'+value+unit),'value indicator '+id);
  }
  assert.ok(html.includes("[['angle',-25],['scale',85],['offsetX',-4],['offsetY',2]]"));
});

test('queue defaults to three and provides expansion only above three',()=>{
  const view=text('src/view.js');
  assert.ok(view.includes('state.expanded?items:items.slice(0,3)'));
  assert.ok(view.includes('if(items.length>3)'));
  assert.ok(view.includes("'展开其余 '+(items.length-3)+' 条'"));
  assert.ok(view.includes("more.setAttribute('aria-expanded',String(state.expanded))"));
  assert.ok(html.includes('expanded?items:items.slice(0,3)'));
  assert.ok(html.includes("$('more').hidden=items.length<=3;"));
  assert.ok(html.includes("'展开其余 '+(items.length-3)+' 条'"));
  assert.ok(html.includes("$('more').setAttribute('aria-expanded',String(expanded))"));
  assert.ok(html.includes("expanded?'收起队列'"));
});
