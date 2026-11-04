import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {inspectChatGPTImagesOnPage} from '../trusted/chatgpt-image-page.js';
import {fillChatGPTComposer} from '../../../src/native-agent/workspace-chatgpt.js';
import {createChatGPTImageController,IMAGE_PAGE,IMAGE_PROTOCOL,validateImagePath,parseImageRequest} from '../trusted/chatgpt-images.js';

const source={tabId:7,windowId:2,documentId:'chat-document',url:'https://chatgpt.com/c/image-test'};
const workspaceId='workspace-11111111-1111-1111-1111-111111111111';
const asset={messageId:'message-image-1',assetId:'file_image_1',width:1024,height:1024,bytes:1234,mime:'image/png',sha256:'a'.repeat(64),
  url:'https://chatgpt.com/backend-api/estuary/content?id=file_image_1&p=fs&sig=secret'};
function harness({data={},downloadError=false,inspectError=null,interrupted=false}={}){
  const effects={downloads:0,fills:0,inspects:0};
  const sender={id:'extension',url:'chrome-extension://extension/'+IMAGE_PAGE,frameId:0,documentId:'review-document',tab:{id:9,windowId:2}};
  const api={runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path},
    tabs:{get:async id=>({id,windowId:2,url:source.url}),query:async()=>[{id:7,windowId:2,url:source.url,title:'Image test'}]},
    webNavigation:{getFrame:async()=>({url:source.url,documentId:source.documentId,documentLifecycle:'active'})},
    storage:{local:{get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))}},
    downloads:{download:async input=>{effects.downloads++;assert.equal(input.conflictAction,'uniquify');assert.equal(input.saveAs,true);if(downloadError)throw Error('lost ACK');return 42;},
      search:async()=>[{id:42,state:interrupted?'interrupted':'complete',exists:true,filename:'/approved/cat.png',bytesReceived:1234,totalBytes:1234,fileSize:1234,mime:'image/png',finalUrl:asset.url}]}};
  const receipt={workspaceId,path:'cat.png',absolutePath:'/approved/cat.png',format:'png',width:1024,height:1024,bytes:1234,sha256:'a'.repeat(64)};
  const files={state:async()=>({connected:true,sessionId:'native-session',devLeaseEpoch:1}),request:async(method)=>{
    if(method==='files.status')return {methods:['files.inspectImage']};
    if(method==='workspaces.list')return {workspaces:[{workspaceId,name:'approved',access:'read-write',leaseEpoch:''}]};
    if(method==='files.inspectImage'){if(!effects.downloads)throw {code:'E_FILES_NOT_FOUND'};effects.inspects++;if(inspectError)throw inspectError;return receipt;}
    throw Error('unexpected file mutation');}};
  let request;
  const deps={api,files,scan:async()=>[asset],readAnswer:async()=>({blocks:[JSON.stringify(request)],turnKey:'turn-2',answerComplete:true}),
    fillComposer:async(_api,_source,text)=>{effects.fills++;assert.ok(!text.includes('sig=secret'));return {filled:true,sent:false};}};
  const controller=createChatGPTImageController(deps);
  const call=(action,extra={})=>controller.handle({protocol:IMAGE_PROTOCOL,action,...extra},sender);
  const prepare=async()=>{const bound=await call('bind',{tabId:7});const result=await call('prepare',{bindingId:bound.bindingId,assetKey:bound.assets[0].assetKey,workspaceId,path:'cat.png'});request=result.request;return result;};
  return {api,files,deps,controller,call,prepare,effects,data,sender,receipt,get request(){return request;},set request(value){request=value;}};
}

