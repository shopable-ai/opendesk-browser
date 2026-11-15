import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {ORDERED_SEARCH_SELECTION,WORKFLOW_ORDERED_SEARCH_FUNCTION} from '../../src/framework/workflow/ordered-search-source.js';
import {WORKFLOW_OBSERVE_SOURCE} from '../../src/framework/workflow/observation-source.js';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';

const request='读取 OpenDesk 的 Google 前三条自然搜索结果标题和网址';
const url='https://www.google.com/search?q=OpenDesk';
const document={url,documentId:'doc-search'};
const plain=value=>JSON.parse(JSON.stringify(value));
const anchor=(title,href='https://example.org/'+title,attrs='')=>
  `<a href="${href.replaceAll('&','&amp;').replaceAll('"','&quot;')}" ${attrs}><h3>${title}</h3></a>`;

// Execute the real fixed helper through only the documented Controller API.
// CSS runs against a DOM; visibility is modeled because jsdom has no layout.
function fixture(html,{urls=[url],nodes=[]}={}){
  const dom=new JSDOM(html),calls=[];
  let reads=0;
  const locator=(select)=>({
    async count(){return select().length;},
    nth(i){return locator(()=>select().slice(i,i+1));},
    locator(css){return locator(()=>select().flatMap(node=>[...node.querySelectorAll(css)]));},
    async getAttribute(name){assert.equal(select().length,1);return select()[0].getAttribute(name);},
    async innerText(){assert.equal(select().length,1);return select()[0].textContent;},
    async isVisible(){assert.equal(select().length,1);return !select()[0].closest('[hidden],[style="display:none"]');}
  });
  const page={
    async url(){calls.push('url');return urls[Math.min(reads++,urls.length-1)];},
    locator(css){calls.push(css);return locator(()=>[...dom.window.document.querySelectorAll(css)]);},
    async observe(){return {kind:'semantic-dom-summary',document:{...document},nodes,truncated:false};},
    async title(){return 'Search';}
  };
  return {page,calls,close:()=>dom.window.close()};
}
const run=(page,doc=document,req=request)=>runInNewContext(
  WORKFLOW_ORDERED_SEARCH_FUNCTION+';__observeWorkflowOrderedSearch(request,document)',
  {page,document:doc,request:req,URL,TextEncoder});

test('fixed selection is frozen and organic results retain DOM order and full real URLs',async t=>{
  assert.ok(Object.isFrozen(ORDERED_SEARCH_SELECTION));
  assert.deepEqual(Object.keys(ORDERED_SEARCH_SELECTION),['root','item','title','exclude','order','limit','scanLimit']);
  const redirect='https://www.google.com/goto?url=https%3A%2F%2Ftarget.example%2Fpath&token=real#fragment';
  const f=fixture(anchor('Outside')+'<div id="rso">'+anchor('Zebra',redirect)+
    anchor('Alpha','/relative?full=1&other=2')+anchor('Middle')+anchor('Fourth')+'</div>');
  t.after(f.close);
  const result=plain(await run(f.page));
  assert.deepEqual(Object.keys(result),['kind','version','document','query','selection','items']);
  assert.equal(result.kind,'ordered-search-results');assert.equal(result.version,1);
  assert.deepEqual(result.document,document);assert.equal(result.query,'OpenDesk');
  assert.deepEqual(result.items,[{position:1,title:'Zebra',href:redirect},
    {position:2,title:'Alpha',href:'https://www.google.com/relative?full=1&other=2'},
    {position:3,title:'Middle',href:'https://example.org/Middle'}]);
  assert.deepEqual(result.selection,{...ORDERED_SEARCH_SELECTION,scanned:3,excluded:0});
  assert.deepEqual(f.calls,['url','#rso','url']);
});

test('only advertising ancestors and invisible candidates are excluded before the first three ranks',async t=>{
  const ads=['data-text-ad','data-ad','data-ad-slot','id="tads"','id="bottomads"',
    'aria-label="Sponsored"','aria-label="sPoNsOrEd"','aria-label="广告"'];
  const html=ads.map(attr=>`<div ${attr}>${anchor('Ad')}</div>`).join('')+
    anchor('Hidden',undefined,'hidden')+'<a href="https://hidden.org"><h3 hidden>Hidden heading</h3></a>'+
    anchor('First')+anchor('Second')+anchor('Third')+anchor('Fourth');
  const f=fixture('<div id="rso">'+html+'</div>');t.after(f.close);
  const result=plain(await run(f.page));
  assert.deepEqual(result.items.map(item=>item.title),['First','Second','Third']);
  assert.equal(result.selection.scanned,13);assert.equal(result.selection.excluded,10);
  assert.equal(result.selection.excluded,result.selection.scanned-3);
});

