import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
import {pageVideoSVIP,requestVideoSVIP} from '../trusted/host.js';
import {videoSVIPSiteFor} from '../trusted/policy.js';

const fixture=JSON.parse(await readFile(new URL('./fixtures/bilibili-197.json',import.meta.url),'utf8'));
const item='a.EpisodeVirtualList_numberItem__GLWgO';
const number='.EpisodeVirtualList_numberTitle__6SOS6';
function page(url=fixture.activeUrl){
  const {document}=parseHTML(fixture.html),location={href:url},timers=new Map(),intervals=new Map(),messages=[];
  let callback,disconnectListener,observed,id=0;
  const sandbox={document,location,URL,
    setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key),
    setInterval:fn=>{intervals.set(++id,fn);return id;},clearInterval:key=>intervals.delete(key),
    MutationObserver:class {
      constructor(fn){callback=fn;}
      observe(_node,options){observed=options;}
      disconnect(){}
    },
    chrome:{runtime:{connect:()=>({postMessage:m=>messages.push(m),
      onDisconnect:{addListener:fn=>{disconnectListener=fn;}},disconnect:()=>disconnectListener?.()})}}};
  const run=runInNewContext('('+pageVideoSVIP.toString()+')',sandbox);
  const site=videoSVIPSiteFor(url);
  return {document,location,messages,intervals,
    inspect:()=>JSON.parse(JSON.stringify(run('inspect',site))),
    watch:()=>run('watch-on',site,'12345678-1234-4234-8234-123456789abc'),
    mutate:()=>callback([]),close:()=>sandbox.__opendeskSVIPObserver_v1.close(),
    flush:()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());},
    get observed(){return observed;}};
}
test('only the observed zh-Hans bangumi ep route is added; domain and other locale/path gates remain closed',()=>{
  for(const url of [fixture.sourceUrl,fixture.activeUrl])assert.equal(videoSVIPSiteFor(url)?.id,'bilibili');
  for(const url of [
    fixture.activeUrl.replace('www.bilibili.com','www.bilibili.com.attacker.test'),
    fixture.activeUrl.replace('/zh-Hans/','/zh-TW/'),
    fixture.activeUrl.replace('/zh-Hans/','/en-US/'),
    fixture.activeUrl.replace('/bangumi/play/','/video/'),
    fixture.activeUrl.replace('/bangumi/play/','/bangumi/playback/'),
    fixture.activeUrl.replace('/ep3854821','/ss3854821'),
    fixture.activeUrl.replace('/ep3854821','/ep3854821/extra'),
    fixture.activeUrl.replace('/ep3854821','/ep3854821evil')
  ])assert.equal(videoSVIPSiteFor(url),null,url);
  const p=page(fixture.sourceUrl);p.location.href=fixture.activeUrl;
  assert.equal(p.inspect().ok,true,'injected function accepts the same locale route as Host');
  p.location.href=fixture.activeUrl.replace('/ep3854821','/ss3854821');
  assert.equal(p.inspect().ok,false,'injected function retains the localized path gate');
});
test('Bilibili observed title and selected numberTitle yield series and episode 197 despite member badge',()=>{
  for(const url of [fixture.sourceUrl,fixture.activeUrl]){
    const result=page(url).inspect();
    assert.equal(result.title,'凡人修仙传');
    assert.equal(result.titleConfidence,'high');
    assert.equal(result.evidence.title,'a.mediainfo_mediaTitle__Zyiqh[title]');
    assert.deepEqual(result.episode,{season:null,number:197,label:'第197集'});
    assert.equal(result.episodeConfidence,'high');
    assert.match(result.evidence.episode,/selected:.*bilibili/);
  }
});
test('unlocalized route reads episode 197 from selected numberTitle, not numeric ep identity',()=>{
  const result=page(fixture.sourceUrl).inspect();
  assert.deepEqual(result.episode,{season:null,number:197,label:'第197集'});
});
test('episode digits require the real active container and same-origin href with exact current ep identity',()=>{
  for(const change of [
    p=>p.document.querySelector(item).classList.remove('EpisodeVirtualList_activeNumber__Sm49O'),
    p=>p.document.querySelector(item).setAttribute('href','/bangumi/play/ep3854820'),
    p=>p.document.querySelector(item).setAttribute('href','/bangumi/play/ep38548210'),
    p=>p.document.querySelector(item).setAttribute('href','https://evil.test/bangumi/play/ep3854821'),
    p=>p.document.querySelector(item).setAttribute('href','/bangumi/play/ep3854821/extra'),
    p=>p.document.querySelector(item).removeAttribute('href'),
    p=>p.document.querySelector(number).remove(),
    p=>{p.document.querySelector(number).textContent='共197集';},
    p=>{p.document.querySelector(number).textContent='197预告';},
    p=>{p.document.querySelector(number).textContent='ep197';}
  ]){const p=page();change(p);assert.equal(p.inspect().episode,'unknown');}
  const other=page('https://www.iqiyi.com/v_test.html');
  assert.equal(other.inspect().episode,'unknown');
});
test('ep IDs, title attributes and document title are never substitutes for selected numberTitle',()=>{
  const p=page(fixture.activeUrl.replace('ep3854821','ep197')+'&episode=197');
  p.document.querySelector(item).remove();
  assert.equal(p.inspect().episode,'unknown');
  const q=page();q.document.querySelector(number).textContent='198';
  assert.equal(q.inspect().episode.number,198,'numberTitle, not anchor title=197, supplies the episode');
});
test('identical current copies are allowed; conflicting current numberTitle copies return unknown',()=>{
  const p=page(),clone=p.document.querySelector(item).cloneNode(true);
  p.document.body.append(clone);
  assert.equal(p.inspect().episode.number,197);
  clone.querySelector(number).textContent='198';
  p.document.body.insertAdjacentHTML('beforeend','<div aria-current="page">第197集</div>');
  assert.equal(p.inspect().episode,'unknown');
});
test('Bilibili watch ignores comments and badge styles but observes selected href and number changes',()=>{
  const p=page();assert.equal(p.watch().watching,true);
  p.document.body.insertAdjacentHTML('beforeend','<div class="comment">无关评论</div>');
  p.document.querySelector('.EpisodeVirtualList_numberBadge__2JR_S').setAttribute('style','color:red');
  p.mutate();p.flush();assert.deepEqual(p.messages.map(m=>m.kind),['ready']);
  assert.ok(p.observed.attributeFilter.includes('href'));
  p.document.querySelector(item).setAttribute('href','/bangumi/play/ep3854820');
  p.mutate();p.flush();assert.equal(p.messages.length,2);
  assert.equal(p.inspect().episode,'unknown');
  p.document.querySelector(item).setAttribute('href','/bangumi/play/ep3854821');
  p.document.querySelector(number).textContent='198';
  p.mutate();p.flush();assert.equal(p.messages.length,3);
  assert.equal(p.inspect().episode.number,198);
  p.mutate();p.flush();assert.equal(p.messages.length,3);
  p.close();assert.equal(p.intervals.size,0);
});
test('localized Bilibili recognition traverses the existing document-bound Host',async()=>{
  const p=page(),target={tabId:41,documentId:'top-bilibili',url:fixture.activeUrl,origin:'https://www.bilibili.com'};
  let calls=0;
  const result=await requestVideoSVIP({
    tool:{id:'video-svip',capabilities:['page.videoContext']},operation:'videoSVIP.inspect',
    assertCurrent(){},async assertInstalled(){},
    currentPageTarget:{capture:()=>target,revalidate:async()=>target},
    api:{webNavigation:{getAllFrames:async()=>[{...target,frameId:0}]},
      permissions:{contains:async()=>true},
      scripting:{executeScript:async request=>{
        calls++;assert.equal(request.func,pageVideoSVIP);assert.equal(request.world,'ISOLATED');
        assert.deepEqual(request.target,{tabId:41,documentIds:['top-bilibili']});
        return [{documentId:'top-bilibili',frameId:0,result:p.inspect()}];
      }}}
  });
  assert.equal(calls,2);assert.equal(result.siteId,'bilibili');
  assert.equal(result.title,'凡人修仙传');assert.equal(result.episode.number,197);
});
