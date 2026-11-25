import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {watch} from 'chokidar';
import {developmentWatchOptions} from '../../scripts/wxt-development.mjs';

test('development skips published output and historical artifacts while watching source changes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-dev-watch-'));
  let watcher;
  try{
    const artifacts=join(root,'artifacts'),dist=join(root,'dist'),source=join(root,'src','draft.js');
    for(const dir of [join(artifacts,'browser-profile','Default'),join(dist,'development'),join(root,'src'),join(root,'artifacts-source')])
      await mkdir(dir,{recursive:true});
    await writeFile(join(artifacts,'browser-profile','Default','Preferences'),'historical fixture');
    await writeFile(source,'before');
    watcher=watch(root,{...developmentWatchOptions(root),ignoreInitial:true});
    await once(watcher,'ready');
    const watched=Object.keys(watcher.getWatched());
    assert.equal(watched.some(path=>path===artifacts||path.startsWith(artifacts+'/')),false);
    assert.equal(watched.some(path=>path===dist||path.startsWith(dist+'/')),false);
    assert.ok(watched.includes(join(root,'src')));
    assert.ok(watched.includes(join(root,'artifacts-source')));
    const change=once(watcher,'change',{signal:AbortSignal.timeout(3000)});
    await writeFile(source,'after');
    assert.equal((await change)[0],source);
  }finally{
    await watcher?.close();
    await rm(root,{recursive:true,force:true});
  }
});