test('a failed second natural rank returns a prefix and never substitutes the fourth result',async t=>{
  const first=anchor('First');
  for(const failed of [anchor('   '),anchor('Bad','javascript:alert(1)'),
    anchor('Credentials','https://u:p@example.org/'),anchor('Broken','http://['),anchor('Missing',''),
    anchor('Too long','https://long.org/'+'x'.repeat(2048)),
    anchor('x'.repeat(301),'https://title.example/'),anchor('Duplicate','https://example.org/First'),
    '<a href="https://ambiguous.example/"><h3>One</h3><h3>Two</h3></a>',
    anchor('标'.repeat(300),'https://budget.example/'+'x'.repeat(1900))]){
    const f=fixture('<div id="rso">'+first+failed+anchor('Third')+anchor('Fourth')+'</div>');t.after(f.close);
    const result=plain(await run(f.page));
    assert.deepEqual(result.items,[{position:1,title:'First',href:'https://example.org/First'}]);
    assert.equal(result.selection.scanned,2);assert.equal(result.selection.excluded,0);
    assert.deepEqual(f.calls,['url','#rso','url']);
  }
});

test('partial evidence and the thirty-candidate scan limit never claim completion',async t=>{
  for(const [html,expected] of [['',[]],[anchor('Only'),['Only']],
    [anchor('First')+anchor('Second'),['First','Second']],
    [Array.from({length:30},()=>anchor('Ad',undefined,'hidden')).join('')+anchor('Beyond'),[]]]){
    const f=fixture('<div id="rso">'+html+'</div>');t.after(f.close);
    const result=plain(await run(f.page));
    assert.deepEqual(result.items.map(item=>item.title),expected);
    assert.ok(result.items.length<3);assert.ok(result.selection.scanned<=30);
    assert.equal(result.complete,undefined);assert.equal(result.status,undefined);
    if(html.includes('Beyond'))assert.equal(result.selection.scanned,30);
  }
});

test('unrequested reads, query mismatch and non-search documents make no additional page calls',async()=>{
  const cases=[
    [{...document,url:'https://www.google.com/'},request],
    [{...document,url:'https://other.example/search?q=OpenDesk'},request],
    [{...document,url:'http://www.google.com/search?q=OpenDesk'},request],
    [{...document,url:'https://www.google.com/search?q='},request],
    [{...document,url:'https://www.google.com/search?q='+ 'x'.repeat(121)},request+'x'.repeat(121)],
    [{...document,url:'https://www.google.com/search?q=Different'},request],
    [{...document,url:'https://www.google.com/search?q=OpenDesk&q=Other'},request],
    [{...document,url:'not a URL'},request],[{url},request],
    [document,'OpenDesk'],[document,'读取 OpenDesk 搜索输入框'],
    [document,'读取 OpenDesk 前30条搜索结果标题'],[document,'读取 OpenDesk 前三条新闻标题']
  ];
  for(const [doc,req] of cases){
    const page={locator(){assert.fail('ineligible locator');},url(){assert.fail('ineligible URL read');}};
    assert.equal(await run(page,doc,req),null);
  }
});

test('before/after URL checks reject same-document navigation and read failures propagate',async t=>{
  for(const urls of [[url+'&changed=before'],[url,url+'&changed=after']]){
    const f=fixture('<div id="rso">'+anchor('One')+'</div>',{urls});t.after(f.close);
    await assert.rejects(run(f.page),{code:'E_DOCUMENT_STALE'});
    if(urls.length===1)assert.deepEqual(f.calls,['url']);
  }
  const f=fixture('<div id="rso">'+anchor('One')+'</div>');t.after(f.close);
  f.page.locator=()=>{throw new Error('revoked');};
  await assert.rejects(run(f.page),/revoked/);
});

test('negative instructions and quoted or literal query data never create a Locator',async()=>{
  const query='读取前三条自然结果标题和网址';
  const doc={...document,url:'https://www.google.com/search?q='+encodeURIComponent(query)};
  const cases=[
    [document,'搜索 OpenDesk，不要读取前三条自然结果标题和网址'],
    [document,'OpenDesk: do not read top 3 organic results titles and URLs'],
    [document,"OpenDesk: don't extract first three search results titles"],
    [document,'OpenDesk，禁止读取前三条搜索结果标题'],
    [doc,query],[doc,'搜索'+query],
    ...['「'+query+'」','『'+query+'』','“'+query+'”','‘'+query+'’','"'+query+'"']
      .map(quoted=>[doc,'搜索 '+quoted]),
    [document,'搜索 "读取前三条自然结果标题和网址" OpenDesk']
  ];
  for(const [target,req] of cases){
    const page={locator(){assert.fail('denied request created a Locator');},
      url(){assert.fail('denied request called page.url');}};
    assert.equal(await run(page,target,req),null,req);
  }
});

