// Component-only reproduction of two independent bundle/module evaluations.
// No browser, task, user data or native authorization is used.
import fs from 'node:fs/promises';
const first=await import('../../trusted/chatgpt-bridge-page.js?overlay-probe=first');
const second=await import('../../trusted/chatgpt-bridge-page.js?overlay-probe=second');
const counts={runtimeListeners:0,intervals:0,mounts:0};
const element=tag=>({tag,style:{},classList:{toggle(){}},
  setAttribute(){},append(){},remove(){},
  attachShadow(){return element('shadow');},addEventListener(){}});
const body=element('body');body.append=()=>counts.mounts++;
const doc={body,getElementById:()=>null,createElement:element,
  addEventListener(){},removeEventListener(){}};
const win={location:{href:'https://chatgpt.com/c/overlay-probe',origin:'https://chatgpt.com'},
  setInterval(){return ++counts.intervals;},clearInterval(){},
  addEventListener(){},removeEventListener(){}};win.top=win;
const api={runtime:{id:'probe-extension',getURL:()=> 'chrome-extension://probe-extension/',
  onMessage:{addListener(){counts.runtimeListeners++;},removeListener(){counts.runtimeListeners--;}}}};
const options={doc,win,api,site:{inspect:()=>({ok:false})},readPage:()=>({ok:false})};
const a=first.initChatGPTFixedBridgePage(options);
const afterFirst={...counts};
const b=second.initChatGPTFixedBridgePage(options);
const afterSecond={...counts};
const result={level:'COMPONENT_TESTED',firstInstance:!!a,secondInstance:!!b,afterFirst,afterSecond,
  duplicateInitializationObserved:!!a&&!!b&&afterSecond.runtimeListeners>afterFirst.runtimeListeners,
  tasksStarted:0,messagesSent:0,nativeStatus:'NOT_TESTED',
  limit:'Two independent module evaluations simulate bundle reinjection; this does not prove native task replay.'};
b?.dispose();a?.dispose();
await fs.writeFile(new URL('./duplicate-initialization.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
