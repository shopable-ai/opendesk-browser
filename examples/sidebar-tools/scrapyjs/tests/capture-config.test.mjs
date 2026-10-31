import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedUrl,validateCapture,decimalFields,runCapture} from '../controller/capture.js';
import {fields,pagination,listDetail} from '../examples/configs.js';
const copy=x=>JSON.parse(JSON.stringify(x));
test('native configuration grammar validates before browser work; only three explicit origins are allowed',()=>{
  for(const config of [fields,pagination,listDetail])assert.equal(validateCapture(copy(config)).url,fields.url);
  for(const url of ['https://github.com/microsoft','http://127.0.0.1:43112/','http://u:p@127.0.0.1:43111/','javascript:alert(1)'])
    assert.throws(()=>allowedUrl(url),/E_CAPTURE_ORIGIN/);
  for(const url of ['https://book.douban.com/tag/test','https://download.csdn.net/list/blog/test'])assert.equal(allowedUrl(url),url);
  for(const url of ['https://www.douban.com/','https://blog.csdn.net/','http://book.douban.com/','https://book.douban.com.evil.test/','https://u:p@download.csdn.net/'])
    assert.throws(()=>allowedUrl(url),/E_CAPTURE_ORIGIN/);
  for(const change of [{code:'return []'},{nextPageSelector:'//a'},{maxPages:11},{dedupeKey:'missing'},
    {fieldRequirements:[],validation:undefined},{processing:{version:1,rules:[{op:'eval',field:'name'}]}}])
    assert.throws(()=>validateCapture({...fields,...change}));
});
test('DOM capture refuses HTTP headers and User-Agent before any controlled page access',async()=>{
  let pageAccesses=0;
  const page=new Proxy({}, {get(){pageAccesses++;throw Error('Unexpected page access');}});
  for(const change of [{headers:{Accept:'text/html'}},{headers:{'User-Agent':'fixture-only'}},
    {userAgent:'fixture-only'},{executionKind:'browser-http'}]){
    await assert.rejects(runCapture({...copy(fields),...change},page),{code:'E_CAPTURE_CONFIG'});
  }
  assert.equal(pageAccesses,0,'DOM navigation cannot silently ignore HTTP-only configuration');
});
test('detail schema binds existing identity and URL fields and refuses overwrites',()=>{
  for(const detail of [{...listDetail.detail,urlField:'missing'},
    {...listDetail.detail,identityField:'missing'},
    {...listDetail.detail,itemConfig:{...listDetail.detail.itemConfig,title:'.title::text'}},
    {...listDetail.detail,numberFields:['absent']},
    {...listDetail.detail,code:'fetch()'}])assert.throws(()=>validateCapture({...listDetail,detail}));
});
test('original decimal Pipeline preserves list/detail association and rejects invalid prices',()=>{
  const pipeline=decimalFields(['price']);
  assert.deepEqual({...pipeline({id:'A',detailUrl:fields.url,price:'19.90'})},{id:'A',detailUrl:fields.url,price:19.9});
  for(const price of ['',null,'$25','19.999','NaN','-1'])assert.throws(()=>pipeline({price}),/PRICE_FORMAT/);
});
function componentPage(){
  let url='http://127.0.0.1:43111/list.html';const visits=[];
  return {visits,url:async()=>url,goto:async next=>{url=next;visits.push(next);},content:async()=>'',waitForSelector:async()=>{},
    locator:()=>({first:()=>({waitFor:async()=>{}})}),
    evaluate:async(callback,config)=>config?{records:url.endsWith('detail.html')?[{id:'A',author:'Ada'}]:[{id:'A',link:'detail.html'}]}:'http://127.0.0.1:43111/nested/'};
}
test('intentional page limit returns collected records with original partial result',async()=>{
  const page=componentPage();
  const result=await runCapture({url:await page.url(),itemConfig:{id:'.id',link:'a::href'},nextPageSelector:'a.next',maxPages:1},page);
  assert.deepEqual(result.data,[{id:'A',link:'detail.html'}]);
  assert.equal(result.engine.status,'partial');assert.equal(result.engine.stopReason,'page_limit');
});
test('details resolve against their source document base and retain bounded list status',async()=>{
  const page=componentPage();
  const result=await runCapture({url:await page.url(),itemConfig:{id:'.id',link:'a::href'},nextPageSelector:'a.next',maxPages:1,
    detail:{urlField:'link',identityField:'id',itemConfig:{id:'.id',author:'.author'}}},page);
  assert.deepEqual(page.visits,['http://127.0.0.1:43111/nested/detail.html']);
  assert.deepEqual(result.data,[{id:'A',link:page.visits[0],author:'Ada'}]);
  assert.equal(result.engine.status,'completed');assert.equal(result.list.engine.status,'partial');
  assert.equal(result.list.engine.stopReason,'page_limit');
});