test('tell-me requests and a positive clause after a negation still explicitly request results',async t=>{
  const query='读取前三条自然结果标题和网址';
  for(const [doc,req] of [
    [document,'告诉我 OpenDesk 前三条自然搜索结果标题和网址'],
    [document,'不要点击 OpenDesk，告诉我前三条自然搜索结果标题和网址'],
    [document,'Tell me the top 3 search results titles and addresses for opendesk'],
    [{...document,url:'https://www.google.com/search?q='+encodeURIComponent(query)},
      '搜索「'+query+'」，告诉我前三条自然搜索结果标题和网址']
  ]){
    const f=fixture('<div id="rso">'+anchor('One')+'</div>',{urls:[doc.url]});t.after(f.close);
    const result=await run(f.page,doc,req);
    assert.equal(result.items[0].title,'One',req);
  }
});

test('titles over 300 characters stop the prefix while the 300-character boundary retains its rank',async t=>{
  const title='标'.repeat(300);
  const f=fixture('<div id="rso">'+anchor(title,'https://boundary.example/')+
    anchor('x'.repeat(301),'https://oversized.example/')+anchor('Three')+anchor('Four')+'</div>');t.after(f.close);
  const result=await run(f.page);
  assert.deepEqual(plain(result.items),[{position:1,title,href:'https://boundary.example/'}]);
  assert.equal(result.selection.scanned,2);assert.equal(result.selection.excluded,0);
});

test('duplicate roots fail; an advertising ancestor outside #rso is still excluded',async t=>{
  const duplicate=fixture('<div id="rso"></div><div id="rso"></div>');t.after(duplicate.close);
  await assert.rejects(run(duplicate.page),/not unique/);
  const f=fixture('<div data-ad><div id="rso">'+anchor('Ad')+'</div></div>');t.after(f.close);
  const result=await run(f.page);assert.equal(result.items.length,0);assert.equal(result.selection.excluded,1);
});

test('English explicit request works and exact 2048-character href is preserved',async t=>{
  const href='https://long.example/'+'x'.repeat(2048-'https://long.example/'.length);
  const f=fixture('<div id="rso">'+anchor('Long',href)+anchor('Two')+anchor('Three')+'</div>');t.after(f.close);
  const result=await run(f.page,document,'Read top 3 organic search results titles and URLs for OpenDesk');
  assert.equal(result.items[0].href,href);assert.equal(result.items[0].href.length,2048);
});

test('ordered evidence shares the original UTF-8 budget and never truncates long hrefs',async t=>{
  const href=i=>'https://long.example/'+i+'x'.repeat(1980);
  const nodes=Array.from({length:24},(_,i)=>({role:'button',name:'搜'.repeat(119)+i,
    text:'搜'.repeat(119)+i,state:{visible:true},locator:{kind:'css',value:'#button'+i}}));
  const f=fixture('<div id="rso">'+[1,2,3].map(i=>anchor('Result '+i,href(i))).join('')+'</div>',{nodes});t.after(f.close);
  const result=await runInNewContext(WORKFLOW_OBSERVE_SOURCE+';main()',
    {page:f.page,params:{request},URL,TextEncoder});
  assert.equal(result.orderedResults.items.length,3);
  assert.deepEqual(plain(result.orderedResults.items.map(row=>row.href)),[1,2,3].map(href));
  assert.ok(new TextEncoder().encode(JSON.stringify(result.orderedResults)).length<=8*1024);
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).length<=10*1024);
  assert.equal(result.truncated,true);
  const huge=fixture('<div id="rso">'+anchor('搜'.repeat(2000),'https://huge.example/')+anchor('Small')+'</div>');t.after(huge.close);
  const partial=await run(huge.page);assert.equal(partial.items.length,0);
  assert.equal(partial.selection.scanned,1);assert.equal(partial.selection.excluded,0);
});

test('planning, compilation and reopening execute identical helper source and retain the hash',async t=>{
  const f=fixture('<div id="rso">'+anchor('One')+anchor('Two')+anchor('Three')+'</div>');t.after(f.close);
  const workflow=emptyWorkflow('https://www.google.com','12345678-1234-1234-1234-123456789abc');
  workflow.steps=[{stepId:'read',op:'observe'}];
  const compiled=await compileWorkflow(workflow,{observationRequest:request});
  const planned=await runInNewContext(WORKFLOW_OBSERVE_SOURCE+';main()',
    {page:f.page,params:{request},URL,TextEncoder});
  const executed=await runInNewContext(compiled.sourceUtf8+';main()',
    {page:f.page,URL,TextEncoder});
  assert.deepEqual(plain(executed.read),plain(planned));
  assert.equal(executed.read.orderedResults.items.length,3);
  const reopened=await compileWorkflow(plain(compiled.workflow));
  assert.equal(reopened.sourceUtf8,compiled.sourceUtf8);assert.equal(reopened.sourceHash,compiled.sourceHash);
});
