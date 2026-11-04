// Component evidence only: serialized ISOLATED reader + original durable gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {load} from 'cheerio';
import {inspectChatGPTEditsOnPage,readChatGPTEdit,assertWebFlowReplyCandidate} from '../../../src/native-agent/workspace-chatgpt.js';
import {installChatGPTBridgeTriggerGate,CHATGPT_BRIDGE_LEDGER_KEY} from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {validateWebFlowTaskIntent} from '../../../src/native-agent/chatgpt-task-request.js';

const source={tabId:9,documentId:'webflow-final-document',url:'https://chatgpt.com/c/webflow-final-12345678'};
const panel={id:'extension',documentId:'trusted-panel',url:'chrome-extension://extension/sidepanel.html?hostInstanceId=real'};
const installation={version:'1.1.1',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),
  scriptId:'task:baidu.search.top3:1.1.1',revision:1,installationId:'original-install',generation:1};
const scope={taskId:'baidu.search.top3',args:{query:'OpenDesk Browser',limit:3},targetUrl:'https://www.baidu.com/',installation};
const intent={protocol:'webflow.task.intent.v1',candidateId:'webflow-final-candidate',taskId:scope.taskId,
  targetUrl:scope.targetUrl,args:scope.args};
const readOptions={taskIntent:true,requireComplete:true,protocols:['webflow.task.intent.v1']};

