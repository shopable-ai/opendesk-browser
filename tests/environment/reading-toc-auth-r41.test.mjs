import test from 'node:test';
import assert from 'node:assert/strict';
import {isReadingTocToolSender} from '../../src/reading-toc/page.js';

const api={runtime:{id:'trusted-extension-id',
  getURL:path=>'chrome-extension://trusted-extension-id/'+path}};
const id='2dc69ba0-27a1-4ec2-9e06-6d8c0ac0c941';
const approved='chrome-extension://trusted-extension-id/ui/tool.html?hostInstanceId='+id;
const sender=url=>({id:api.runtime.id,url});

test('R4.1 TOC accepts the real hostInstanceId Side Panel document URL',()=>{
  assert.equal(isReadingTocToolSender(api,sender(approved)),true);
  assert.equal(isReadingTocToolSender(api,sender(approved.replace(id,id.toUpperCase()))),true);
});

test('R4.1 TOC rejects cross-extension, wrong path and query spoofing',()=>{
  for(const url of [
    'chrome-extension://trusted-extension-id/ui/tool.html',
    'chrome-extension://attacker-extension-id/ui/tool.html?hostInstanceId='+id,
    'chrome-extension://trusted-extension-id/ui/other.html?hostInstanceId='+id,
    'https://trusted-extension-id/ui/tool.html?hostInstanceId='+id,
    approved+'&toolId=reading-toc',
    approved+'#fragment',
    approved.replace(id,'invalid'),
    'chrome-extension://trusted-extension-id/ui/tool.html?hostInstanceId='+id+'&hostInstanceId='+id
  ]){
    assert.equal(isReadingTocToolSender(api,sender(url)),false,url);
  }
  assert.equal(isReadingTocToolSender(api,{id:'other-extension',url:approved}),false);
  assert.equal(isReadingTocToolSender(api,{id:api.runtime.id}),false);
  assert.equal(isReadingTocToolSender(api,null),false);
});
