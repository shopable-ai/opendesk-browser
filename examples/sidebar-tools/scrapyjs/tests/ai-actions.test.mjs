import assert from 'node:assert/strict';
import {test} from 'node:test';
import '../src/app-model.js';
import {resolveAiReply} from '../src/ai-actions.js';

const validate = globalThis.ScrapyAppModel.validateConfig;
const base = () => ({url:'https://example.com/catalog',itemConfig:{
  _listItem:'.product',title:'h2::text',url:'a::href'
}});
function changes(before,after) {
  const compare=(a,b,key)=>({key,before:a[key],after:b[key],kind:
    !Object.hasOwn(a,key)?'新增':!Object.hasOwn(b,key)?'删除':
    JSON.stringify(a[key])!==JSON.stringify(b[key])?'修改':'保留'});
  const fields=[...new Set([...Object.keys(before.itemConfig),...Object.keys(after.itemConfig)])]
    .filter(key=>!['_listContainer','_listItem'].includes(key))
    .map(key=>compare(before.itemConfig,after.itemConfig,key));
  const options=[...new Set([...Object.keys(before),...Object.keys(after)])]
    .filter(key=>key!=='itemConfig'&&JSON.stringify(before[key])!==JSON.stringify(after[key]));
  return {fields,listChanged:['_listItem','_listContainer'].some(key=>before.itemConfig[key]!==after.itemConfig[key]),
    optionChanges:options.map(key=>compare(before,after,key))};
}
const opts=config=>({base:config,expectedUrl:config.url,validate,changes});

