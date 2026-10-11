import fs from 'node:fs';
import path from 'node:path';
import {devError,safeRead} from './snapshot.mjs';

// Shared across Resolver instances in this Provider process; no project-sized queue.
const slots={active:0,queue:[],limit:2,explicitStreak:0};
const queued=new WeakMap();
function enqueue(entry){
  const before=entry.priority?slots.queue.findIndex(item=>!item.priority):-1;
  if(before<0)slots.queue.push(entry);else slots.queue.splice(before,0,entry);
}
export function promotePreparation(pending){
  const entry=queued.get(pending),index=slots.queue.indexOf(entry);
  if(!entry||entry.priority||index<0)return;
  slots.queue.splice(index,1);entry.priority=true;enqueue(entry);
}
export function cancelPreparation(pending,error=devError('E_PROJECT_CHANGED','Preparation cancelled after provider changed')){
  const entry=queued.get(pending),index=slots.queue.indexOf(entry);
  if(!entry||index<0)return;
  slots.queue.splice(index,1);queued.delete(pending);entry.reject(error);
}
function releaseSlot(){
  // Give a waiting background project one turn after four queued admissions.
  let index=slots.explicitStreak>=4?slots.queue.findIndex(entry=>!entry.priority):0;
  if(index<0)index=0;
  const [next]=slots.queue.splice(index,1);
  if(next){slots.explicitStreak=next.priority?slots.explicitStreak+1:0;next.resolve();}
  else if(--slots.active===0)slots.explicitStreak=0;
}
export function preparationSlot(job,priority=false){
  let entry;
  const ready=slots.active>=slots.limit?new Promise((resolve,reject)=>{entry={resolve,reject,priority};enqueue(entry);}):(slots.active++,Promise.resolve());
  const pending=(async()=>{
    await ready;
    try{return await job();}finally{queued.delete(pending);releaseSlot();}
  })();
  if(entry)queued.set(pending,entry);
  return pending;
}
const excluded=relative=>relative.split('/').some(part=>['.git','dist','artifacts','.wxt','coverage'].includes(part))||relative.startsWith('.opendesk/remote-build/');

