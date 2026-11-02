import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {initChatGPTFixedBridgePage} from '../../../src/native-agent/chatgpt-fixed-bridge-page.js';
const protocol='opendesk.chatgpt.bridge.r12.v1';
const url='https://chatgpt.com/c/sidebar-test-12345678';
function fixture(){
 const {document,window}=parseHTML('<html><body></body></html>');let listener;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value??this.querySelector('option')?.value??'';},set(value){this._value=value;}});
 const win={location:{href:url,origin:'https://chatgpt.com'},setInterval(){return 1;},clearInterval(){},addEventListener(){},removeEventListener(){}};win.top=win;
 const sends=[];
 const api={runtime:{id:'extension',getURL:()=> 'chrome-extension://extension/',
  onMessage:{addListener(fn){listener=fn;},removeListener(){}},sendMessage:async message=>{sends.push(message);return {ok:true,data:{}};}}};
 const page=initChatGPTFixedBridgePage({api,doc:document,win,site:{inspect:()=>({ok:false})}});
 const sender={id:'extension',url:'chrome-extension://extension/sidepanel.html?hostInstanceId=real'};
 const receive=(message,from=sender)=>new Promise(resolve=>{
  const response=listener({protocol,sourceUrl:url,...message},from,resolve);
  if(response===false)queueMicrotask(()=>resolve(undefined));
 });
 return {page,receive,sends,sender};
}
test('page projection accepts only fixed trusted Side Panel messages and refuses stale requests or navigation',async()=>{
 const h=fixture();try{
  for(const sender of [{id:'other',url:h.sender.url},{...h.sender,tab:{id:9}},
   {...h.sender,url:'chrome-extension://extension/ui/tool.html?hostInstanceId=fake'},
   {...h.sender,url:h.sender.url+'&previewId=fake'},{...h.sender,url:h.sender.url+'&toolId=webflow'}])
   assert.equal(await h.receive({kind:'sidebar-read'},sender),undefined);
  const view=await h.receive({kind:'sidebar-read'});assert.equal(view.ok,true);assert.equal(view.data.requestId,null);
  assert.equal((await h.receive({kind:'sidebar-read',sourceUrl:url+'/other'})).ok,false);
  const stale=await h.receive({kind:'sidebar-control',requestId:'old-request',action:'run'});
  assert.equal(stale.error.code,'E_BRIDGE_CONTEXT');assert.equal(h.sends.length,0);
  const fields=await h.receive({kind:'sidebar-control',requestId:null,action:'fields',fields:{task:'baidu.search.top3',query:'OpenDesk Browser',target:'',args:'{}'}});
  assert.equal(fields.ok,true);assert.equal(fields.data.fields.query,'OpenDesk Browser');assert.equal(h.sends.length,0);
 }finally{h.page.dispose();}
});
