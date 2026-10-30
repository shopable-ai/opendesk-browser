import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
const html=await readFile(new URL('../preview/index.html',import.meta.url),'utf8');
function fixture(){
  const {document,window}=parseHTML(html),timers=[];
  // linkedom lacks the native select.value setter used by the preview.
  Object.defineProperty(document.getElementById('scenario'),'value',{value:'ready',writable:true});
  runInNewContext(document.querySelector('script').textContent,{document,setTimeout:fn=>timers.push(fn)});
  const get=id=>document.getElementById(id);
  return {get,click:id=>{if(!get(id).disabled)get(id).click();},settle:()=>timers.splice(0).forEach(fn=>fn()),
    scene(mode){const select=get('scenario');select.value=mode;select.dispatchEvent(new window.Event('change'));},
    preset:speed=>document.querySelector(`[data-speed="${speed}"]`).click()};
}
test('offline preview keeps shared target separate from actual, including no video and stop',()=>{
  const f=fixture();assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'false');
  f.click('global-toggle');f.preset(2);assert.match(f.get('global-target').textContent,/2.00/);
  assert.equal(f.get('actual').textContent,'1.00');f.settle();assert.equal(f.get('actual').textContent,'2.00');
  f.scene('none');assert.equal(f.get('actual').textContent,'—');f.preset(3);
  assert.match(f.get('global-target').textContent,/3.00/);assert.equal(f.get('actual').textContent,'—');
  f.click('global-stop');assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'false');
  assert.match(f.get('global-note').textContent,/未确认|未知/);assert.equal(f.get('actual').textContent,'—');
});
test('offline preview can simulate cross-window preference without claiming its target as actual',()=>{
  const f=fixture();f.click('remote-global');assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'true');
  assert.match(f.get('global-target').textContent,/3.00/);assert.equal(f.get('actual').textContent,'1.00');
  f.click('remote-global');assert.equal(f.get('global-toggle').getAttribute('aria-checked'),'false');
  assert.match(f.get('global-note').textContent,/未确认/);
});
