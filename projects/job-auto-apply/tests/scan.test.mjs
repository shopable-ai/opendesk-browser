import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/page/main.js',import.meta.url),'utf8')
  .replace(/^import\s+\{createPageUI\}\s+from\s+'@opendesk\/ui';\s*/m,'')
  .replace('export default async function main','async function main');

function job({title='Android 开发',company='样例公司',salary='20-35K',
  area='北京',id='demo12345',href,attribute=null,info='Kotlin, Java, 3-5年, 本科',
  recruiter='招聘经理',active='刚刚活跃',recruiterLabel='',contact=''}={}){
  const url=href===undefined?'https://www.zhipin.com/job_detail/'+id+'.html?source=search':href;
  const lookup=selector=>{
    if(selector.startsWith('a[href'))return url?{href:url}:null;
    if(selector.includes('.job-name'))return {textContent:title};
    if(selector.includes('.company-name'))return {textContent:company};
    if(selector.includes('.salary'))return {textContent:salary};
    if(selector.includes('.job-area'))return {textContent:area};
    if(selector.includes('.job-info'))return {textContent:info};
    if(selector.includes('.job-card-footer'))return {textContent:info};
    if(selector.includes('.boss-info-attr'))return recruiterLabel?{textContent:recruiterLabel}:null;
    if(selector.includes('.btn-startchat'))return contact?{textContent:contact}:null;
    if(selector.includes('.boss-name'))return {textContent:recruiter};
    if(selector.includes('.boss-active-time'))return {textContent:active};
    return null;
  };
  return {querySelector:lookup,getAttribute:name=>name==='data-job-id'?attribute:null,dataset:{}};
}
async function setup(cards,pathname='/web/geek/job',options={}){
  let requestHandler=null,destroyed=false,observer=null;
  const window={};window.top=window;
  const location={origin:'https://www.zhipin.com',
    hostname:'www.zhipin.com',pathname,href:'https://www.zhipin.com'+pathname};
  const context={
    document:{
      querySelectorAll:()=>cards,
      querySelector:()=>cards.length?cards[0]:null,
      documentElement:{}
    },window,location,URL,Date,setTimeout,clearTimeout,
    MutationObserver:options.observe?class {
      constructor(fn){this.fn=fn;observer=this;}
      observe(){}
      disconnect(){this.disconnected=true;}
    }:undefined,
    createPageUI:()=>({
      host:{style:{setProperty(){}}},
      onDispose(fn){context.dispose=fn;},
      destroy(){destroyed=true;}
    }),
    OpenDeskAppPage:{onRequest(fn){requestHandler=fn;return ()=>{requestHandler=null;};}},
    Error,Number,String,Math
  };
  vm.createContext(context);
  vm.runInContext(source+';globalThis.__launch=main;',context);
  const result=await context.__launch();
  return {result,call:(operation,payload)=>requestHandler({operation,payload}),
    dispose:()=>context.dispose(),isDestroyed:()=>destroyed,
    emit:()=>observer?.fn(),observer:()=>observer,location};
}
test('canonical job ID drops .html, query, duplicates and retains card facts',async()=>{
  const api=await setup([job(),job(),job({title:'Vue 开发',id:'demo22222'})]);
  assert.equal(api.result.state,'ready');
  const got=await api.call('jobs.scan',{limit:60});
  assert.equal(got.source,'boss-zhipin-dom-r2');
  assert.equal(got.inspected,3);
  assert.equal(got.duplicates,1);
  assert.equal(got.jobs.length,2);
  assert.equal(got.jobs[0].id,'demo12345');
  assert.equal(got.jobs[0].url,'https://www.zhipin.com/job_detail/demo12345.html');
  assert.equal(got.jobs[0].experience,'3-5年');
  assert.equal(got.jobs[0].education,'本科');
  assert.equal(got.jobs[0].descriptionScope,'card_summary');
  assert.equal(got.jobs[1].title,'Vue 开发');
  api.dispose();
});
test('only trusted URL or stable card attribute proves an identity',async()=>{
  const api=await setup([
    job({href:'https://evil.test/job_detail/fake12345.html',attribute:'card45678'}),
    job({href:'https://evil.test/job_detail/fake12345.html',attribute:null,id:'fake12345'}),
    job({id:'short'})
  ]);
  const got=await api.call('jobs.scan',{limit:60});
  assert.equal(got.jobs[0].id,'card45678');
  assert.equal(got.jobs[0].identitySource,'card_attribute');
  assert.equal(got.jobs[1].id,'');
  assert.equal(got.jobs[1].url,'');
  assert.equal(got.jobs[2].id,'');
  assert.equal(got.missingIdentity,2);
  api.dispose();
});
test('explicit recruiter/chat indicators are facts; missing indicators remain unknown',async()=>{
  const api=await setup([job({recruiterLabel:'猎头顾问',contact:'继续沟通'}),
    job({id:'demo99999',recruiterLabel:'',contact:''})]);
  const got=await api.call('jobs.scan',{limit:60});
  assert.equal(got.jobs[0].recruiterType,'headhunter');
  assert.equal(got.jobs[0].contactState,'already_contacted');
  assert.equal(got.jobs[1].recruiterType,'unknown');
  assert.equal(got.jobs[1].contactState,'unknown');
  api.dispose();
});
test('no cards or stable identities returns diagnostic, never fabricated jobs',async()=>{
  const empty=await setup([]);
  const e=await empty.call('jobs.scan',{limit:60});
  assert.equal(e.diagnostic,'NO_CARDS_FOUND');
  assert.equal(e.jobs.length,0);
  empty.dispose();
  const unknown=await setup([job({href:'https://evil.test/job_detail/aabbccdd.html',attribute:null})]);
  const u=await unknown.call('jobs.scan',{limit:60});
  assert.equal(u.diagnostic,'NO_STABLE_IDS');
  unknown.dispose();
});
test('async DOM paint can be observed without permanent polling',async()=>{
  const cards=[];
  const api=await setup(cards,'/web/geek/job',{observe:true});
  const pending=api.call('jobs.scan',{limit:60});
  cards.push(job());
  api.emit();
  const got=await pending;
  assert.equal(got.jobs.length,1);
  assert.equal(api.observer().disconnected,true);
  api.dispose();
});
test('page change and disposal reject pending read-only request',async()=>{
  const cards=[];
  const api=await setup(cards,'/web/geek/job',{observe:true});
  const pending=api.call('jobs.scan',{limit:60});
  api.location.href+='?page=2';
  cards.push(job());
  api.emit();
  await assert.rejects(pending,/PAGE_CHANGED_DURING_SCAN/);
  api.dispose();
  const another=await setup([],'/web/geek/job',{observe:true});
  const pendingDispose=another.call('jobs.scan',{limit:60});
  another.dispose();
  await assert.rejects(pendingDispose,/PAGE_MODULE_DISPOSED/);
});
test('wrong page, invalid limit and send operations are rejected',async()=>{
  const wrong=await setup([job()],'/web/chat');
  await assert.rejects(()=>wrong.call('jobs.scan',{limit:60}),/职位搜索列表/);
  wrong.dispose();
  const api=await setup([job()]);
  await assert.rejects(()=>api.call('jobs.scan',{limit:61}),/INVALID_SCAN_LIMIT/);
  await assert.rejects(()=>api.call('send.message',{limit:1}),/UNSUPPORTED_OPERATION/);
  const got=await api.call('jobs.scan',{limit:1});
  assert.equal(got.jobs.length,1);
  api.dispose();
});