function harness({taskScope=scope,taskIntent=intent}={}){
  const $=load('<main><div data-message-author-role="user">请搜索 OpenDesk Browser</div><div data-message-author-role="assistant" data-talvt-turn-state="complete"><pre><code class="language-opendesk-task"></code></pre></div></main>');
  $('code').text(JSON.stringify(taskIntent));
  // Stable wrappers preserve DOM node identity across serialized script calls.
  const nodes=new WeakMap(),wrap=node=>{
    if(!node)return null;
    if(nodes.has(node))return nodes.get(node);
    const value={get parentElement(){return wrap($(node).parent()[0]);},get textContent(){return $(node).text();},
      getAttribute:key=>$(node).attr(key)??null,matches:selector=>$(node).is(selector),
      closest:selector=>wrap($(node).closest(selector)[0]),querySelector:selector=>wrap($(node).find(selector)[0]),
      querySelectorAll:selector=>$(node).find(selector).toArray().map(wrap)};
    nodes.set(node,value);return value;
  };
  const sandbox=vm.createContext({location:new URL(source.url),
    document:{querySelectorAll:selector=>$(selector).toArray().map(wrap)},
    getComputedStyle:node=>({display:node.getAttribute('data-hidden')==='true'?'none':'block'})});
  let data={},afterWrite=()=>{},afterRead=()=>{},frame={...source,documentLifecycle:'active'},contexts=[
    {contextType:'SIDE_PANEL',documentId:panel.documentId,documentUrl:panel.url,frameId:0,incognito:false}];
  const event=()=>{
    const listeners=[];
    return {addListener:fn=>listeners.push(fn),emit:value=>{for(const fn of listeners)fn(value);}};
  };
  const removedPermission=event(),committed=event();
  const storage={get:async key=>({[key]:structuredClone(data[key])}),set:async value=>{
    Object.assign(data,structuredClone(value));await afterWrite(value);
  }};
  const api={storage:{local:storage},runtime:{id:'extension',
    getURL:path=>'chrome-extension://extension/'+String(path).replace(/^\//,''),
    getContexts:async()=>contexts,onMessage:event()},
    tabs:{get:async()=>({id:source.tabId,url:frame.url,incognito:false}),onRemoved:event()},
    webNavigation:{getFrame:async()=>({...frame}),onCommitted:committed,onHistoryStateUpdated:event()},
    permissions:{contains:async()=>true,onRemoved:removedPermission},
    scripting:{executeScript:async input=>{
      assert.deepEqual(input.target,{tabId:source.tabId,documentIds:[source.documentId]});
      assert.equal(input.world,'ISOLATED');assert.equal(input.func,inspectChatGPTEditsOnPage);
      const result=vm.runInContext('('+input.func.toString()+')('+JSON.stringify(input.args[0])+')',sandbox);
      await afterRead();return [{frameId:0,documentId:source.documentId,result}];
    }}};
  const gate=installChatGPTBridgeTriggerGate({api});
  const read=()=>readChatGPTEdit(api,source,undefined,readOptions);
  const candidate=async()=>{
    const observed=await read();return {candidateId:taskIntent.candidateId,text:observed.blocks[0],
      turnKey:observed.turnKey,answerKey:observed.answerKey};
  };
  const admit=async()=>{
    await gate.approveAuto(taskScope);await gate.setAutoEnabled(true);
    const admitted=await gate.admitAuto({source,...taskScope,candidate:await candidate()});
    await gate.reserve({...admitted,mode:'auto',turnKey:admitted.candidate.turnKey,answerKey:admitted.candidate.answerKey});
    return admitted;
  };
  const request=admitted=>({requestId:admitted.requestId,source:{kind:'saved',scriptId:installation.scriptId,
    revision:installation.revision,contentHash:installation.contentHash},paramsWire:encodeValue(taskScope.args),
    target:{mode:'owned',url:taskScope.targetUrl},expectedTaskGeneration:installation.generation,
    expectedTaskInstallationId:installation.installationId});
  return {$,api,gate,read,candidate,admit,request,get data(){return data;},
    afterWrite:fn=>{afterWrite=fn;},afterRead:fn=>{afterRead=fn;},
    navigate:()=>{frame={...frame,documentId:'another-document'};},closePanel:()=>{contexts=[];},
    revokePermission:()=>removedPermission.emit({origins:['https://chatgpt.com/*']}),
    revokeSource:()=>committed.emit({tabId:source.tabId,frameId:0})};
}

test('answer edited during durable controllerSubmitted save never reaches original submission',async()=>{
  const h=harness(),admitted=await h.admit();let changed=false,starts=0;
  h.afterWrite(value=>{
    if(value[CHATGPT_BRIDGE_LEDGER_KEY]?.[admitted.requestId]?.controllerSubmitted){
      changed=true;h.$('code').text(JSON.stringify({...intent,args:{query:'changed after approval',limit:3}}));
    }
  });
  await assert.rejects(h.gate.withControllerAdmission(h.request(admitted),panel,async()=>{starts++;}),
    {code:'E_BRIDGE_CONTEXT'});
  assert.equal(changed,true);assert.equal(starts,0);
  assert.equal(h.data[CHATGPT_BRIDGE_LEDGER_KEY][admitted.requestId].controllerSubmitted,true);
});

test('unchanged complete candidate submits once through the original guard and cannot replay',async()=>{
  const h=harness(),admitted=await h.admit();let starts=0;
  const submit=async()=>{starts++;return {runId:'original-authority-run'};};
  assert.deepEqual(await h.gate.withControllerAdmission(h.request(admitted),panel,submit),{runId:'original-authority-run'});
  await assert.rejects(h.gate.withControllerAdmission(h.request(admitted),panel,submit),{code:'E_BRIDGE_REPLAY'});
  assert.equal(starts,1);
});

test('readable and legally escaped task JSON preserve exact values through the reply reader',async t=>{
  const values=[
    ['unicode','中文搜索 👩‍💻 😀 e\u0301'],
    ['punctuation','斜杠 / 反引号 ``` 与 "引号"'],
    ['backslashes',String.raw`C:\temp\中文\u002f \n \"`],
    ['controls','第一行\n第二行\t制表符\r回车'],
    ['html','<script>alert("data")</script> &amp; &#47; <a href="https://example.com/">链接</a>'],
    ['url text','https://example.com/中文?a=%2F%252F+plus&b=1#fragment']
  ];
  const formats=[
    ['plain',text=>text],
    ['pretty',text=>JSON.stringify(JSON.parse(text),null,2)],
    ['escaped-slash',text=>text.replaceAll('/',String.raw`\/`)],
    ['unicode-slash',text=>text.replaceAll('/',String.raw`\u002f`)],
    ['unicode-keys',text=>text.replace('"targetUrl"',String.raw`"target\u0055rl"`)
      .replace('"query"',String.raw`"qu\u0065ry"`)]
  ];
  for(const [name,query] of values)for(const [format,serialize] of formats)await t.test(name+'/'+format,async()=>{
    const h=harness(),value={...intent,targetUrl:'https://example.com/中文?a=%2F%252F+plus&b=1',args:{query,limit:3}};
    const text=serialize(JSON.stringify(value));
    // Syntax highlighting uses multiple text nodes. Markup and HTML entities
    // inside the payload are data, never reparsed as HTML or decoded twice.
    h.$('code').empty();
    for(const token of text.match(/.{1,7}|\n/gu))h.$('code').append(h.$('<span></span>').text(token));
    const observed=await h.read();
    assert.equal(observed.blocks[0],text);
    assert.deepEqual(validateWebFlowTaskIntent(observed.blocks[0]),value);
    assert.equal(h.$('code script,code a').length,0);
    const candidate={candidateId:value.candidateId,text,turnKey:observed.turnKey,answerKey:observed.answerKey};
    await assertWebFlowReplyCandidate(h.api,source,candidate);
    assert.equal(Object.keys(h.data).length,0,'reading cannot approve or dispatch a task');
  });
});

test('readable and escaped replies preserve approved argument values through controller admission',async t=>{
  const args={query:String.raw`中文 / "引号" C:\temp\中文\u002f 👩‍💻`,limit:3};
  const taskScope={...scope,args},taskIntent={...intent,args};
  for(const [name,serialize] of [
    ['plain',text=>text],
    ['escaped-slash',text=>text.replaceAll('/',String.raw`\/`)],
    ['unicode-slash',text=>text.replaceAll('/',String.raw`\u002f`)]
  ])await t.test(name,async()=>{
    const h=harness({taskScope,taskIntent});
    h.$('code').text(serialize(JSON.stringify(taskIntent)));
    const admitted=await h.admit(),request=h.request(admitted);
    assert.deepEqual(admitted.args,args);
    assert.deepEqual(h.data[CHATGPT_BRIDGE_LEDGER_KEY][admitted.requestId].scope.args,args);
    let starts=0;
    const submit=async()=>{starts++;return {runId:'fixture-authority-run'};};
    const decodedTwice={...request,paramsWire:encodeValue({...args,query:args.query.replace(String.raw`\u002f`,'/')})};
    await assert.rejects(h.gate.withControllerAdmission(decodedTwice,panel,submit),{code:'E_BRIDGE_CONTEXT'});
    assert.equal(starts,0,'changed literal escape text cannot spend the existing approval');
    assert.notEqual(h.data[CHATGPT_BRIDGE_LEDGER_KEY][admitted.requestId].controllerSubmitted,true);
    assert.deepEqual(await h.gate.withControllerAdmission(request,panel,submit),{runId:'fixture-authority-run'});
    await assert.rejects(h.gate.withControllerAdmission(request,panel,submit),{code:'E_BRIDGE_REPLAY'});
    assert.equal(starts,1,'the unchanged original values are admitted once');
  });
});

test('malformed escapes, duplicate decoded keys and double-encoded URLs fail before admission',async t=>{
  const json=JSON.stringify(intent);
  const cases=[
    ['invalid escape',json.replace('OpenDesk Browser',String.raw`OpenDesk\q`),'E_CHAT_FORMAT'],
    ['duplicate target',json.replace('"targetUrl":',String.raw`"target\u0055rl":"https://other.example/","targetUrl":`),'E_BRIDGE_FORMAT'],
    ['duplicate argument',json.replace('"query":',String.raw`"qu\u0065ry":"changed","query":`),'E_BRIDGE_FORMAT'],
    ['double-encoded URL',JSON.stringify({...intent,targetUrl:String.raw`https:\u002f\u002fwww.baidu.com\u002f`}), 'E_BRIDGE_SCHEMA'],
    ['Markdown URL',JSON.stringify({...intent,targetUrl:'[百度](https://www.baidu.com/)'}),'E_BRIDGE_SCHEMA'],
    ['HTML URL',JSON.stringify({...intent,targetUrl:'https:&#47;&#47;www.baidu.com&#47;'}),'E_BRIDGE_SCHEMA'],
    ['oversized JSON',JSON.stringify({...intent,args:{query:'中'.repeat(4096),limit:3}}),'E_BRIDGE_LIMIT']
  ];
  for(const [name,text,code] of cases)await t.test(name,async()=>{
    const h=harness();h.$('code').text(text);
    await assert.rejects(h.read(),{code});
    assert.equal(Object.keys(h.data).length,0,'invalid text cannot create a grant or dispatch');
  });
});

test('regenerated, streaming and conflicting answers during the saved fence cannot submit',async()=>{
  for(const [change,code] of [['regenerated','E_BRIDGE_CONTEXT'],['streaming','E_CHAT_STREAMING'],['conflict','E_EDIT_AMBIGUOUS']]){
    const h=harness(),admitted=await h.admit();let starts=0,changed=false;
    h.afterWrite(value=>{
      if(changed||!value[CHATGPT_BRIDGE_LEDGER_KEY]?.[admitted.requestId]?.controllerSubmitted)return;
      changed=true;
      if(change==='regenerated')h.$('[data-message-author-role="assistant"]').replaceWith(h.$('[data-message-author-role="assistant"]').clone());
      if(change==='streaming')h.$('[data-message-author-role="assistant"]').attr('data-is-streaming','true');
      if(change==='conflict')h.$('main').append(h.$('[data-message-author-role="assistant"]').clone());
    });
    await assert.rejects(h.gate.withControllerAdmission(h.request(admitted),panel,async()=>{starts++;}),{code});
    assert.equal(changed,true);assert.equal(starts,0);
  }
});

test('revocation inside the final authoritative reply read prevents the original submit',async t=>{
  for(const [change,code] of [['permission','E_WEBFLOW_AUTO_DENIED'],['source','E_BRIDGE_REVOKED'],
    ['request','E_BRIDGE_REVOKED'],['grant','E_WEBFLOW_AUTO_DENIED'],['off','E_WEBFLOW_AUTO_DENIED']])await t.test(change,async()=>{
    const h=harness(),admitted=await h.admit();let saved=false,fired=false,starts=0;
    h.afterWrite(value=>{if(value[CHATGPT_BRIDGE_LEDGER_KEY]?.[admitted.requestId]?.controllerSubmitted)saved=true;});
    h.afterRead(()=>{
      if(!saved||fired)return;fired=true;
      // Denial becomes synchronous, while its durable write queues behind the
      // active admission. Awaiting that write here would deadlock the fixture.
      if(change==='permission')h.revokePermission();
      if(change==='source')h.revokeSource();
      if(change==='request')void h.gate.revokeRequest({source,requestId:admitted.requestId}).catch(()=>{});
      if(change==='grant')void h.gate.revokeAuto(scope.taskId).catch(()=>{});
      if(change==='off')void h.gate.setAutoEnabled(false).catch(()=>{});
    });
    try{
      await assert.rejects(h.gate.withControllerAdmission(h.request(admitted),panel,async()=>{starts++;}),
        {code});
      assert.equal(fired,true);assert.equal(starts,0);
    }finally{await h.gate.readAutoSettings();}
  });
});

test('final reply verifier accepts exactly the saved complete candidate',async()=>{
  const h=harness(),candidate=await h.candidate();
  await assertWebFlowReplyCandidate(h.api,source,candidate);
  assert.deepEqual(await h.candidate(),candidate);
});

test('serialized answer identity changes for edits and same-text replacement in one document',async()=>{
  for(const change of ['text','prose','node','turn']){
    const h=harness(),candidate=await h.candidate();
    if(change==='text')h.$('code').text(JSON.stringify({...intent,args:{query:'different query',limit:3}}));
    if(change==='prose')h.$('[data-message-author-role="assistant"]').append('<p>Extra explanation</p>');
    if(change==='node')h.$('[data-message-author-role="assistant"]').replaceWith(h.$('[data-message-author-role="assistant"]').clone());
    if(change==='turn')h.$('[data-message-author-role="user"]').text('用户修改了问题');
    const current=await h.read();
    assert.notEqual(change==='turn'?current.turnKey:current.answerKey,change==='turn'?candidate.turnKey:candidate.answerKey,change);
    await assert.rejects(assertWebFlowReplyCandidate(h.api,source,candidate),{code:'E_BRIDGE_CONTEXT'});
  }
});

test('final reply verifier compares exact text even when a candidate ID is unchanged',async()=>{
  const h=harness(),candidate=await h.candidate();
  // Same JSON value and same observed answer, but not the saved candidate bytes.
  await assert.rejects(assertWebFlowReplyCandidate(h.api,source,{...candidate,text:JSON.stringify(intent,null,2)}),
    {code:'E_BRIDGE_CONTEXT'});
});

test('final reply verifier rejects streaming, incomplete and ambiguous latest answers',async()=>{
  for(const [change,code] of [['streaming','E_CHAT_STREAMING'],['incomplete','E_CHAT_INCOMPLETE'],
    ['answer','E_EDIT_AMBIGUOUS'],['block','E_EDIT_AMBIGUOUS'],['pending','E_CHAT_PENDING']]){
    const h=harness(),candidate=await h.candidate();
    if(change==='streaming')h.$('[data-message-author-role="assistant"]').attr('data-is-streaming','true');
    if(change==='incomplete')h.$('[data-message-author-role="assistant"]').removeAttr('data-talvt-turn-state');
    if(change==='answer')h.$('main').append(h.$('[data-message-author-role="assistant"]').clone());
    if(change==='block')h.$('[data-message-author-role="assistant"]').append(h.$('pre').clone());
    if(change==='pending')h.$('main').append('<div data-message-author-role="user">新问题尚未回答</div>');
    await assert.rejects(assertWebFlowReplyCandidate(h.api,source,candidate),{code});
  }
});

test('final reply verifier requires the explicit marker and strict Web Flow protocol',async()=>{
  for(const [change,code] of [['marker','E_CHAT_REQUEST_MARKER'],['protocol','E_CHAT_FORMAT'],
    ['fields','E_CHAT_FORMAT'],['duplicate','E_BRIDGE_FORMAT'],['quoted','E_CHAT_FORMAT']]){
    const h=harness(),candidate=await h.candidate();
    if(change==='marker')h.$('code').attr('class','language-json');
    if(change==='protocol')h.$('code').text(JSON.stringify({...intent,protocol:'opendesk.task.intent.v1'}));
    if(change==='fields')h.$('code').text(JSON.stringify({...intent,requestId:'not-an-intent-field'}));
    if(change==='duplicate')h.$('code').text(candidate.text.replace('"limit":3','"limit":2,"limit":3'));
    if(change==='quoted')h.$('pre').wrap('<blockquote></blockquote>');
    await assert.rejects(assertWebFlowReplyCandidate(h.api,source,candidate),{code});
  }
});

test('final reply verifier refuses missing identity, wrong candidate ID and legacy saved candidates',async()=>{
  const h=harness(),candidate=await h.candidate();
  for(const value of [null,{...candidate,answerKey:''},{...candidate,turnKey:''},
    {...candidate,candidateId:'different-candidate'},{...candidate,unexpected:true}])
    await assert.rejects(assertWebFlowReplyCandidate(h.api,source,value),{code:'E_BRIDGE_CONTEXT'});
  await assert.rejects(assertWebFlowReplyCandidate(h.api,source,{...candidate,
    text:JSON.stringify({...intent,protocol:'opendesk.task.intent.v1'})}),{code:'E_BRIDGE_SCHEMA'});
});

test('final reply verifier retains independent target checks after the serialized read',async()=>{
  const h=harness(),candidate=await h.candidate();h.afterRead(h.navigate);
  await assert.rejects(assertWebFlowReplyCandidate(h.api,source,candidate),{code:'E_CHAT_TARGET'});
});