test('field action keeps existing selectors, proposes price and warns about missing DOM evidence',()=>{
  const before=base();
  const reply=resolveAiReply({type:'actions',actions:[{kind:'field.upsert',key:'price',rule:'.price::text'}]},opts(before));
  assert.equal(reply.type,'proposal');
  assert.equal(reply.config.itemConfig.title,'h2::text');
  assert.equal(reply.config.itemConfig.url,'a::href');
  assert.equal(reply.config.itemConfig.price,'.price::text');
  assert.match(reply.warnings[0],/尚未经过网页验证/);
  assert.equal(before.itemConfig.price,undefined);
});
test('CSV display names and order never rename capture engine keys',()=>{
  const before={...base(),itemConfig:{...base().itemConfig,price:'.price::text'}};
  const reply=resolveAiReply({type:'actions',actions:[{kind:'csv.configure',
    fieldNames:{title:'商品名称',price:'商品价格'},fieldOrder:['price','title','url']}]},
    {...opts(before),hasSample:true});
  assert.deepEqual(reply.config.output.fieldOrder,['price','title','url']);
  assert.equal(reply.config.output.fieldNames.price,'商品价格');
  assert.equal(reply.config.itemConfig.title,'h2::text');
  assert.equal(reply.config.itemConfig.price,'.price::text');
  assert.equal(Object.hasOwn(reply.config.itemConfig,'商品价格'),false);
});
test('safe pagination shows real missing-selector warning',()=>{
  const before=base();
  const reply=resolveAiReply({type:'actions',actions:[{kind:'pagination.configure',maxPages:3}]},opts(before));
  assert.equal(reply.config.maxPages,3);
  assert.match(reply.warnings.join(' '),/下一页选择器/);
});
test('read-only and needs-input answers cannot mutate configuration',()=>{
  const before=base();
  const inspect=resolveAiReply({type:'explain',message:'包含两个采集字段。'},opts(before));
  const missing=resolveAiReply({type:'needs-input',message:'请提供列表 DOM 样本。',missing:['列表容器 HTML']},opts(before));
  assert.equal(inspect.type,'explain');
  assert.equal(missing.type,'needs-input');
  assert.equal(before.itemConfig.price,undefined);
});
test('unknown action, unsafe field and nonexistent CSV key are rejected',()=>{
  const before=base();
  assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'script.run',code:'alert(1)'}]},opts(before)),/未授权/);
  assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'field.upsert',key:'__proto__',rule:'a'}]},opts(before)),/字段名称/);
  assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'csv.configure',fieldNames:{price:'价格'}}]},opts(before)),/不存在/);
});
test('unshared prior config cannot be replaced; target URL cannot change',()=>{
  const before=base();
  assert.throws(()=>resolveAiReply({type:'config.proposal',config:before},{...opts(before),allowFullConfig:false}),/增量动作/);
  assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'pagination.configure',maxPages:3}]},
    {...opts(before),expectedUrl:'https://example.com/other'}),/目标网址/);
});
test('legacy complete config remains reviewable when user shared the original',()=>{
  const before=base();
  const next={...before,maxPages:2,nextPageSelector:'a.next'};
  const reply=resolveAiReply(next,opts(before));
  assert.equal(reply.type,'proposal');
  assert.equal(reply.config.maxPages,2);
});
test('ordinary underscore fields retain their rules and CSV aliases in unrelated proposals',()=>{
  const before={...base(),itemConfig:{...base().itemConfig,_source:'.source::text'},
    output:{fieldNames:{_source:'来源'}}};
  const reply=resolveAiReply({type:'actions',actions:[
    {kind:'field.upsert',key:'_source',rule:'.origin::text'},
    {kind:'pagination.configure',maxPages:3}
  ]},opts(before));
  assert.equal(reply.config.itemConfig._source,'.origin::text');
  assert.equal(reply.config.output.fieldNames._source,'来源');
  assert.equal(before.itemConfig._source,'.source::text');
  for(const key of ['_listContainer','_listItem']) {
    assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'field.upsert',key,rule:'.unsafe'}]},opts(before)),/保留字段/);
    assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'csv.configure',fieldNames:{[key]:'保留'}}]},opts(before)),/保留字段/);
  }
});
test('CSV aliases and order include configured detail outputs without renaming capture fields',()=>{
  const before={...base(),detail:{urlField:'url',identityField:'title',
    itemConfig:{title:'h1::text',price:'.price::text'}}};
  const reply=resolveAiReply({type:'actions',actions:[{kind:'csv.configure',
    fieldNames:{price:'价格',title:'标题'},fieldOrder:['price','title','url']}]},opts(before));
  assert.deepEqual(reply.config.detail,before.detail);
  assert.deepEqual(reply.config.itemConfig,before.itemConfig);
  assert.equal(reply.config.output.fieldNames.price,'价格');
  assert.deepEqual(reply.config.output.fieldOrder,['price','title','url']);
});
test('CSV accepts only the fixed outputs of enabled splitPublication processing',()=>{
  const before={...base(),itemConfig:{...base().itemConfig,publication:'.pub::text'},
    processing:{version:1,rules:[{op:'splitPublication',field:'publication'}]}};
  const reply=resolveAiReply({type:'actions',actions:[{kind:'csv.configure',
    fieldNames:{price:'价格',author:'作者'},fieldOrder:['price','title','author']}]},opts(before));
  assert.deepEqual(reply.config.processing,before.processing);
  assert.equal(Object.hasOwn(reply.config.itemConfig,'price'),false);
  assert.equal(reply.config.output.fieldNames.price,'价格');
  assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'csv.configure',
    fieldNames:{unavailable:'未知'}}]},opts(before)),/不存在/);
  assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'csv.configure',
    fieldNames:{price:'价格'}}]},opts(base())),/不存在/);
});

test('business envelope accepts exactly one whitelist operation without config or execution payloads',()=>{
  for(const operation of [{kind:'capture.start'},{kind:'capture.stop'},{kind:'results.show'},
    {kind:'results.export',format:'json'},{kind:'results.export',format:'csv'}]) {
    assert.deepEqual(resolveAiReply({type:'operation',operation},opts(base())),{type:'operation',operation});
  }
  for(const value of [
    {type:'operation',operation:{kind:'script.run'}},
    {type:'operation',operation:{kind:'capture.start',format:'json'}},
    {type:'operation',operation:{kind:'results.export',format:'zip'}},
    {type:'operation',operation:{kind:'results.export'}},
    {type:'operation',operation:{kind:'capture.stop',url:'https://evil.test/'}},
    {type:'operation',operation:{kind:'capture.start'},actions:[]},
    {type:'actions',actions:[{kind:'capture.start'}]}
  ]) assert.throws(()=>resolveAiReply(value,opts(base())));
});

