import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'acorn';

// Load the real consumer and its actual identity imports without starting the
// UI/TSX dependency graph. No copied implementation or product build.
const shellURL=new URL('../../src/ui/tool-shell.js',import.meta.url);
const source=await readFile(shellURL,'utf8');
const nodes=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.filter(node=>
  node.type==='ImportDeclaration'&&['../environment.js','../tool-document-url.js'].includes(node.source.value)||
  node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name==='receiveSidebarDraft');
const consumer=nodes.map(node=>node.type==='ImportDeclaration'
  ?source.slice(node.start,node.source.start)+JSON.stringify(new URL(node.source.value,shellURL).href)+source.slice(node.source.end,node.end)
  :source.slice(node.start,node.end)).join('\n');
const {receiveSidebarDraft}=await import('data:text/javascript;base64,'+Buffer.from(consumer).toString('base64'));

// Component routing only. Chrome's actual sender and Side Panel are tested natively.
const fixture=()=>({message:{protocol:'opendesk.sidebar.draft-import.v1',sourceUtf8:'async function main(){return 1;}'},
  sender:{id:'extension',url:'chrome-extension://extension/sidepanel.html?hostInstanceId=catalog',
    tab:{id:1,windowId:7,incognito:false},frameId:0,documentId:'catalog-document',documentLifecycle:'active'},
  windowId:7,sidebarSurface:true,api:{runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path}}});

test('same-window catalog hands off exact source without invoking a runner',()=>{
  const f=fixture(),drafts=[];
  assert.deepEqual(receiveSidebarDraft({...f,receiveDraft:source=>drafts.push(source)}),{ok:true});
  assert.deepEqual(drafts,[f.message.sourceUtf8]);
});

test('draft handoff refuses other windows, senders, content pages, private tabs and catalog recipients',()=>{
  const f=fixture();
  for(const change of [
    {sidebarSurface:false},{windowId:null},{windowId:9},
    {message:{...f.message,protocol:'unknown'}},
    {sender:{...f.sender,id:'other-extension'}},
    {sender:{...f.sender,url:'https://example.com/sidepanel.html'}},
    {sender:{...f.sender,url:'chrome-extension://other/sidepanel.html'}},
    {sender:{...f.sender,url:'file:///sidepanel.html'}},
    {sender:{...f.sender,url:'chrome-extension://extension/other.html'}},
    {sender:{...f.sender,tab:{...f.sender.tab,incognito:true}}},
    {sender:{...f.sender,tab:undefined}}
  ])assert.equal(receiveSidebarDraft({...f,...change,receiveDraft:()=>assert.fail('untrusted draft applied')}),undefined);
});

test('editor rejection is returned explicitly without claiming import success',()=>{
  assert.deepEqual(receiveSidebarDraft({...fixture(),receiveDraft:()=>{throw {code:'E_BUSY',message:'Saving'};}}),
    {ok:false,error:{code:'E_BUSY',message:'Saving'}});
});

test('draft handoff rejects invalid document/frame/lifecycle and unknown or duplicate locator parameters before importing',()=>{
  const f=fixture(),url=f.sender.url,preview='00000000-0000-4000-8000-000000000001';
  for(const change of [
    {frameId:8},{frameId:undefined},{documentId:undefined},{documentId:''},{documentLifecycle:'cached'},
    {url:url.split('?')[0]},{url:url+'&unknown=1'},{url:url+'&hostInstanceId=catalog'},
    {url:url+'&toolId=quick-notes&toolId=quick-notes'},
    {url:url+'&previewId='+preview+'&previewId='+preview},
    {url:url+'&scheduledRunner=1&scheduledRunner=1'},
    {url:url+'#fragment'},{url:url.replace('/sidepanel.html','/ui/tool.html')}
  ]){
    let imports=0;
    const result=receiveSidebarDraft({...f,sender:{...f.sender,...change},receiveDraft:()=>{imports++;}});
    assert.equal(imports,0,JSON.stringify(change));
    assert.equal(result,undefined,JSON.stringify(change));
  }
});

test('valid same-window tool and preview tabs keep source/draft handoff and asynchronous editor outcomes',async()=>{
  const f=fixture(),preview='00000000-0000-4000-8000-000000000001',draft={format:'draft',files:[]};
  for(const suffix of ['', '&toolId=quick-notes','&previewId='+preview]){
    const imported=[];
    assert.deepEqual(await receiveSidebarDraft({...f,sender:{...f.sender,url:f.sender.url+suffix},
      message:{...f.message,draft},receiveDraft:async value=>{imported.push(value);}}),{ok:true});
    assert.equal(imported[0],draft);
  }
  assert.deepEqual(await receiveSidebarDraft({...f,receiveDraft:async()=>{throw {code:'E_BUSY',message:'Saving'};}}),
    {ok:false,error:{code:'E_BUSY',message:'Saving'}});
});
