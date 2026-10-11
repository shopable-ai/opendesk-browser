import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBuiltinPageSource,loadBuiltinWorkerSource} from '../../src/libs/loader.js';

const runtime={id:'fixture',getURL:path=>'chrome-extension://fixture/'+path};
const fail=error=>error?.code==='E_BUILTIN_RESOURCE';

test('R15.5 builtin resource read failures are stable and fail closed in both worlds',async()=>{
  const variants=[
    {runtime:{getURL:()=>{throw new Error('runtime unavailable');}},fetchImpl:async()=>{throw Error('must not fetch');}},
    {runtime,fetchImpl:async()=>{throw Error('offline');}},
    {runtime,fetchImpl:async url=>({ok:false,url})},
    {runtime,fetchImpl:async url=>({ok:true,url,redirected:true})},
    {runtime,fetchImpl:async url=>({ok:true,url:'chrome-extension://foreign/libs/manifest.json',text:async()=>''})},
    {runtime,fetchImpl:async url=>({ok:true,url,text:async()=>{throw Error('truncated');}})},
    {runtime,fetchImpl:async url=>({ok:true,url,text:async()=>null})}
  ];
  for(const loader of [loadBuiltinPageSource,loadBuiltinWorkerSource])
    for(const variant of variants)
      await assert.rejects(loader(variant),fail);
});