// Authorization comes from this turn's literal request, never the model's actions.
async function scoped(request,before,candidate) {
  const {resolveConfigurationEditScope,assertConfigurationEditScope}=await import('../src/ai-actions.js');
  const scope=resolveConfigurationEditScope(request,before);
  const reply=resolveAiReply(candidate,opts(before));
  assertConfigurationEditScope(scope,before,reply.config,validate);
  return reply.config;
}
test('semantic scope enforces exact header values and all final differences for both envelopes',async()=>{
  const before={...base(),maxPages:2,output:{fieldNames:{url:'链接'},fieldOrder:['url','title']}};
  const expected={...before,output:{...before.output,fieldNames:{...before.output.fieldNames,title:'书名'}}};
  for(const envelope of [config=>({type:'config.proposal',config}),config=>config]) {
    assert.deepEqual(await scoped('把 title 的 CSV 表头改成书名',before,envelope(expected)),validate(expected));
    for(const config of [
      {...expected,maxPages:3}, {...expected,url:'https://example.com/other'},
      {...expected,itemConfig:{...expected.itemConfig,title:'h3::text'}},
      {...expected,output:{...expected.output,fieldNames:{...expected.output.fieldNames,title:'标题'}}},
      {...expected,output:{...expected.output,fieldNames:{...expected.output.fieldNames,url:'另一表头'}}},
      {...expected,output:{...expected.output,fieldOrder:['title','url']}},
      {...expected,waitForSelector:'.secret'}
    ]) await assert.rejects(scoped('把 title 的 CSV 表头改成书名',before,envelope(config)));
  }
  const action={kind:'csv.configure',fieldNames:{title:'书名'}};
  assert.deepEqual(await scoped('把 title 的 CSV 表头改成书名',before,{type:'actions',actions:[action]}),validate(expected));
  await assert.rejects(scoped('把 title 的 CSV 表头改成书名',before,{type:'actions',actions:[action,{kind:'pagination.configure',maxPages:3}]}));
  await assert.rejects(scoped('把 title 的 CSV 表头改成书名',before,{type:'actions',actions:[action,{kind:'capture.start'}]}));
});
for(const request of [
  'CSV 中 title 的表头改为‘标题’',
  'CSV 中 title 的字段表头改为‘标题’，修改配置',
  'CSV中title的表头改为标题',
  '请把 CSV 中 url 的字段表头改成“标题”，修改配置',
  '把 title 的 CSV 表头改为"标题"'
])test('CSV header wording authorizes only the named header: '+request,async()=>{
  const before={...base(),maxPages:2,output:{fieldNames:{title:'原标题',url:'链接'},fieldOrder:['url','title']}};
  const key=request.includes('url')?'url':'title';
  const expected={...before,output:{...before.output,fieldNames:{...before.output.fieldNames,[key]:'标题'}}};
  const proposal={type:'actions',actions:[{kind:'csv.configure',fieldNames:{[key]:'标题'}}]};
  assert.deepEqual(await scoped(request,before,proposal),validate(expected));
  assert.deepEqual(await scoped(request,before,{type:'config.proposal',config:expected}),validate(expected));
  await assert.rejects(scoped(request,before,{type:'actions',actions:[...proposal.actions,{kind:'pagination.configure',maxPages:3}]}));
  await assert.rejects(scoped(request,before,{type:'config.proposal',config:{...expected,
    output:{...expected.output,fieldNames:{...expected.output.fieldNames,[key]:'其他'}}}}));
  assert.deepEqual(before.output.fieldNames,{title:'原标题',url:'链接'});
});

