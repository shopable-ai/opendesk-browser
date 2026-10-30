import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
import {pageVideoSVIP,requestVideoSVIP} from '../trusted/host.js';
import {videoSVIPSiteFor} from '../trusted/policy.js';

const fixture=JSON.parse(await readFile(new URL('./fixtures/tencent-164.json',import.meta.url),'utf8'));
const selected='.episode-item.selected.normal-font';
function page(url=fixture.sourceUrl){
  const {document}=parseHTML(fixture.html);
  const location={href:url},timers=new Map(),intervals=new Map(),messages=[];
  let callback,disconnectListener,observed,disconnected=false,id=0;
  const port={postMessage:message=>messages.push(message),
    onDisconnect:{addListener:fn=>{disconnectListener=fn;}},
    disconnect:()=>disconnectListener?.()};
  const sandbox={document,location,URL,
    setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key),
    setInterval:fn=>{intervals.set(++id,fn);return id;},clearInterval:key=>intervals.delete(key),
    chrome:{runtime:{connect:()=>port}},
    MutationObserver:class {
      constructor(fn){callback=fn;}
      observe(_node,options){observed=options;}
      disconnect(){disconnected=true;}
    }};
  // Chrome serializes this function: no module globals or imported DOM helpers.
  const run=runInNewContext('('+pageVideoSVIP.toString()+')',sandbox);
  const site=videoSVIPSiteFor(url);
  return {document,location,messages,timers,intervals,sandbox,
    inspect:()=>JSON.parse(JSON.stringify(run('inspect',site))),
    watch:()=>run('watch-on',site,'12345678-1234-4234-8234-123456789abc'),
    mutate:()=>callback([]),disconnect:()=>disconnectListener(),
    pollUrl:()=>[...intervals.values()].forEach(fn=>fn()),
    flush:()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());},
    get observed(){return observed;},get disconnected(){return disconnected;}};
}
test('Tencent real fragments yield series title and URL-bound episode, accepting identical responsive copies',()=>{
  const p=page(),result=p.inspect();
  assert.equal(result.title,'仙逆');
  assert.equal(result.titleConfidence,'high');
  assert.equal(result.evidence.title,'div.intro-title[title]');
  assert.deepEqual(result.episode,{season:null,number:164,label:'第164集'});
  assert.match(result.evidence.episode,/selected:.*episode-item/);
  assert.equal(result.recognitionState,'recognized');
});
test('observed Tencent VIP corner badge is separate from episode digits; preview badges remain unknown',()=>{
  const p=page();
  for(const node of p.document.querySelectorAll(selected))
    node.insertAdjacentHTML('beforeend','<div class="corner-wrap corner-mark--small corner-mark--rightTop">VIP</div>');
  assert.equal(p.inspect().episode.number,164);
  for(const badge of p.document.querySelectorAll('.corner-wrap'))badge.textContent='预告';
  assert.equal(p.inspect().episode,'unknown');
});
test('URL-only changes invalidate, but a URL reverted before debounce does not',()=>{
  const p=page();p.watch();
  p.location.href=fixture.sourceUrl+'?episode=164';p.pollUrl();p.flush();
  assert.deepEqual(p.messages.map(m=>m.kind),['ready','changed']);
  p.pollUrl();p.flush();assert.equal(p.messages.length,2);
  const stableUrl=p.location.href;
  p.location.href=fixture.sourceUrl;p.pollUrl();p.location.href=stableUrl;p.flush();
  assert.equal(p.messages.length,2);
  p.disconnect();assert.equal(p.intervals.size,0);
});
test('verified player heading is a title fallback, never an episode guess',()=>{
  const p=page();p.document.querySelector('.intro-title').remove();
  for(const node of p.document.querySelectorAll(selected))node.remove();
  const result=p.inspect();
  assert.equal(result.title,'仙逆');
  assert.equal(result.evidence.title,'h2.player-play-title__title');
  assert.equal(result.episode,'unknown');
});
test('numeric extraction requires Tencent, selection and exact current video ID; no previews or totals',()=>{
  for(const change of [
    p=>p.document.querySelectorAll(selected).forEach(n=>n.classList.remove('selected')),
    p=>{p.location.href=fixture.sourceUrl.replace('c4102y7ahdb','other');},
    p=>p.document.querySelectorAll(selected).forEach(n=>{n.id=n.id.replace('c4102y7ahdb','c4102y7ahdbx');}),
    p=>p.document.querySelectorAll(selected).forEach(n=>{n.querySelector('span').textContent='164预告';}),
    p=>p.document.querySelectorAll(selected).forEach(n=>{n.querySelector('span').textContent='共164集';}),
    p=>p.document.querySelectorAll(selected).forEach(n=>{n.querySelector('span').textContent='ep164';})
  ]){const p=page();change(p);assert.equal(p.inspect().episode,'unknown');}
  const other=page('https://www.iqiyi.com/v_test.html');
  assert.equal(other.inspect().episode,'unknown');
  const generic=page();generic.document.body.innerHTML='<h1>某剧</h1><div aria-current="page">164</div>';
  assert.equal(generic.inspect().episode,'unknown');
});
test('conflicting current selected copies fail closed even with generic or URL episode fallbacks',()=>{
  const p=page();
  p.document.querySelectorAll(selected)[1].querySelector('span').textContent='165';
  p.document.body.insertAdjacentHTML('beforeend','<div aria-current="page">第164集</div>');
  p.location.href+='?episode=164';
  const result=p.inspect();
  assert.equal(result.episode,'unknown');
  assert.equal(result.episodeConfidence,'none');
});
test('selected Tencent IDs from an old video cannot be overridden by generic DOM or query episode fallbacks',()=>{
  for(const fallback of ['?episode=164','']){
    const p=page();p.location.href=fixture.sourceUrl.replace('c4102y7ahdb','newvideo')+fallback;
    p.document.body.insertAdjacentHTML('beforeend','<div aria-current="page">第164集</div>');
    assert.equal(p.inspect().episode,'unknown');
    assert.match(p.inspect().evidence.episode,/conflict/);
  }
});
test('conflicting observed series and player titles invalidate and never certify old title with new episode',()=>{
  const p=page();p.watch();
  p.document.querySelector('h2').textContent='另一部剧 第1话';p.mutate();p.flush();
  assert.deepEqual(p.messages.map(m=>m.kind),['ready','changed']);
  const result=p.inspect();
  assert.notEqual(result.recognitionState,'recognized');
  assert.notEqual(result.titleConfidence,'high');
  assert.equal(result.episode,'unknown');
  p.location.href=fixture.sourceUrl.replace('c4102y7ahdb','newvideo');
  p.document.querySelectorAll(selected).forEach(n=>{n.id=n.id.replace('c4102y7ahdb','newvideo');n.querySelector('span').textContent='1';});
  assert.notEqual(p.inspect().recognitionState,'recognized');
  p.document.querySelector('.intro-title').setAttribute('title','另一部剧');
  assert.equal(p.inspect().title,'另一部剧');
  assert.equal(p.inspect().episode.number,1);p.disconnect();
});
test('unrelated browser title notifications do not invalidate verified site evidence',()=>{
  const p=page();p.watch();const revision=p.inspect().contentRevision;
  p.document.title='(1条新消息) '+p.document.title;p.mutate();p.flush();
  assert.deepEqual(p.messages.map(m=>m.kind),['ready']);
  assert.equal(p.inspect().contentRevision,revision);p.disconnect();
});
test('unrelated mutations never invalidate; same-URL title/episode and URL changes do',()=>{
  const p=page();assert.equal(p.watch().watching,true);
  for(let i=0;i<4;i++){
    p.document.body.insertAdjacentHTML('beforeend','<div class="comment danmaku">无关内容</div>');
    p.mutate();p.flush();
  }
  assert.deepEqual(p.messages.map(m=>m.kind),['ready']);
  p.document.querySelector('.intro-title').setAttribute('title','另一部剧');
  p.document.querySelector('h2').textContent='另一部剧 第164话';
  p.mutate();p.flush();
  assert.deepEqual(p.messages.map(m=>m.kind),['ready','changed']);
  assert.ok(p.observed.attributeFilter.includes('title'));
  assert.ok(p.observed.attributeFilter.includes('id'));
  p.document.querySelectorAll(selected).forEach(n=>{n.querySelector('span').textContent='165';});
  p.mutate();p.flush();assert.equal(p.messages.length,3);
  p.mutate();p.flush();assert.equal(p.messages.length,3);
  p.location.href=fixture.sourceUrl.replace('c4102y7ahdb','other');
  p.mutate();p.flush();assert.equal(p.messages.length,4);
  assert.ok(p.messages.every(m=>Object.keys(m).sort().join(',')==='kind,nonce'));
  p.disconnect();assert.equal(p.disconnected,true);
});
test('Stop/close or port disconnect cancels pending notifications and replacement closes the old watch',()=>{
  for(const stop of [p=>p.sandbox.__opendeskSVIPObserver_v1.close(),p=>p.disconnect()]){
    const p=page();p.watch();
    p.document.querySelector('.intro-title').setAttribute('title','新标题');p.mutate();
    stop(p);p.flush();p.mutate();p.flush();
    assert.deepEqual(p.messages.map(m=>m.kind),['ready']);
    assert.equal(p.disconnected,true);
    assert.equal(p.timers.size,0);assert.equal(p.intervals.size,0);
    assert.equal(p.sandbox.__opendeskSVIPObserver_v1,undefined);
  }
  const p=page();p.watch();const old=p.sandbox.__opendeskSVIPObserver_v1;
  p.watch();assert.equal(p.disconnected,true);
  assert.notEqual(p.sandbox.__opendeskSVIPObserver_v1,old);
  p.disconnect();
});
test('Tencent result traverses the existing exact-document Host boundary',async()=>{
  const p=page(),target={tabId:41,documentId:'top-tencent',url:fixture.sourceUrl,origin:'https://v.qq.com'};
  let calls=0;
  const result=await requestVideoSVIP({
    tool:{id:'video-svip',capabilities:['page.videoContext']},operation:'videoSVIP.inspect',
    assertCurrent(){},async assertInstalled(){},
    currentPageTarget:{capture:()=>target,revalidate:async()=>target},
    api:{webNavigation:{getAllFrames:async()=>[{...target,frameId:0}]},
      permissions:{contains:async()=>true},
      scripting:{executeScript:async request=>{
        calls++;assert.equal(request.func,pageVideoSVIP);
        assert.equal(request.world,'ISOLATED');
        assert.deepEqual(request.target,{tabId:41,documentIds:['top-tencent']});
        return [{documentId:'top-tencent',frameId:0,result:p.inspect()}];
      }}}
  });
  assert.equal(calls,2);assert.equal(result.title,'仙逆');assert.equal(result.episode.number,164);
  assert.equal(result.evidence.title,'div.intro-title[title]');
});
