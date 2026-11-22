import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/page/main.js',import.meta.url),'utf8')
  .replace(/^import\s+\{createPageUI\}\s+from\s+'@opendesk\/ui';\s*/m,'')
  .replace('export default async function main','async function main');
function job({title='Android 开发',company='样例公司',salary='20-35K',
  area='北京',id='demo12345'}={}){
  const lookup=selector=>{
    if(selector.includes('.job-name'))return {textContent:title};
    if(selector.includes('.company-name'))return {textContent:company};
    if(selector.includes('.salary'))return {textContent:salary};
    if(selector.includes('.job-area'))return {textContent:area};
    if(selector.includes('.job-card-footer'))return {textContent:'Kotlin, Java'};
    if(selector.startsWith('a[href'))return {href:'https://www.zhipin.com/job_detail/'+id+'.html'};
    return null;
  };
  return {querySelector:lookup,getAttribute:()=>null,dataset:{}};
}
async function setup(cards,pathname='/web/geek/job'){
  let requestHandler=null,disposed=false;
  const window={};window.top=window;
  const location={origin:'https://www.zhipin.com',
    hostname:'www.zhipin.com',pathname,href:'https://www.zhipin.com'+pathname};
  const context={
    document:{querySelectorAll:()=>cards},window,location,URL,Date,
    createPageUI:()=>({
      host:{style:{setProperty(){}}},
      onDispose(fn){context.dispose=fn;},destroy(){disposed=true;}
    }),
    OpenDeskAppPage:{onRequest(fn){requestHandler=fn;return ()=>{requestHandler=null;};}},
    Error,Number,String,Math
  };
  vm.createContext(context);
  vm.runInContext(source+';globalThis.__launch=main;',context);
  const result=await context.__launch();
  return {result,call:(operation,payload)=>requestHandler({operation,payload}),
    dispose:()=>context.dispose(),isDisposed:()=>disposed};
}
test('read-only DOM scan preserves stable job identity and de-duplicates',async()=>{
  const api=await setup([job(),job(),job({title:'Vue 开发',id:'demo22222'})]);
  assert.equal(api.result.state,'ready');
  const got=await api.call('jobs.scan',{limit:60});
  assert.equal(got.source,'boss-zhipin-dom-r1');
  assert.equal(got.inspected,3);
  assert.equal(got.jobs.length,2);
  assert.equal(got.jobs[0].id,'demo12345.html');
  assert.equal(got.jobs[0].company,'样例公司');
  assert.equal(got.jobs[1].title,'Vue 开发');
  api.dispose();
});
test('non-search page rejects request instead of fabricating results',async()=>{
  const api=await setup([job()],'/web/chat');
  await assert.rejects(()=>api.call('jobs.scan',{limit:60}),/职位搜索列表/);
  api.dispose();
});
test('limit and operation are checked before reading',async()=>{
  const api=await setup([job()]);
  await assert.rejects(()=>api.call('jobs.scan',{limit:61}),/INVALID_SCAN_LIMIT/);
  await assert.rejects(()=>api.call('send.message',{limit:1}),/UNSUPPORTED_OPERATION/);
  const got=await api.call('jobs.scan',{limit:1});
  assert.equal(got.jobs.length,1);
  api.dispose();
});