test('CSV header quotes and modification suffix do not bypass readonly or clarification protection',async()=>{
  const {resolveConfigurationEditScope}=await import('../src/ai-actions.js');
  const before=base(),candidate={type:'actions',actions:[{kind:'csv.configure',fieldNames:{title:'标题'}}]};
  for(const request of [
    '解释 CSV 中 title 的表头改为‘标题’的影响',
    '“CSV 中 title 的表头改为‘标题’”',
    '不要将 CSV 中 title 的表头改为‘标题’',
    '如果 CSV 中 title 的表头改为‘标题’，修改配置',
    'CSV 中 title 的表头改为‘标题’，说明配置',
    'CSV 中 title 的表头改为‘标题”，修改配置',
    'CSV 中 title 的表头改为‘标题’，开始采集',
    'CSV 中 title 的表头改为‘标题’，修改配置，随便处理其他规则',
    'CSV 中 title 的表头改为‘标题’，CSV 中 title 的表头改为‘名称’',
    'CSV 中 missing 的表头改为‘标题’',
    'CSV 中 title 的表头改为', 'CSV 中的表头改为‘标题’', '修改配置'
  ]){
    assert.notEqual(resolveConfigurationEditScope(request,before).type,'edit',request);
    await assert.rejects(scoped(request,before,candidate),undefined,request);
  }
});

test('scope builds explicit batches, preserves arrays and ignores object key ordering after validation',async()=>{
  const before={...base(),itemConfig:{...base().itemConfig,rating:'.rating::text'}};
  const request='把 title 的 CSV 表头改成书名，列顺序改为 title、rating；把最大页数设为 3';
  const expected={...before,maxPages:3,output:{fieldNames:{title:'书名'},fieldOrder:['title','rating']}};
  const reordered=Object.fromEntries(Object.entries(expected).reverse());
  reordered.itemConfig=Object.fromEntries(Object.entries(expected.itemConfig).reverse());
  assert.deepEqual(await scoped(request,before,{type:'config.proposal',config:reordered}),validate(reordered));
  await assert.rejects(scoped(request,before,{type:'config.proposal',config:{...expected,output:{...expected.output,fieldOrder:['rating','title']}}}));
  assert.equal((await scoped('把最大页数设为 3',before,{type:'actions',actions:[{kind:'pagination.configure',maxPages:3}]})).maxPages,3);
});
test('ambiguous, negated, quoted, contradictory and page-derived instructions cannot authorize a candidate',async()=>{
  const {resolveConfigurationEditScope}=await import('../src/ai-actions.js');
  const before=base(),candidate={type:'actions',actions:[{kind:'field.upsert',key:'title',rule:'h3::text'}]};
  for(const request of ['把配置改好','根据当前网页修改采集规则','把采集规则设为标题字段',
    '把最大页数设为 3，但不要改页数','把最大页数设为 3；把最大页数设为 4',
    '“把最大页数设为 3”','示例中的把最大页数设为 3','不要修改配置','解释当前配置',
    '把 title 的 CSV 表头改成书名，开始采集','把 CSV 列顺序改为 title、missing',
    '把最大页数设为 3；随便处理其他规则']) {
    assert.notEqual(resolveConfigurationEditScope(request,before).type,'edit',request);
    await assert.rejects(scoped(request,before,candidate),undefined,request);
  }
});
test('literal selector and copied source rule remain narrow, without claiming page observation',async()=>{
  const before=base();
  assert.equal((await scoped('把采集规则设为 title 字段，选择器 h2::text',before,
    {type:'actions',actions:[{kind:'field.upsert',key:'title',rule:'h2::text'}]})).itemConfig.title,'h2::text');
  const source={...before,itemConfig:{...before.itemConfig,title:{selector:'h2',read:'text'}}};
  const request='保留全部规则，只增加与 title 相同的 column_title，仅采当前页。';
  const expected={...source,itemConfig:{...source.itemConfig,column_title:structuredClone(source.itemConfig.title)}};
  assert.deepEqual(await scoped(request,source,{type:'config.proposal',config:expected}),validate(expected));
  await assert.rejects(scoped(request,source,{type:'config.proposal',config:{...expected,itemConfig:{...expected.itemConfig,column_title:'h2::text'}}}));
});

test('literal selector retains escaped terminal punctuation exactly in either proposal envelope',async()=>{
  const {resolveConfigurationEditScope}=await import('../src/ai-actions.js');
  const before=base();
  for(const selector of ['.price\\.','.price\\!']){
    const request='把采集规则设为 title 字段，选择器 '+selector;
    const expected={...before,itemConfig:{...before.itemConfig,title:selector}};
    for(const envelope of [
      config=>({type:'config.proposal',config}),
      config=>({type:'actions',actions:[{kind:'field.upsert',key:'title',rule:config.itemConfig.title}]})
    ]){
      assert.deepEqual(await scoped(request,before,envelope(expected)),validate(expected));
      const truncated={...expected,itemConfig:{...expected.itemConfig,title:selector.slice(0,-1)}};
      await assert.rejects(scoped(request,before,envelope(truncated)));
    }
  }
  for(const suffix of ['.','!','。','！'])
    assert.equal(resolveConfigurationEditScope('把采集规则设为 title 字段，选择器 h2::text'+suffix,before).type,'needs-input');
});

