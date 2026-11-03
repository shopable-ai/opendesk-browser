// Focused DOM simulation for the independent design's request isolation.
// Dialog/focus shims below do NOT prove browser keyboard or native behavior.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const dir=new URL('.',import.meta.url);
const html=await readFile(new URL('webflow-v0.3-preview.html',dir),'utf8');
const {window,document}=parseHTML(html),timers=[],checks=[];
Object.defineProperty(document,'activeElement',{writable:true,value:null});
window.HTMLElement.prototype.focus=function(){document.activeElement=this;};
window.HTMLElement.prototype.scrollIntoView=function(){};
window.HTMLElement.prototype.getClientRects=function(){return [{}];};
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{
 get(){return this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},
 set(value){for(const el of this.querySelectorAll('option'))el.toggleAttribute('selected',el.getAttribute('value')===String(value));}
});
for(const el of document.querySelectorAll('dialog')){
 Object.defineProperty(el,'open',{get(){return this.hasAttribute('open');}});
 el.showModal=function(){this.setAttribute('open','');};
 el.close=function(){this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};
}
const $=id=>document.getElementById(id);
const emit=(id,type)=>$(id).dispatchEvent(new window.Event(type,{bubbles:true,cancelable:true}));
const click=id=>{assert.ok(!$(id).disabled,id+' enabled');emit(id,'click');};
const input=(id,value)=>{$(id).value=value;emit(id,'input');};
const select=(id,value)=>{$(id).value=value;emit(id,'change');};
const submit=id=>emit(id,'submit');
const check=(name,test)=>{test();checks.push(name);};
vm.runInNewContext($('od-preview-behavior').textContent,{document,window,URL,TextDecoder,Uint8Array,atob,Event:window.Event,CustomEvent:window.CustomEvent,setTimeout:fn=>timers.push(fn),console},{timeout:3000});
click('runtime-open');click('runtime-grant');
input('grant-query','范围草稿');click('runtime-close');click('runtime-open');
check('authorization draft survives close',()=>assert.equal($('grant-query').value,'范围草稿'));
submit('grant-form');timers.splice(0).forEach(fn=>fn());
check('prepare hides form without granting',()=>{assert.equal($('grant-form').hidden,true);assert.equal($('auto-enabled').getAttribute('aria-checked'),'false');assert.match($('grant-status').textContent,/尚无批准/);});
click('approve-grant');click('generate-prompt');
check('approve/generate do not enable or run',()=>{assert.equal($('auto-enabled').getAttribute('aria-checked'),'false');assert.match($('current-task').textContent,/还没有/);assert.match($('prompt-text').value,/范围草稿/);});
click('prompt-return-switch');
check('direct path returns to unique switch',()=>assert.equal(document.activeElement.id,'auto-enabled'));
click('auto-enabled');click('runtime-open');click('edit-grant');input('grant-query','放弃的新范围');click('discard-draft');
check('discard preserves previous approval',()=>{assert.match($('approved-summary').textContent,/范围草稿/);assert.equal($('auto-enabled').getAttribute('aria-checked'),'true');});
click('revoke-grant');
select('grant-task','google');submit('grant-form');select('grant-task','baidu');
check('corrected task clears invalid state',()=>assert.equal($('grant-task').hasAttribute('aria-invalid'),false));
click('discard-draft');click('runtime-close');click('app-scripts');click('task-detail-google');
check('Google detail never opens Baidu grant',()=>{assert.match($('detail-content').textContent,/Google/);assert.doesNotMatch($('detail-content').textContent,/百度/);assert.equal($('runtime-dialog').open,false);});
click('detail-close');click('task-run-baidu');input('manual-query','保留草稿');click('manual-close');click('task-run-baidu');
check('manual draft survives close',()=>assert.equal($('manual-query').value,'保留草稿'));
submit('manual-form');click('manual-close');click('task-run-baidu');
check('saved step survives without renewed execution permission',()=>{assert.equal($('manual-recover').hidden,false);assert.equal($('manual-confirm').hidden,true);assert.match($('manual-records').textContent,/design-manual-1/);assert.match($('current-task').textContent,/还没有/);});
click('manual-cancel-staged');input('manual-query','历史A关键词');submit('manual-form');
check('execution confirmation shows complete params',()=>assert.match($('manual-confirm-summary').textContent,/历史A关键词/));
click('manual-run');click('runtime-close');select('lab-task','success');
check('outcome fixture retains manual scope and delivery semantics',()=>{assert.match($('current-task').textContent,/历史A关键词/);assert.match($('current-task').textContent,/手动运行不自动交付/);});
click('task-run-baidu');input('manual-query','当前B关键词');submit('manual-form');click('manual-run');click('runtime-close');click('app-records');click('manual-record-design-manual-2');
check('history A is independent of current B',()=>{assert.match($('record-content').textContent,/历史A关键词/);assert.doesNotMatch($('record-content').textContent,/当前B关键词/);assert.match($('current-task').textContent,/当前B关键词/);assert.match($('current-task').textContent,/design-manual-3/);});
click('record-close');click('runtime-open');click('runtime-task');click('task-stop');
check('stop preserves UNKNOWN without replay',()=>{assert.match($('current-task').textContent,/UNKNOWN/);assert.match($('current-task').textContent,/design-manual-3/);});
emit('runtime-dialog','compositionstart');
const imeCancel=new window.Event('cancel',{cancelable:true});$('runtime-dialog').dispatchEvent(imeCancel);
check('composition guard prevents Escape cancel',()=>assert.equal(imeCancel.defaultPrevented,true));emit('runtime-dialog','compositionend');
click('runtime-close');select('lab-auth','loading');
check('reading does not invent switch state',()=>{assert.equal($('auto-enabled').disabled,true);assert.match($('auto-summary').textContent,/正在读取/);});
select('lab-auth','save-fail');click('auto-enabled');
check('failed save becomes unconfirmed and preserves current request',()=>{assert.equal($('auto-enabled').disabled,true);assert.match($('auto-summary').textContent,/未确认/);assert.match($('current-task').textContent,/design-manual-3/);});
select('lab-task','failed');
check('manual failure never claims chat delivery',()=>{assert.match($('current-task').textContent,/手动运行不交付原聊天/);assert.doesNotMatch($('current-task').textContent,/失败通知待确认/);});
select('lab-task','empty');
check('empty fixture leaves historical request state intact',()=>{assert.match($('manual-records').textContent,/执行失败，未重试/);assert.doesNotMatch($('manual-records').textContent,/undefined/);});
const out=new URL('../../../artifacts/sidebar-tools/webflow/html-design-20261103/',dir);
await mkdir(out,{recursive:true});
const report={date:'2026-11-03',htmlSha256:createHash('sha256').update(html).digest('hex'),level:'PASS_MOCKED_DOM',checks,limitations:['dialog and focus shims are not Chromium keyboard evidence','native permission / clipboard / real Task NOT_TESTED']};
await writeFile(new URL('dom-checks.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
