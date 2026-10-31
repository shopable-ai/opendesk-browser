import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';

const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
const ticks=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function setup(){
  const {document,Event}=parseHTML('<html><body>'+html+'</body></html>');
  const root=document.querySelector('main'),states=[];
  // linkedom lacks media methods used when the R0.4A player resets on inspection.
  const video=root.querySelector('#vp-owned-video');
  video.pause=()=>{};video.load=()=>{};
  let resolveWrite,rejectWrite,writes=0;
  const request=async name=>{
    if(name==='storage.get')return {value:[],etag:'a'.repeat(64)};
    if(name==='storage.set'){
      writes++;
      return new Promise((resolve,reject)=>{resolveWrite=resolve;rejectWrite=reject;});
    }
    if(name==='videoSVIP.watch')return {watching:false};
    if(name==='videoSVIP.inspect')return {title:null,episode:'unknown',recognitionState:'unsupported'};
    throw Error(name);
  };
  runInNewContext(source,{document,URL,window:{addEventListener(){}},
    OpenDeskTool:{root,request,setState:state=>states.push({...state})}});
  await ticks();
  // linkedom does not implement the browser select.value setter.
  Object.defineProperty(root.querySelector('#vp-member-provider'),'value',{value:'bilibili',writable:true});
  const expiry=root.querySelector('#vp-member-expiry');
  const edit=value=>{expiry.value=value;expiry.dispatchEvent(new Event('input',{bubbles:true}));};
  return {root,states,edit,save:()=>root.querySelector('#vp-member-save').click(),
    resolve:()=>resolveWrite({saved:true,etag:'b'.repeat(64)}),
    reject:()=>rejectWrite(Error('write outcome unknown')),get writes(){return writes;}};
}

test('confirmed membership save clears the close guard only after storage settles',async()=>{
  const h=await setup();h.edit('2030-01-01');
  assert.deepEqual(h.states.at(-1),{dirty:true,busy:false});
  h.save();assert.deepEqual(h.states.at(-1),{dirty:true,busy:true});
  h.resolve();await ticks();
  assert.deepEqual(h.states.at(-1),{dirty:false,busy:false});
  assert.match(h.root.querySelector('#vp-member-list').textContent,/2030-01-01/);
});

test('a failed or unknown save retains the draft guard and cannot replay the write',async()=>{
  const h=await setup();h.edit('2030-01-01');h.save();h.reject();await ticks();
  assert.deepEqual(h.states.at(-1),{dirty:true,busy:false});
  h.save();assert.equal(h.writes,1);
  assert.match(h.root.querySelector('#vp-flash').textContent,/未确认保存成功/);
});

test('a later form edit stays dirty when an earlier save completes',async()=>{
  const h=await setup();h.edit('2030-01-01');h.save();h.edit('2031-02-03');
  h.resolve();await ticks();
  assert.deepEqual(h.states.at(-1),{dirty:true,busy:false});
  assert.equal(h.root.querySelector('#vp-member-expiry').value,'2031-02-03');
  assert.match(h.root.querySelector('#vp-member-list').textContent,/2030-01-01/);
});
