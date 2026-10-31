import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';

const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const available=speed=>({status:'available',speed});
function fixture(initial=1){
  const {document,window}=parseHTML('<html><body>'+html+'</body></html>');
  const root=document.querySelector('main'),calls=[],statuses=[],sets=[];
  const request=async(op,args)=>{
    calls.push({op,args});
    if(op==='storage.get')return {value:false};
    if(op==='videoSpeed.status')return statuses.length?statuses.shift().promise:available(initial);
    if(op==='videoSpeed.set')return sets.length?sets.shift().promise:available(args.speed);
    throw Error('Unexpected request: '+op);
  };
  // Run the production entry unchanged; only the public SDK boundary is mocked.
  runInNewContext(source,{document,window,OpenDeskTool:{root,request}});
  const button=speed=>root.querySelector(`[data-speed="${speed}"]`);
  return {
    root,statuses,sets,button,
    count:op=>calls.filter(call=>call.op===op).length,
    setCalls:()=>calls.filter(call=>call.op==='videoSpeed.set'),
    value:()=>root.querySelector('#speed-current').textContent,
    click(speed){
      // linkedom dispatches clicks on disabled buttons; model native suppression.
      if(!button(speed).disabled)button(speed).click();
    },
    focus:()=>window.dispatchEvent(new window.Event('focus')),
    close:()=>window.dispatchEvent(new window.Event('pagehide')),
    navigate:()=>root.dispatchEvent(new window.Event('opendesk-page-changed')),
    refresh:()=>root.querySelector('#speed-refresh').click()
  };
}

for(const [initial,target] of [[1,2],[2,1]]){
  for(const late of ['before-set','after-set','error']){
    test(`focus pending status allows one ${target}× click; late ${late} cannot replace set`,async()=>{
      const f=fixture(initial);await flush();
      const status=deferred(),set=deferred();f.statuses.push(status);f.sets.push(set);
      f.focus();f.focus();
      assert.equal(f.count('videoSpeed.status'),2,'duplicate focus does not start another read');
      f.click(target);
      assert.equal(f.setCalls().length,1,'the first click sends exactly one set');
      assert.equal(f.setCalls()[0].args.speed,target);
      assert.equal(f.value(),initial.toFixed(2),'keep the verified actual value until set readback');
      assert.equal(f.button(target).disabled,true,'set remains single-flight');
      f.click(target);
      if(late==='before-set'){
        status.resolve(available(initial));await flush();
        assert.equal(f.button(target).disabled,true,'old status cannot unlock an active set');
        assert.equal(f.root.querySelector('#speed-verification').textContent,'待验证');
      }
      set.resolve(available(target));await flush();
      if(late==='after-set')status.resolve(available(initial));
      if(late==='error')status.reject(Error('late status failure'));
      await flush();
      assert.equal(f.value(),target.toFixed(2));
      assert.equal(f.button(target).getAttribute('aria-pressed'),'true');
      assert.equal(f.button(target).disabled,false);
      assert.equal(f.setCalls().length,1,'no queued or replayed set');
      f.focus();assert.equal(f.count('videoSpeed.status'),3,'future focus can read again');
      await flush();
    });
  }
}

for(const trigger of ['navigate','refresh']){
  test(`${trigger} during focus read blocks old-state sets and ignores old status`,async()=>{
    const f=fixture();await flush();
    const old=deferred(),fresh=deferred();f.statuses.push(old,fresh);
    f.focus();f[trigger]();
    assert.equal(f.count('videoSpeed.status'),3,'explicit detection supersedes background read');
    assert.equal(f.button(2).disabled,true);
    assert.equal(f.value(),'—');
    f.click(2);assert.equal(f.setCalls().length,0);
    old.resolve(available(1));await flush();
    assert.equal(f.button(2).disabled,true,'old status cannot restore controls');
    fresh.resolve(available(1.5));await flush();
    assert.equal(f.value(),'1.50');
    assert.equal(f.button(2).disabled,false);
    assert.equal(f.setCalls().length,0,'blocked click is never replayed');
  });
}

test('first detection remains blocking even when focus arrives',async()=>{
  const f=fixture();
  assert.equal(f.button(2).disabled,true);
  f.focus();f.click(2);
  assert.equal(f.count('videoSpeed.status'),1);
  assert.equal(f.setCalls().length,0);
  await flush();assert.equal(f.button(2).disabled,false);
});

test('closing invalidates background status and prevents subsequent sets',async()=>{
  const f=fixture();await flush();
  const status=deferred();f.statuses.push(status);f.focus();f.close();
  status.resolve(available(3));await flush();
  f.click(2);f.focus();
  assert.equal(f.value(),'1.00');
  assert.equal(f.setCalls().length,0);
  assert.equal(f.count('videoSpeed.status'),2);
});

test('navigation invalidates an in-flight set without replay',async()=>{
  const f=fixture();await flush();
  const set=deferred(),status=deferred();f.sets.push(set);f.statuses.push(status);
  f.click(2);f.navigate();
  set.resolve(available(2));await flush();
  assert.equal(f.value(),'—');
  assert.equal(f.button(2).disabled,true);
  status.resolve(available(1.5));await flush();
  assert.equal(f.value(),'1.50');
  assert.equal(f.setCalls().length,1);
});

test('focus pending read cannot swallow a preset matching the cached speed',async()=>{
  const f=fixture(1);await flush();
  const status=deferred(),set=deferred();f.statuses.push(status);f.sets.push(set);
  f.focus();f.click(1);
  assert.equal(f.setCalls().length,1,'cached 1× cannot prove the page is still 1×');
  assert.equal(f.setCalls()[0].args.speed,1);
  status.resolve(available(2));await flush();
  assert.equal(f.button(1).disabled,true,'stale focus read cannot unlock the set');
  set.resolve(available(1));await flush();
  assert.equal(f.value(),'1.00');
});