test('only an empty explicit-selector draft may take the current-page URL',async()=>{
  const {resolveConfigurationEditScope,assertConfigurationEditScope}=await import('../src/ai-actions.js');
  const request='把采集规则设为 title 字段，选择器 h2::text',empty={url:'',itemConfig:{}};
  const page={url:'https://example.com/current'},scope=resolveConfigurationEditScope(request,empty,{page});
  const expected={url:page.url,itemConfig:{title:'h2::text'}};
  assert.doesNotThrow(()=>assertConfigurationEditScope(scope,empty,expected,validate));
  assert.throws(()=>assertConfigurationEditScope(scope,empty,{...expected,url:'https://example.com/other'},validate));
  assert.notEqual(resolveConfigurationEditScope(request,empty).type,'edit');
  assert.notEqual(resolveConfigurationEditScope(request,{url:'',itemConfig:{rating:'h3'}},{page}).type,'edit');
  const existing=base(),preserved=resolveConfigurationEditScope(request,existing,{page});
  assert.equal(preserved.expected.url,existing.url);
});

test('scope comparison uses the existing validator normalization for both sides',async()=>{
  const before={url:'http://127.0.0.1:43121/data',executionMode:'http-local',timeoutMs:30000,itemConfig:{title:'title'}};
  const expected={...before,maxPages:3};
  const actual=await scoped('把最大页数设为 3',before,{type:'config.proposal',config:{...expected,timeoutMs:15000}});
  assert.equal(actual.timeoutMs,15000);
  await assert.rejects(scoped('把最大页数设为 3',before,{type:'config.proposal',config:{...expected,timeoutMs:10000}}));
});

test('natural-language creation from an empty draft permits only the observed current-page list and requested headers',async()=>{
  const {resolveConfigurationEditScope,assertConfigurationEditScope}=await import('../src/ai-actions.js');
  const before={url:'',itemConfig:{}},page={url:'https://example.com/catalog'};
  const request='请根据当前网页创建一个采集配置：采集当前页每本书的书名、价格和详情链接，CSV 表头分别为书名、价格、详情链接，只采当前页。';
  const scope=resolveConfigurationEditScope(request,before,{page});
  assert.equal(scope.type,'create');
  const candidate={url:page.url,itemConfig:{_listItem:'.entry',title:'h2::text',price:'.cost::text',url:'a::href'},
    maxPages:1,output:{fieldNames:{title:'书名',price:'价格',url:'详情链接'},fieldOrder:['title','price','url']}};
  assert.doesNotThrow(()=>assertConfigurationEditScope(scope,before,candidate,validate));
  for(const changed of [
    {...candidate,url:page.url+'?other'}, {...candidate,maxPages:2}, {...candidate,nextPageSelector:'a.next'},
    {...candidate,itemConfig:{title:'h2::text',price:'.cost::text',url:'a::href'}},
    {...candidate,output:{fieldNames:{title:'错误',price:'价格',url:'详情链接'}}},
    {...candidate,itemConfig:{...candidate.itemConfig,extra:'p'}},
    {...candidate,processing:{version:1,rules:[{op:'splitPublication',field:'title'}]}}
  ])assert.throws(()=>assertConfigurationEditScope(scope,before,changed,validate));
  assert.notEqual(resolveConfigurationEditScope(request,{url:page.url,itemConfig:{title:'h2'}},{page}).type,'create');
  assert.notEqual(resolveConfigurationEditScope(request,before).type,'create');
  assert.notEqual(resolveConfigurationEditScope('解释如何根据当前网页创建采集配置，只采当前页',before,{page}).type,'create');
  assert.deepEqual(before,{url:'',itemConfig:{}});
});
