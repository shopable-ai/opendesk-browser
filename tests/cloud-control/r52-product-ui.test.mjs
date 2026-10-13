// R5.2 real Side Panel source and presenter checks; NOT Chrome screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCloudHosting} from '../../src/ui/cloud-hosting.js';

test('Cloud keeps task consent primary and endpoint settings secondary',async()=>{
  const [html,css,js]=await Promise.all(['src/ui/tool.html','src/ui/tool-shell.css',
    'src/ui/cloud-hosting.js'].map(x=>readFile(x,'utf8')));
  const panel=html.slice(html.indexOf('id="workbench-cloud"'),
    html.indexOf('id="workbench-local-discover"'));
  const ids=['cloud-overview-state','cloud-first-run','cloud-approval-section',
    'cloud-request-samples','cloud-hosting'].map(x=>panel.indexOf('id="'+x+'"'));
  assert(ids.every((x,i)=>x>=0&&(i===0||x>ids[i-1])));
  assert.match(panel,/网页数据和结果正文默认不回传/);
  for(const id of ['cloud-approval-summary','cloud-overview-state','cloud-status'])
    assert.match(panel,new RegExp('id="'+id+'"[^>]*role="status"'));
  assert.match(panel,/id="cloud-configure"/);
  assert.match(panel,/id="cloud-stop"/);
  assert.match(panel,/id="cloud-unpair"/);
  assert.equal((panel.match(/id="cloud-hosting"/g)||[]).length,1);
  assert.match(css,/#workbench-cloud \.cloud-task-choice details/);
  assert.match(css,/@media\(max-width:340px\)\{#workbench-cloud \.cloud-action-row>button\{flex-basis:100%\}/);
  assert.match(js,/technicalLabel\.textContent='高级：固定版本与安装身份'/);
});

function surface(){
  const nodes=new Map(),make=()=>({textContent:'',value:'',checked:false,hidden:false,
    disabled:false,open:false,dataset:{},children:[],events:new Map(),
    addEventListener(t,fn){this.events.set(t,fn);},
    removeEventListener(t){this.events.delete(t);},
    replaceChildren(){this.children=[];},
    append(...c){this.children.push(...c);}
  });
  const get=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
  return {get,document:{documentElement:{dataset:{opendeskTab:'cloud'}},
    getElementById:get,createElement:make}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('unpaired cloud shows inline connection CTA, never claims a new Run',async()=>{
  const f=surface();let claims=0;
  const client={cloud:{cloudStatus:async()=>({provider:null,enabled:false,
    online:false,reconciled:false,connection:'offline',tasks:[],
    hostReady:true,slotAvailable:true,requestTotal:0,requests:[]}),
  cloudNext:async()=>{claims++;return null;}},request:async()=>({catalog:[],installed:[]})};
  const view=createCloudHosting({client,host:{executionPending:false},
    document:f.document,api:{}});
  try{
    for(let i=0;i<6;i++)await flush();
    assert.equal(f.get('cloud-first-run').hidden,false);
    assert.equal(f.get('cloud-approval-section').hidden,true);
    assert.equal(f.get('cloud-unpair').disabled,true);
    assert.equal(claims,0);
    f.get('cloud-configure').events.get('click')();
    for(let i=0;i<3;i++)await flush();
    assert.equal(f.get('cloud-hosting').open,true);
  }finally{view.dispose();}
});
test('paired but not enabled exposes Task selection and blocks execution',async()=>{
  const f=surface();
  const client={cloud:{cloudStatus:async()=>({provider:{providerId:'p'},
    enabled:false,online:false,reconciled:false,connection:'offline',tasks:[],
    hostReady:true,slotAvailable:true,requestTotal:0,requests:[]}),
    cloudNext:async()=>{throw Error('Stopped hosting must not claim');}},
  request:async()=>({catalog:[],installed:[]})};
  const view=createCloudHosting({client,host:{executionPending:false},
    document:f.document,api:{}});
  try{
    for(let i=0;i<6;i++)await flush();
    assert.equal(f.get('cloud-first-run').hidden,true);
    assert.equal(f.get('cloud-approval-section').hidden,false);
    assert.equal(f.get('cloud-stop').disabled,true);
    assert.equal(f.get('cloud-unpair').disabled,false);
    assert.equal(f.get('cloud-approve').disabled,true);
    assert.match(f.get('cloud-overview-state').textContent,/未启用任务授权/);
  }finally{view.dispose();}
});

test('local Stop does not claim Provider confirmation while remote suspend is pending',async()=>{
  const f=surface();
  const client={cloud:{cloudStatus:async()=>({provider:{providerId:'p'},
    enabled:false,remoteSuspension:'pending',online:false,reconciled:false,
    connection:'offline',tasks:[],hostReady:true,slotAvailable:true,
    requestTotal:0,requests:[]}),
    cloudNext:async()=>{throw Error('Stopped hosting cannot claim');}},
    request:async()=>({catalog:[],installed:[]})};
  const view=createCloudHosting({client,host:{executionPending:false},
    document:f.document,api:{}});
  try{
    for(let i=0;i<6;i++)await flush();
    assert.match(f.get('cloud-overview-state').textContent,/提供者尚未确认暂停/);
    assert.match(f.get('cloud-brief').textContent,/远端待确认/);
    assert.equal(f.get('cloud-stop').disabled,true);
  }finally{view.dispose();}
});

test('trusted Cloud requests show readable Task names without exposing raw request IDs, URLs or result data',async()=>{
  const f=surface();
  const client={cloud:{cloudStatus:async()=>({provider:{providerId:'p'},
    enabled:false,connection:'offline',online:false,reconciled:false,
    tasks:[],hostReady:true,slotAvailable:true,requestTotal:2,
    requests:[
      {taskTitle:'表单填写',requestId:'SECRET-RUN-1',state:'finished',
        runState:'completed',retirementState:'released',receipt:true,
        params:{name:'PRIVATE_NAME'}},
      {taskTitle:'关键词搜索',requestId:'SECRET-RUN-2',state:'OUTCOME_UNKNOWN',
        runState:'paused_unknown',retirementState:null,receipt:null,
        target:{url:'https://PRIVATE_SEARCH_URL'}}
    ]}),cloudNext:async()=>{throw Error('Stopped hosting cannot claim');}},
    request:async()=>({catalog:[],installed:[]})};
  const view=createCloudHosting({client,host:{executionPending:false},document:f.document,api:{}});
  try{
    for(let i=0;i<8;i++)await flush();
    const rows=f.get('cloud-request-samples').children;
    assert.equal(rows.length,2);
    assert.match(rows[0].children[0].textContent,/关键词搜索.*结果待核对/);
    assert.match(rows[1].children[0].textContent,/表单填写.*已完成/);
    const rendered=rows.map(row=>row.children.map(n=>n.textContent).join(' ')).join(' ');
    for(const secret of ['SECRET-RUN','PRIVATE_NAME','PRIVATE_SEARCH_URL'])
      assert.equal(rendered.includes(secret),false,secret);
  }finally{view.dispose();}
});

test('no installed Task CTA opens the real My tab rather than a nonexistent tab ID',async()=>{
  const f=surface();let navigations=0;
  f.get('tab-my-tasks').click=()=>{navigations++;};
  const client={cloud:{cloudStatus:async()=>({provider:{providerId:'test-provider'},
    enabled:false,connection:'offline',online:false,reconciled:false,
    tasks:[],hostReady:true,slotAvailable:true,requestTotal:0,requests:[]}),
    cloudNext:async()=>{throw Error('No approved Task should be claimed');}},
    request:async()=>({catalog:[],installed:[]})};
  const view=createCloudHosting({client,host:{executionPending:false},
    document:f.document,api:{}});
  try{
    for(let i=0;i<8;i++)await flush();
    const items=f.get('cloud-task-list').children;
    assert.equal(items.length,2,'One explanatory empty state and one real action');
    assert.match(items[0].textContent,/暂无已安装任务/);
    assert.match(items[1].textContent,/前往「我的」安装任务/);
    items[1].events.get('click')();
    assert.equal(navigations,1);
  }finally{view.dispose();}
});

test('approval validation is actionable while untrusted remote error details remain redacted',async()=>{
  const f=surface();
  const client={cloud:{cloudStatus:async()=>({provider:{providerId:'paired'},
    enabled:false,online:false,reconciled:false,connection:'offline',
    hostReady:true,slotAvailable:true,tasks:[],requestTotal:0,requests:[]}),
    cloudNext:async()=>null,
    cloudPair:async()=>{throw Object.assign(Error('PRIVATE_PAGE_URL_OR_TOKEN'),
      {code:'E_PROVIDER'});}},
    request:async()=>({catalog:[],installed:[]})};
  const view=createCloudHosting({client,host:{executionPending:false},
    document:f.document,api:{}});
  try{
    for(let i=0;i<8;i++)await flush();
    f.get('cloud-approve').events.get('click')();
    for(let i=0;i<5;i++)await flush();
    assert.match(f.get('cloud-status').textContent,/请先核对所选任务的固定版本/);
    f.get('cloud-pair').events.get('click')();
    for(let i=0;i<5;i++)await flush();
    assert.match(f.get('cloud-status').textContent,/提供者连接异常/);
    assert.doesNotMatch(f.get('cloud-status').textContent,/PRIVATE_PAGE_URL_OR_TOKEN/);
  }finally{view.dispose();}
});