export class LocalProjectPreparation{
  constructor(resolver,{debounceMs=400,maxDebounceMs=1600,pollMs=2000}={}){
    if(!Number.isInteger(debounceMs)||debounceMs<10||debounceMs>2000||!Number.isInteger(maxDebounceMs)||maxDebounceMs<debounceMs||maxDebounceMs>5000||!Number.isInteger(pollMs)||pollMs<100)throw devError('E_SCHEMA','Invalid preparation timing configuration');
    this.resolver=resolver;this.options={debounceMs,maxDebounceMs,pollMs};this.rows=new Map();this.listeners=new Set();
  }
  subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
  emit(){for(const fn of this.listeners)try{fn();}catch{}}
  generation(id){return this.rows.get(id)?.generation||0;}
  token(id){return this.rows.get(id);}
  status(id){const row=this.rows.get(id);return row?{state:row.state,sourceRevision:row.result?.inputHash||this.resolver.failures.get(id)?.inputHash,sourceHash:row.result?.sourceHash,artifactId:row.result?.artifactId,buildCount:this.resolver.buildCounts.get(id)||0,cacheHits:row.cacheHits,preparations:row.preparations,superseded:row.superseded,debounceMs:row.delay,notificationToStartMs:row.notificationToStartMs||0,...(row.result?{timings:row.result.timings}:{}),...(row.error?{error:row.error}:{}),watchErrors:row.watchErrors}: {state:'unprepared'};}
  start(id){
    if(this.rows.has(id))return;
    const binding=this.resolver.get(id);
    // A generic file workspace has no preparation lifecycle and never runs a script.
    if(!binding.single){try{const pkg=JSON.parse(safeRead(binding.root,path.join(binding.root,'package.json'),65536).bytes.toString('utf8'));if(pkg.opendesk?.format!=='opendesk.project.v1')return;}catch{return;}}
    const row={generation:0,state:'updating',delay:this.options.debounceMs,watchers:new Map(),files:new Set(),pending:false,running:false,closed:false,buildCount:0,cacheHits:0,preparations:0,superseded:0,watchErrors:0};
    this.rows.set(id,row);this.watch(id);this.schedule(id,0);
    // Content verification catches missed fs.watch events and atomic directory replacement.
    row.poll=setInterval(()=>{if(!row.running&&!row.timer)this.schedule(id,0,true);},this.options.pollMs);row.poll.unref?.();
  }
  watch(id){
    const row=this.rows.get(id);if(!row||row.closed)return;
    const binding=this.resolver.get(id),files=this.resolver.cache.get(id)?.files||[];
    row.files=new Set([binding.single?path.basename(binding.path):'package.json',...files.map(x=>x.path),'package-lock.json','opendesk.remote-lock.json']);
    const dirs=new Set([binding.root]);
    for(const file of row.files){let dir=path.dirname(path.join(binding.root,file));while(dir.startsWith(binding.root+path.sep)){dirs.add(dir);dir=path.dirname(dir);}}
    // Watch entry directory even before the first successful graph is available.
    if(!binding.single)try{const pkg=JSON.parse(safeRead(binding.root,path.join(binding.root,'package.json'),65536).bytes.toString('utf8'));const entry=path.resolve(binding.root,pkg.opendesk.entry);if(entry.startsWith(binding.root+path.sep))dirs.add(path.dirname(entry));}catch{}
    for(const [dir,watcher] of row.watchers)if(!dirs.has(dir)){watcher.close();row.watchers.delete(dir);}
    for(const dir of dirs){
      if(row.watchers.has(dir))continue;
      try{
        // Check every ancestor: fs.watch must never follow a replaced symlink.
        let current=binding.root;for(const part of path.relative(binding.root,dir).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('symlink');}
        const identity=fs.lstatSync(binding.root,{bigint:true});
        if(identity.isSymbolicLink()||String(identity.dev)+':'+String(identity.ino)!==binding.rootIdentity||!fs.lstatSync(dir).isDirectory())continue;
        const watcher=fs.watch(dir,{persistent:false},(event,name)=>{
          const file=name?path.relative(binding.root,path.join(dir,String(name))).split(path.sep).join('/'):null;
          if(file&&excluded(file))return;
          if(!file||event==='rename'||row.files.has(file))this.changed(id);
        });
        watcher.on('error',()=>{row.watchErrors++;watcher.close();row.watchers.delete(dir);this.changed(id);});row.watchers.set(dir,watcher);
      }catch{row.watchErrors++;}
    }
  }
  changed(id){
    const row=this.rows.get(id);if(!row||row.closed)return;
    row.generation++;row.notifiedAt=performance.now();row.pending=true;row.error=null;row.state='merging';this.emit();this.schedule(id,row.delay);
  }
  schedule(id,delay,poll=false){
    const row=this.rows.get(id);if(!row||row.closed)return;
    clearTimeout(row.timer);row.timer=setTimeout(()=>{row.timer=null;void this.prepare(id,poll);},delay);row.timer.unref?.();
  }
  async prepare(id,poll=false){
    const row=this.rows.get(id);if(!row||row.closed)return;
    if(row.running){row.pending=true;return;}
    row.running=true;row.pending=false;
    if(!poll){row.state='updating';this.emit();}
    const generation=row.generation;row.preparations++;
    try{
      const result=await this.resolver.resolve(id,{background:true});
      if(!row.closed&&generation===row.generation){
        if(!poll&&row.notifiedAt){row.notificationToStartMs=performance.now()-row.notifiedAt-result.timings.totalMs;row.notifiedAt=0;}
        this.published(id,result);
      }
    }catch(error){if(!row.closed){
      if(generation!==row.generation||error.code==='E_PROJECT_CHANGED'&&!/root was replaced/.test(error.message)){
        row.superseded++;row.delay=Math.min(this.options.maxDebounceMs,row.delay+this.options.debounceMs);row.pending=true;row.state='merging';
      }else{row.state='source-error';row.error={code:error.code||'E_DEV_SOURCE',message:error.message,location:error.location};row.result=null;}
      this.emit();
    }}finally{
      row.running=false;
      if(!row.closed){this.watch(id);if(row.pending&&!row.timer)this.schedule(id,row.delay);}
    }
  }
  published(id,result){
    const row=this.rows.get(id);if(!row||row.closed)return;
    if(row.result===result)return;
    row.result=result;row.buildCount+=result.timings.buildCount;row.cacheHits+=Number(result.cacheHit);row.state='ready';row.error=null;row.delay=this.options.debounceMs;this.watch(id);this.emit();
  }
  stop(id){const row=this.rows.get(id);if(!row)return;row.closed=true;row.generation++;cancelPreparation(this.resolver.inflight.get(id));clearTimeout(row.timer);clearInterval(row.poll);for(const watcher of row.watchers.values())watcher.close();this.rows.delete(id);this.resolver.cache.delete(id);this.resolver.failures.delete(id);}
  stopAll(){for(const id of this.rows.keys())this.stop(id);}
  close(){this.stopAll();this.listeners.clear();}
  resources(){return {projects:this.rows.size,watchers:[...this.rows.values()].reduce((n,row)=>n+row.watchers.size,0),timers:[...this.rows.values()].reduce((n,row)=>n+Number(!!row.timer)+Number(!!row.poll),0),active:slots.active,queued:slots.queue.length,inflight:this.resolver.inflight.size};}
}
