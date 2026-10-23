import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANAGED_SITE_V3_OBSERVATION_GAP_MS,normalizeManagedSiteV3Policy,
  normalizeManagedSiteV3Usage,evaluateManagedSiteV3
} from '../../src/platform/chrome/managed-site-v3-policy.js';
import {compileFocusPolicy} from '../../examples/sidebar-tools/stay-focus/trusted/compile-site-policy.js';
const basic=({host='example.com',pool='s:example.com',limit=60000,subdomains=true,enabled=true}={})=>
  ({host,subdomains,enabled,pool,conditions:[{type:'counter-limit',limitMs:limit}]});
const plan=(sites=[basic()],whitelist=[])=>({kind:'site-budget.v3',enabled:true,sites,whitelist});
const reason=(policy,usage,host,at=100000)=>evaluateManagedSiteV3(policy,usage,host,at)?.reason??null;

test('v3 is finite, forbids executable/native fields and fixes 45s observation gap',()=>{
  assert.equal(MANAGED_SITE_V3_OBSERVATION_GAP_MS,45000);
  const trusted=normalizeManagedSiteV3Policy(plan());
  assert.equal(trusted.kind,'site-budget.v3');
  for(const invalid of [
    {...plan(),js:'chrome.tabs.update(1)'},
    plan([{...basic(),action:{type:'redirect',extensionPath:'/evil'}}]),
    plan([{...basic(),conditions:[{type:'counter-limit',limitMs:60000,js:'evil'}]}]),
    plan([{...basic(),conditions:[{type:'unknown'}]}]),
    plan([{...basic(),conditions:[{type:'constant-deny'},{type:'counter-limit',limitMs:60000}]}]),
    plan([basic(),basic()]),
    plan([basic({host:'example.com',subdomains:true}),basic({host:'x.example.com',subdomains:false})]),
  ])assert.throws(()=>normalizeManagedSiteV3Policy(invalid),{code:'E_SITE_BUDGET_V3_POLICY'});
  assert.throws(()=>normalizeManagedSiteV3Usage({'g:x':86400001}),{code:'E_SITE_BUDGET_V3_POLICY'});
  assert.deepEqual(normalizeManagedSiteV3Usage({'g:group':1000,'s:example.com':2000}),
    {'g:group':1000,'s:example.com':2000});
});

test('most specific / paused child / whitelist are higher-priority than blocked parent',()=>{
  const input=plan([
    {...basic(),conditions:[{type:'constant-deny'}]},
    {...basic({host:'sub.example.com',pool:'s:sub.example.com',enabled:false})}
  ]);
  const policy=normalizeManagedSiteV3Policy(input);
  assert.equal(reason(policy,{},'sub.example.com'),null);
  assert.equal(reason(policy,{},'another.example.com'),'constant-deny');
  assert.equal(reason(normalizeManagedSiteV3Policy({...input,whitelist:['another.example.com']}),{},'another.example.com'),null);
  assert.equal(reason(policy,{},'notexample.com'),null);
});

test('shared counter with per-site limits; independent counters never borrow usage',()=>{
  const policy=normalizeManagedSiteV3Policy(plan([
    basic({host:'a.example.com',pool:'g:shared',limit:60000}),
    basic({host:'b.example.com',pool:'g:shared',limit:120000}),
    basic({host:'c.example.com',pool:'s:c.example.com',limit:60000})
  ]));
  const usage=normalizeManagedSiteV3Usage({'g:shared':75000,'s:c.example.com':0});
  assert.equal(reason(policy,usage,'a.example.com'),'counter-limit');
  assert.equal(reason(policy,usage,'b.example.com'),null);
  assert.equal(reason(policy,usage,'c.example.com'),null);
  assert.equal(reason(policy,{...usage,'s:c.example.com':60000},'c.example.com'),'counter-limit');
});

test('fixed priority temporary > weekly > permanent > counter, including midnight',()=>{
  const window={type:'weekly-window',days:[1],startMinute:1320,endMinute:120};
  const local=(day,hour,minute=0)=>new Date(2026,9,day,hour,minute).getTime();
  const monday=local(19,23,30);
  const tuesday=local(20,1,30);
  const after=local(20,3);
  const policy=normalizeManagedSiteV3Policy(plan([{
    ...basic(),conditions:[{type:'counter-limit',limitMs:60000},
      {type:'temporary',until:tuesday},{...window}]
  }]));
  assert.equal(reason(policy,{'s:example.com':60000},'example.com',monday),'temporary');
  assert.equal(reason(policy,{'s:example.com':60000},'example.com',tuesday),'weekly-window');
  assert.equal(reason(policy,{'s:example.com':60000},'example.com',after),'counter-limit');
  assert.equal(reason(normalizeManagedSiteV3Policy(plan([{...basic(),conditions:[{type:'constant-deny'}]}])),{},'example.com'),'constant-deny');
});

test('Stay Focus v1 data compiles to code-free generic rules without changing legacy state',()=>{
  const focus={version:1,enabled:true,focusUntil:null,
    sites:[{host:'a.example.com',subdomains:true,enabled:true,group:'shared',mode:'limit',minutes:15},
      {host:'b.example.com',subdomains:true,enabled:true,group:'shared',mode:'limit',minutes:10},
      {host:'c.example.com',subdomains:false,enabled:false,group:'',mode:'always',minutes:1}],
    groups:{shared:5},whitelist:['keep.example.com'],
    schedule:{enabled:true,days:[1,2,3,4,5],startMinute:540,endMinute:1020}};
  const before=structuredClone(focus);
  const compiled=normalizeManagedSiteV3Policy(compileFocusPolicy(focus));
  assert.deepEqual(focus,before,'compiler must never mutate saved data');
  assert.deepEqual(compiled.sites.map(x=>x.pool),['g:shared','g:shared','s:c.example.com']);
  assert.deepEqual(compiled.reminderMinutes,[10,5,1]);
  assert.equal(compiled.sites[0].conditions.at(-1).limitMs,300000);
  assert.equal(compiled.sites[1].conditions.at(-1).limitMs,300000);
  assert.equal(compiled.sites[2].conditions.at(-1).type,'constant-deny');
  assert.equal(reason(compiled,{'g:shared':300000},'a.example.com',new Date(2026,9,18,10).getTime()),'counter-limit');
  assert.equal(reason(compiled,{'g:shared':300000},'c.example.com'),null);
});

test('unrelated production maintenance window consumes the same v3 model',()=>{
  const policy=normalizeManagedSiteV3Policy(plan([
    {host:'ops.example.net',subdomains:true,enabled:true,pool:'s:ops.example.net',
      conditions:[{type:'weekly-window',days:[0],startMinute:60,endMinute:120},
        {type:'counter-limit',limitMs:120000}]}
  ]));
  assert.equal(reason(policy,{},'ops.example.net',new Date(2026,9,18,1,30).getTime()),'weekly-window');
  assert.equal(reason(policy,{},'ops.example.net',new Date(2026,9,18,3,30).getTime()),null);
});