test('image paths reject traversal, absolute, active content and alternate path spellings',()=>{
  for(const path of ['/tmp/cat.png','../cat.png','a/../cat.png','a\\cat.png','.hidden/cat.png','cat.svg','cat.html','cat.png:html'])
    assert.throws(()=>validateImagePath(path));
  assert.equal(validateImagePath('images/cat.png'),'images/cat.png');
});
test('protocol is exact, duplicate keys and model range changes are rejected',()=>{
  const expected={protocol:'opendesk.image.request.v1',requestId:'request-image-1',bindingId:'binding-image-1',conversationId:'image-test',messageId:'message-image-1',assetId:'file_image_1',workspaceId,path:'cat.png'};
  assert.deepEqual(parseImageRequest(JSON.stringify(expected),expected),expected);
  assert.throws(()=>parseImageRequest(JSON.stringify({...expected,path:'other.png'}),expected));
  assert.throws(()=>parseImageRequest(JSON.stringify(expected).replace('{','{"path":"cat.png",'),expected));
  assert.throws(()=>parseImageRequest(JSON.stringify({...expected,url:asset.url}),expected));
});
test('complete Chrome download plus independent Native decode is required; stable request saves/fills once',async()=>{
  const h=harness(),p=await h.prepare();
  assert.equal(JSON.stringify(p).includes('sig=secret'),false);
  await h.call('save',{requestId:p.request.requestId});
  const done=await h.call('check',{requestId:p.request.requestId});
  assert.equal(done.phase,'verified');assert.equal(done.receipt.sha256,h.receipt.sha256);
  await h.call('save',{requestId:p.request.requestId});
  await h.call('fillResult',{requestId:p.request.requestId});
  await h.call('fillResult',{requestId:p.request.requestId});
  assert.equal(h.effects.downloads,1);assert.equal(h.effects.fills,1);
  assert.equal((await h.call('check',{requestId:p.request.requestId})).delivery,'draft');
});
test('lost download ACK remains unknown across controller recreation and is never blindly replayed',async()=>{
  const h=harness({downloadError:true}),p=await h.prepare();
  await assert.rejects(h.call('save',{requestId:p.request.requestId}));
  const resumed=createChatGPTImageController(h.deps);
  await assert.rejects(resumed.handle({protocol:IMAGE_PROTOCOL,action:'save',requestId:p.request.requestId},h.sender));
  assert.equal(h.effects.downloads,1);
});
test('interrupted download never invokes local image inspection or reports saved',async()=>{
  const h=harness({interrupted:true}),p=await h.prepare();await h.call('save',{requestId:p.request.requestId});
  await assert.rejects(h.call('check',{requestId:p.request.requestId}));assert.equal(h.effects.inspects,0);
});
test('Native file mismatch or HTML masquerading as PNG does not produce success',async()=>{
  const h=harness(),p=await h.prepare();h.receipt.bytes=17;
  await h.call('save',{requestId:p.request.requestId});await assert.rejects(h.call('check',{requestId:p.request.requestId}));
  const bad=harness({inspectError:{code:'E_FILES_IMAGE'}}),q=await bad.prepare();
  await bad.call('save',{requestId:q.request.requestId});await assert.rejects(bad.call('check',{requestId:q.request.requestId}));
  assert.equal(bad.effects.fills,0);
});
test('same-size local image with different bytes cannot pass the pinned source SHA',async()=>{
  const h=harness(),p=await h.prepare();h.receipt.sha256='b'.repeat(64);
  await h.call('save',{requestId:p.request.requestId});
  await assert.rejects(h.call('check',{requestId:p.request.requestId}),error=>error.code==='E_IMAGE_READBACK');
  assert.equal(h.effects.fills,0);
});
test('selected source bytes must remain identical from preparation to download',async()=>{
  const h=harness(),p=await h.prepare();
  h.deps.scan=async()=>[{...asset,sha256:'b'.repeat(64)}];
  const changed=createChatGPTImageController(h.deps);
  await assert.rejects(changed.handle({protocol:IMAGE_PROTOCOL,action:'save',requestId:p.request.requestId},h.sender),error=>error.code==='E_IMAGE_ASSET');
  assert.equal(h.effects.downloads,0);
});
test('foreign sender, retired source, revoked directory and expired capability fail before download',async()=>{
  const h=harness(),p=await h.prepare();
  await assert.rejects(h.controller.handle({protocol:IMAGE_PROTOCOL,action:'save',requestId:p.request.requestId},{...h.sender,url:'https://chatgpt.com/'}));
  h.api.webNavigation.getFrame=async()=>({documentId:'other-document',url:source.url,documentLifecycle:'active'});
  await assert.rejects(h.call('save',{requestId:p.request.requestId}));assert.equal(h.effects.downloads,0);
  const revoked=harness(),q=await revoked.prepare(),original=revoked.files.request;
  revoked.files.request=async(method,...rest)=>method==='workspaces.list'?{workspaces:[]}:original(method,...rest);
  await assert.rejects(revoked.call('save',{requestId:q.request.requestId}));assert.equal(revoked.effects.downloads,0);
});
test('old Native without image inspector refuses before any Chrome save',async()=>{
  const h=harness(),original=h.files.request;h.files.request=async(method,...args)=>method==='files.status'?{methods:['files.read']}:original(method,...args);
  await assert.rejects(h.prepare(),error=>error.code==='E_NATIVE_UPDATE_REQUIRED');assert.equal(h.effects.downloads,0);
});
test('an existing file and changed SHA never enter an overwrite path',async()=>{
  const h=harness(),p=await h.prepare(),original=h.files.request;
  h.files.request=async(method,...args)=>method==='files.inspectImage'?h.receipt:original(method,...args);
  await assert.rejects(h.call('save',{requestId:p.request.requestId}),error=>error.code==='E_FILES_EXISTS');
  assert.equal(h.effects.downloads,0);
  h.request={...h.request,expectedSha256:'b'.repeat(64)};
  await assert.rejects(h.call('save',{requestId:p.request.requestId}),error=>error.code==='E_IMAGE_CONTEXT');
  assert.equal(h.effects.downloads,0);
});
test('unknown save fences a new request ID for the same authorized target',async()=>{
  const h=harness({downloadError:true}),p=await h.prepare();await assert.rejects(h.call('save',{requestId:p.request.requestId}));
  await assert.rejects(h.prepare(),error=>error.code==='E_IMAGE_PATH_BUSY');assert.equal(h.effects.downloads,1);
});
test('two preprepared requests cannot bypass an unknown target reservation',async()=>{
  const h=harness({downloadError:true}),a=await h.prepare(),b=await h.prepare(),original=h.files.request;
  h.files.request=async(method,...args)=>{if(method==='files.inspectImage')throw {code:'E_FILES_NOT_FOUND'};return original(method,...args);};
  h.request=a.request;await assert.rejects(h.call('save',{requestId:a.request.requestId}));
  h.request=b.request;await assert.rejects(h.call('save',{requestId:b.request.requestId}));assert.equal(h.effects.downloads,1);
});
for(const boundary of ['answer','persist'])test('revocation during '+boundary+' wait prevents any result insertion',async()=>{
  const h=harness(),p=await h.prepare();await h.call('save',{requestId:p.request.requestId});await h.call('check',{requestId:p.request.requestId});
  const original=h.files.request;let revoked=false;
  h.files.request=async(method,...args)=>method==='workspaces.list'&&revoked?{workspaces:[]}:original(method,...args);
  if(boundary==='answer')h.deps.readAnswer=async()=>{revoked=true;return {turnKey:'turn-2'};};
  else {const set=h.api.storage.local.set;h.api.storage.local.set=async value=>{await set(value);if(Object.values(Object.values(value)[0]).some(row=>row.delivery==='unknown'))revoked=true;};}
  const controller=createChatGPTImageController(h.deps);
  await assert.rejects(controller.handle({protocol:IMAGE_PROTOCOL,action:'fillResult',requestId:p.request.requestId},h.sender));
  assert.equal(h.effects.fills,0);
});
test('shared composer grant hook runs after document lookup and can prevent the actual ISOLATED insertion',async()=>{
  let dispatched=0,lookedUp=false;
  const api={webNavigation:{getFrame:async()=>{lookedUp=true;return {documentId:source.documentId,url:source.url};}},
    scripting:{executeScript:async()=>{dispatched++;throw Error('must not dispatch');}}};
  await assert.rejects(fillChatGPTComposer(api,source,'receipt',{operationId:'receipt-1',turnKey:'turn-2',beforeInsert:async()=>{
    assert.equal(lookedUp,true);throw {code:'E_FILES_ACCESS'};
  }}),error=>error.code==='E_FILES_ACCESS');assert.equal(dispatched,0);
});
for(const action of ['fillPrompt','fillResult'])test(action+' retries the same operation only after confirmed non-dispatch, retaining unknown fences',async()=>{
  for(const outcome of ['NOT_DISPATCHED','OUTCOME_UNKNOWN']){
    const h=harness(),p=await h.prepare();
    if(action==='fillResult'){await h.call('save',{requestId:p.request.requestId});await h.call('check',{requestId:p.request.requestId});}
    const ids=[];let conflict=true;
    h.deps.fillComposer=async(_api,_source,_text,options)=>{ids.push(options.operationId);
      if(conflict)throw {code:'E_CHAT_DRAFT',outcome};h.effects.fills++;};
    const controller=createChatGPTImageController(h.deps),call=()=>controller.handle({protocol:IMAGE_PROTOCOL,action,requestId:p.request.requestId},h.sender);
    await assert.rejects(call());conflict=false;
    if(outcome==='NOT_DISPATCHED'){await call();assert.equal(h.effects.fills,1);assert.equal(ids[0],ids[1]);}
    else {await call().catch(()=>{});assert.equal(h.effects.fills,0);assert.equal(ids.length,1);}
  }
});
test('review document reload can only recover and query the original download; no second save or result fill',async()=>{
  const h=harness(),p=await h.prepare();await h.call('save',{requestId:p.request.requestId});
  const sender={...h.sender,documentId:'reloaded-review'},controller=createChatGPTImageController(h.deps);
  const call=action=>controller.handle({protocol:IMAGE_PROTOCOL,action,requestId:p.request.requestId},sender);
  await call('recover');assert.equal((await call('check')).phase,'verified');
  await assert.rejects(call('save'),error=>error.code==='E_IMAGE_UNKNOWN');
  await call('fillResult');await call('fillResult');assert.equal(h.effects.downloads,1);assert.equal(h.effects.fills,1);
});
test('expired started request can recover and inspect the original download without allowing new side effects',async()=>{
  const h=harness(),p=await h.prepare();await h.call('save',{requestId:p.request.requestId});
  const sender={...h.sender,documentId:'later-review'},controller=createChatGPTImageController({...h.deps,clock:()=>Date.now()+31*60*1000});
  const call=action=>controller.handle({protocol:IMAGE_PROTOCOL,action,requestId:p.request.requestId},sender);
  await call('recover');assert.equal((await call('check')).phase,'verified');
  await assert.rejects(call('save'),error=>error.code==='E_IMAGE_EXPIRED');
  await assert.rejects(call('fillResult'),error=>error.code==='E_IMAGE_EXPIRED');
  assert.equal(h.effects.downloads,1);assert.equal(h.effects.fills,0);
});
function observeImages({streaming=false,messages=[],selection,fetch:fetchImage,onImage=()=>{}}={}){
  const nodes=messages.map(({messageId='image-message',url=asset.url,complete=true,generated=true,finished=true,hidden=false,modern=false,roles=['assistant'],quoted=false}={})=>{
    const turn={getAttribute:()=>finished?'complete':'streaming'};
    let node;
    const img={complete,naturalWidth:1024,naturalHeight:1024,src:url,currentSrc:url,parentElement:null,
      closest:selector=>selector.includes('data-message-author-role')?node:quoted&&selector.includes('blockquote')?{}:
        generated&&['[data-testid="generated-image-preview"]','[data-testid="generated-image-gallery"]'].includes(selector)?{}:null};
    const headings=roles.map(role=>({getAttribute:()=>role,parentElement:null,closest:()=>null}));
    const parent=modern?{closest:()=>null,getAttribute:()=>null,
      querySelectorAll:selector=>selector==='[data-chatgpt-search-message-ids]'?[node]:headings}:null;
    node={parentElement:parent,closest:selector=>selector==='[data-talvt-turn-state]'?turn:hidden?{}:null,
      getAttribute:name=>modern?(name==='data-chatgpt-search-message-ids'?messageId:null):(name==='data-message-id'?messageId:name==='data-message-author-role'?'assistant':null),
      contains:()=>false,querySelector:()=>generated?{}:null,querySelectorAll:()=>[img]};
    onImage(img);return node;
  });
  return runInNewContext('('+inspectChatGPTImagesOnPage.toString()+')({expectedUrl:location.href,selection})',{
    location:{href:source.url,origin:'https://chatgpt.com'},URL,getComputedStyle:()=>({display:'block',visibility:'visible'}),
    selection,fetch:fetchImage,crypto:webcrypto,AbortController,setTimeout,clearTimeout,Uint8Array,
    document:{querySelectorAll:selector=>selector.startsWith('[data-testid=')?(streaming?[{parentElement:null,closest:()=>null}]:[]):nodes}});
}
test('observer rejects generating placeholders, preview URLs, avatars, hidden or unfinished messages',async()=>{
  for(const fixture of [{complete:false},{url:asset.url.replace('p=fs','p=preview')},{url:'https://chatgpt.com/avatar.png'},
    {hidden:true},{finished:false,generated:false},{messageId:null}])
    assert.equal((await observeImages({messages:[fixture]})).assets.length,0);
  assert.equal((await observeImages({streaming:true,messages:[{}]})).assets.length,0);
});
test('completed assistant attachments and foreign or malformed blobs remain excluded',async()=>{
  assert.equal((await observeImages({messages:[{generated:false,finished:true}]})).assets.length,0);
  for(const url of ['blob:https://other.test/59c37d26-2180-476d-837f-763a84629276','blob:https://chatgpt.com/not-a-uuid'])
    assert.equal((await observeImages({messages:[{url}]})).assets.length,0);
});
test('multiple completed full-size assets remain separate explicit choices with their message identities',async()=>{
  const result=await observeImages({messages:[{messageId:'old-image'},{messageId:'new-image',url:asset.url.replace('file_image_1','file_image_2')}]});
  assert.equal(result.assets.length,2);assert.equal(result.assets[0].messageId,'old-image');
  assert.equal(result.assets[1].messageId,'new-image');assert.equal(result.assets[1].assetId,'file_image_2');
});
test('actual roleless assistant gallery supports one selected same-origin blob and hashes its exact bytes',async()=>{
  const messageId='f82ad299-6ddf-4e25-b3a4-f612b0333d60',uuid='59c37d26-2180-476d-837f-763a84629276';
  const fixture={messageId,modern:true,url:'blob:https://chatgpt.com/'+uuid};
  let fetched=0;
  const fetchImage=async url=>{fetched++;assert.equal(url,fixture.url);return new Response(Uint8Array.of(1,2,3),{headers:{'content-type':'image/png'}});};
  assert.equal((await observeImages({messages:[fixture],fetch:fetchImage})).assets.length,1);assert.equal(fetched,0);
  const result=await observeImages({messages:[fixture],selection:{messageId,assetId:'blob-'+uuid},fetch:fetchImage});
  assert.equal(fetched,1);assert.equal(result.assets[0].bytes,3);assert.equal(result.assets[0].mime,'image/png');
  assert.equal(result.assets[0].sha256,'039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
  for(const change of [{roles:['user']},{roles:['assistant','user']},{messageId:messageId+',other'}])
    assert.equal((await observeImages({messages:[{...fixture,...change}]})).assets.length,0);
});
test('selected byte observation rejects HTML, over-limit streams and incomplete fetches',async()=>{
  const selection={messageId:'image-message',assetId:'file_image_1'};
  for(const fetchImage of [
    async()=>new Response('<html>error</html>',{headers:{'content-type':'text/html'}}),
    async()=>new Response(new Uint8Array(8*1024*1024+1),{headers:{'content-type':'image/png'}}),
    async()=>{throw Error('fetch failed');}
  ])assert.equal((await observeImages({messages:[{}],selection,fetch:fetchImage})).ok,false);
});
test('quoted generated-looking images and source changes during hashing are rejected',async()=>{
  assert.equal((await observeImages({messages:[{quoted:true}]})).assets.length,0);
  let image;
  const result=await observeImages({messages:[{}],selection:{messageId:'image-message',assetId:'file_image_1'},onImage:img=>{image=img;},
    fetch:async()=>{image.currentSrc=asset.url.replace('file_image_1','file_image_2');
      return new Response(Uint8Array.of(1,2,3),{headers:{'content-type':'image/png'}});}});
  assert.equal(result.ok,false);
});
test('image ownership rejects sibling UUIDs, nested role headings and contradictory user parents',async()=>{
  for(const kind of ['valid','sibling','nested heading','user parent','user marker']){
    const {document}=parseHTML('<article data-talvt-turn-state="complete"><section id="parent"><h6 data-conversation-role="assistant"></h6>'+
      '<div id="message" data-chatgpt-search-message-ids="f82ad299-6ddf-4e25-b3a4-f612b0333d60">'+
      '<div data-testid="generated-image-gallery"><button data-testid="generated-image-preview"><img src="'+asset.url+'"></button></div></div></section></article>');
    const message=document.querySelector('#message'),parent=document.querySelector('#parent'),img=document.querySelector('img');
    Object.assign(img,{complete:true,naturalWidth:1024,naturalHeight:1024});
    if(kind==='sibling')parent.append(message.cloneNode(false));
    if(kind==='nested heading')message.prepend(document.querySelector('h6'));
    if(kind==='user parent')parent.setAttribute('data-chatgpt-search-unit-key','fallback-turn-0:0:user');
    if(kind==='user marker')message.setAttribute('data-chatgpt-search-unit-key','fallback-turn-0:0:user');
    const result=await runInNewContext('('+inspectChatGPTImagesOnPage.toString()+')({expectedUrl:location.href})',{
      document,location:new URL(source.url),URL,getComputedStyle:()=>({display:'block',visibility:'visible'})});
    assert.equal(result.assets.length,kind==='valid'?1:0,kind);
  }
});
