import test from 'node:test';
import assert from 'node:assert/strict';
import {receiveSidebarDraft} from '../../src/ui/tool-shell.js';

// Component routing only. Chrome's actual sender and Side Panel are tested natively.
const fixture=()=>({message:{protocol:'opendesk.sidebar.draft-import.v1',sourceUtf8:'async function main(){return 1;}'},
  sender:{id:'extension',url:'chrome-extension://extension/ui/tool.html?hostInstanceId=catalog',tab:{id:1,windowId:7,incognito:false}},
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
    {sender:{...f.sender,url:'https://example.com/ui/tool.html'}},
    {sender:{...f.sender,url:'chrome-extension://other/ui/tool.html'}},
    {sender:{...f.sender,url:'file:///ui/tool.html'}},
    {sender:{...f.sender,url:'chrome-extension://extension/other.html'}},
    {sender:{...f.sender,tab:{...f.sender.tab,incognito:true}}},
    {sender:{...f.sender,tab:undefined}}
  ])assert.equal(receiveSidebarDraft({...f,...change,receiveDraft:()=>assert.fail('untrusted draft applied')}),undefined);
});

test('editor rejection is returned explicitly without claiming import success',()=>{
  assert.deepEqual(receiveSidebarDraft({...fixture(),receiveDraft:()=>{throw {code:'E_BUSY',message:'Saving'};}}),
    {ok:false,error:{code:'E_BUSY',message:'Saving'}});
});
