import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext,Script} from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const project='examples/sidebar-tools/cookie-editor';
const get=path=>readFile(path,'utf8');
async function harness(){
  const [source,html,css,config]=await Promise.all([
    get(project+'/src/main.js'),get(project+'/src/index.html'),
    get(project+'/src/style.css'),get(project+'/tool.config.json').then(JSON.parse)]);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const elements=new Map(ids.map(id=>[id,{
    id,value:'',hidden:true,disabled:false,checked:false,
    addEventListener(){},focus(){},append(){},replaceChildren(){},setAttribute(){},
    classList:{add(){},remove(){}}
  }]));
  const root={querySelector(selector){return elements.get(selector.slice(1));},
    querySelectorAll(){return [];},addEventListener(){},
    ownerDocument:{activeElement:null,createElement:()=>({
      append(){},setAttribute(){},addEventListener(){},focus(){}
    })}};
  const marker='void refresh();\n})();';
  assert.equal(source.split(marker).length,2,'test injection bound to one stable entrypoint');
  // Test-only instrumentation: production bytes never publish internal helpers.
  const instrument=source.replace(marker,
    'globalThis.__cookieTest={normalizeCookie,parseImport,exportText,saveToList,mergeImport,'+
    'sortCookies,setSite:host=>{data={hostname:host,origin:"https://"+host,cookies:[]}},'+
    'setRows:rows=>{data={...data,cookies:rows}}};\n})();');
  const context={
    OpenDeskTool:{root,request:async()=>({status:'unavailable'}),setState(){}},
    Blob,Date,URL,TextEncoder,structuredClone,console
  };
  new Script(instrument,{filename:'cookie-editor-main.js'}).runInNewContext(context);
  return {...context.__cookieTest,source,html,css,config,ids};
}
const expectError=(fn,pattern)=>{
  assert.throws(fn,error=>{assert.match(String(error?.message||error),pattern);return true;});
};
test('Cookie Editor is an official-compatible optional UI, with no premature cookies API',async()=>{
  const s=await harness();
  assert.equal(s.config.id,'cookie-editor');
  assert.deepEqual([...s.config.capabilities],['currentPage.read','user.export']);
  assert(!/request\(\s*['"]cookies\./.test(s.source));
  assert(!/\b(?:window|globalThis|chrome)\.cookies\./.test(s.source));
  assert(!/<script\b/i.test(s.html));
  assert(!/@import\b|url\(\s*https?:/i.test(s.css));
  for(const match of s.source.matchAll(/\bE\('([^']+)'\)/g))
    assert(s.ids.includes(match[1]),'missing UI field: '+match[1]);
  for(const id of ['cookie-value','import-text','import-file'])
    assert(new RegExp('id="'+id+'"[^>]*data-sensitive="true"').test(s.html),'secret input: '+id);
  const pkg=await createSidebarToolPackage(project);
  assert.equal(pkg.id,'cookie-editor');
  assert.equal(pkg.format,'opendesk.sidebar-tool.v1');
  assert(pkg.js.length<220000);
});
test('Cookie Header, JSON object, JSON array and Netscape import',async()=>{
  const a=await harness();a.setSite('shop.example.com');
  const header=a.parseImport('Cookie: sid=abc==; theme=dark','auto');
  assert.equal(header.length,2);
  assert.equal(header[0].name,'sid');
  assert.equal(header[0].value,'abc==');
  const mapped=a.parseImport('{"sid":"a","theme":"b"}','json');
  assert.equal(mapped.length,2);
  const array=a.parseImport('[{"name":"sid","value":"xyz","domain":".example.com","hostOnly":false,"path":"/"}]','json');
  assert.equal(array[0].domain,'.example.com');
  const wrapped=a.parseImport('{"cookies":[{"name":"sid","value":"x"}]}','json');
  assert.equal(wrapped.length,1);
  const netscape='# Netscape HTTP Cookie File\n'+
    '#HttpOnly_.example.com\tTRUE\t/\tTRUE\t0\tsid\tvalue\n';
  const rows=a.parseImport(netscape,'netscape');
  assert.equal(rows.length,1);
  assert.equal(rows[0].httpOnly,true);
  assert.equal(rows[0].secure,true);
  assert.equal(rows[0].hostOnly,false);
});
test('JSON and Netscape round trip; Header explicitly carries name=value only',async()=>{
  const a=await harness();a.setSite('example.com');
  const rows=a.parseImport('[{"name":"sid","value":"a=b","httpOnly":true,"secure":true,"sameSite":"lax",'+
    '"domain":".example.com","hostOnly":false,"session":true}]','json');
  a.setRows(rows);
  const json=a.parseImport(a.exportText('json'),'json');
  assert.equal(json[0].httpOnly,true);
  assert.equal(json[0].value,'a=b');
  const netscape=a.parseImport(a.exportText('netscape'),'netscape');
  assert.equal(netscape[0].httpOnly,true);
  assert.equal(netscape[0].value,'a=b');
  assert.equal(a.exportText('header').trim(),'sid=a=b');
});
test('Import merge previews counts, deduplicates, and does not mutate source',async()=>{
  const a=await harness();a.setSite('example.com');
  const before=a.parseImport('sid=old','header');
  const incoming=a.parseImport('sid=new; theme=dark','header');
  const preview=a.mergeImport(incoming,before);
  assert.equal(preview.created,1);assert.equal(preview.replaced,1);
  assert.equal(before[0].value,'old');
  assert.equal(preview.cookies.find(row=>row.name==='sid').value,'new');
  expectError(()=>a.parseImport('sid=1; sid=2','header'),/重复/);
  expectError(()=>a.saveToList(before,{...before[0],value:'again'}),/已存在/);
  assert.equal(a.saveToList(before,{...before[0],value:'again'},before[0])[0].value,'again');
});
test('Reject bad fields, foreign domains, insecure prefixes, expired and oversized imports',async()=>{
  const a=await harness();a.setSite('shop.example.com');
  for(const [record,pattern] of [
    [{name:'sid',value:'x',domain:'other.org'},/域名/],
    [{name:'sid',value:'x',path:'missing-slash'},/路径/],
    [{name:'bad name',value:'x'},/名称/],
    [{name:'__Host-sid',value:'x',secure:false},/前缀/],
    [{name:'sid',value:'x',sameSite:'no_restriction',secure:false},/SameSite/],
    [{name:'sid',value:'x',session:false,expirationDate:1},/未来/]
  ])expectError(()=>a.normalizeCookie(record),pattern);
  expectError(()=>a.parseImport('not a cookie line','header'),/Header/);
  expectError(()=>a.parseImport('sid=x; sid=y','auto'),/重复/);
  expectError(()=>a.parseImport('sid='+('x'.repeat(150001)),'header'),/150 KB/);
  expectError(()=>a.parseImport('['+Array.from({length:101},(_,i)=>
    '{"name":"n'+i+'","value":"x"}').join(',')+']','json'),/100/);
});
test('Editing cannot alter cookie identity, and Netscape must not drop partitioned cookies',async()=>{
  const a=await harness();a.setSite('example.com');
  const row=a.normalizeCookie({name:'sid',value:'one',partitionKey:{topLevelSite:'https://example.com'}});
  const updated={...row,value:'two'};
  assert.equal(a.saveToList([row],updated,row)[0].value,'two');
  expectError(()=>a.saveToList([row],{...updated,path:'/changed'},row),/身份/);
  a.setRows([row]);
  expectError(()=>a.exportText('netscape'),/分区/);
});
test('Only reviewed user.export files support non-executable .md/.txt/.json types',async()=>{
  const [host,bridge]=await Promise.all([
    get('src/ui/sidebar-tools.js'),get('src/sidebar-tools/bridge.js')
  ]);
  assert(host.includes('(?:md|txt|json)'),'native file exporter must allow JSON and text');
  assert(host.includes('application/json'));
  assert(bridge.includes("node.hasAttribute?.('data-sensitive')"),
    'host draft recovery must never retain cookie secrets');
});
