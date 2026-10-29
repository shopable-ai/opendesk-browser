import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {FIELDS,readEnvironment,comparison,languageCacheMismatch} from '../../../tasks/browser-fingerprint/model.mjs';

function browser() {
  return {navigator:{userAgent:'test UA',platform:'MacIntel',language:'zh-CN',languages:['zh-CN','en'],
    userAgentData:{brands:[{brand:'Chromium',version:'154'}],mobile:false,platform:'macOS'}},
    location:{origin:'http://localhost:43111',pathname:'/browser-fingerprint.html'},Intl,
    innerWidth:1000,innerHeight:800,screen:{width:1728,height:1117},devicePixelRatio:2};
}

test('scalar-first reading exposes language cache inconsistency without repairing or masking it',() => {
  const win=browser(),order=[];
  Object.defineProperty(win.navigator,'language',{get(){order.push('scalar');return 'zh-CN';}});
  Object.defineProperty(win.navigator,'languages',{get(){order.push('array');return ['en-US'];}});
  const snapshot=readEnvironment(win);
  assert.equal(order[0],'scalar');
  assert.deepEqual(snapshot.fields.languages.value,['en-US']);
  assert.equal(languageCacheMismatch(snapshot),true);
});

test('missing or throwing browser APIs never count as a matching baseline',() => {
  const win=browser();
  Object.defineProperty(win.navigator,'userAgentData',{get(){throw Error('blocked');}});
  win.screen=null;
  const current=readEnvironment(win),rows=comparison(current,current);
  assert.equal(rows.find(row=>row.key==='uaCH').status,'unavailable');
  assert.equal(rows.find(row=>row.key==='screen').status,'unavailable');
  assert.equal(rows.find(row=>row.key==='language').status,'same');
});

test('full language array changes and order remain observable with a stable scalar',() => {
  const win=browser(),base=readEnvironment(win);
  win.navigator.languages=['zh-CN','de-DE'];
  let rows=comparison(readEnvironment(win),base);
  assert.equal(rows.find(row=>row.key==='language').status,'same');
  assert.equal(rows.find(row=>row.key==='languages').status,'changed');
  win.navigator.languages=['en','zh-CN'];
  rows=comparison(readEnvironment(win),base);
  assert.equal(rows.find(row=>row.key==='languages').status,'changed');
  assert.deepEqual(base.fields.languages.value,['zh-CN','en']);
});

async function pageHarness() {
  const nodes=new Map(),timers=new Map(),events=new Map();
  let sequence=0;
  const create=() => ({textContent:'',dataset:{},listeners:new Map(),children:[],checked:false,open:false,
    append(...children){this.children.push(...children);},
    addEventListener(type,listener){this.listeners.set(type,listener);},
    focus(){document.activeElement=this;}});
  const document={hidden:false,activeElement:null,createElement:create,
    getElementById(id){if(!nodes.has(id))nodes.set(id,create());return nodes.get(id);},
    addEventListener(type,listener){events.set('document:'+type,listener);}};
  document.getElementById('auto').checked=true;
  const win=browser();
  win.addEventListener=(type,listener)=>events.set('window:'+type,listener);
  const source=await readFile(new URL('../../../tasks/browser-fingerprint/page.mjs',import.meta.url),'utf8');
  runInNewContext(source.replace(/^import[^\n]+\n/,''),{window:win,document,
    navigator:{clipboard:{writeText:async()=>{throw Error('clipboard denied');}}},
    FIELDS,readEnvironment,comparison,languageCacheMismatch,
    setInterval:listener=>{const id=++sequence;timers.set(id,listener);return id;},clearInterval:id=>timers.delete(id)});
  return {win,nodes,document,events,timers,
    async action(id,type){await nodes.get(id).listeners.get(type)();},
    tick(){for(const listener of timers.values())listener();}};
}

test('clipboard fallback remains selectable while automatic readings continue',async()=>{
  const page=await pageHarness();
  await page.action('copy','click');
  const report=page.nodes.get('report-json'),snapshot=report.textContent;
  assert.equal(page.nodes.get('report').open,true);
  assert.equal(page.document.activeElement,report);
  assert.equal(JSON.parse(snapshot).current.fields.language.value,'zh-CN');
  page.win.navigator.language='de-DE';page.win.navigator.languages=['de-DE'];
  page.tick();
  assert.equal(report.textContent,snapshot,'live readings must not replace the copyable snapshot');
  assert.equal(page.nodes.get('fields').children[3].children[1].textContent,'de-DE','table keeps reading independently');
  assert.equal(page.document.activeElement,report);
});

test('paused readings survive cached history return until a user requests a fresh sample',async()=>{
  const page=await pageHarness();
  page.nodes.get('auto').checked=false;await page.action('auto','change');
  const sampling=page.nodes.get('sampling').textContent;
  page.events.get('window:pagehide')();
  assert.equal(page.timers.size,0);
  page.win.navigator.language='de-DE';page.win.navigator.languages=['de-DE'];
  page.events.get('window:pageshow')({persisted:true});page.tick();
  assert.equal(page.timers.size,1,'only one sampling timer after cached return');
  assert.equal(page.nodes.get('sampling').textContent,sampling);
  const languageCell=page.nodes.get('fields').children[3].children[1];
  assert.equal(languageCell.textContent,'zh-CN');
  await page.action('refresh','click');
  assert.equal(languageCell.textContent,'de-DE');
  page.nodes.get('auto').checked=true;await page.action('auto','change');
  page.win.navigator.language='en-US';page.win.navigator.languages=['en-US'];page.tick();
  assert.equal(languageCell.textContent,'en-US');
});
