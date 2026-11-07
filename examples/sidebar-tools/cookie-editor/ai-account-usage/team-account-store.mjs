// Private team metadata, invitation references and receipts; no raw Cookies.
import {constants} from 'node:fs';
import {open, mkdir, lstat, rename, unlink} from 'node:fs/promises';
import {join, isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {bindingError} from './service-binding-store.mjs';
import {validateTeamState as validate} from './team-accounts.mjs';
const file='team-accounts-v1.json',lockFile='.team-accounts-v1.lock',maxBytes=8*1024*1024;
const empty=()=>({schemaVersion:1,accounts:[],assignments:[],operations:[],invitations:[]});
async function check(path,directory=false) {
  const stat=await lstat(path);
  if(stat.isSymbolicLink() || (directory?!stat.isDirectory():!stat.isFile()) || (stat.mode&0o077) ||
      (process.getuid && stat.uid!==process.getuid()))throw bindingError('STORE_PERMISSIONS',503);
  return stat;
}
export class TeamAccountStore {
  #directory;#queue=Promise.resolve();
  constructor({directory=join(homedir(),'.opendesk','ai-account-usage')}={}) {
    if(typeof directory!=='string'||!isAbsolute(directory))throw bindingError('STORE_DIRECTORY');
    this.#directory=directory;
  }
  async #init(){await mkdir(this.#directory,{recursive:true,mode:0o700});await check(this.#directory,true);}
  async #load(){
    await this.#init();let handle;
    try {
      await check(join(this.#directory,file));
      handle=await open(join(this.#directory,file),constants.O_RDONLY|constants.O_NOFOLLOW);
      const stat=await handle.stat();
      if(!stat.isFile()||(stat.mode&0o077)||(process.getuid&&stat.uid!==process.getuid()))throw bindingError('STORE_PERMISSIONS',503);
      if(stat.size>maxBytes)throw bindingError('STORE_SIZE',503);
      const body=await handle.readFile();if(body.length>maxBytes)throw bindingError('STORE_SIZE',503);
      let parsed;try{parsed=JSON.parse(body.toString('utf8'));}catch{throw bindingError('STORE_SCHEMA',503);}
      return validate(parsed);
    }catch(error){if(error.code==='ENOENT')return empty();if(error.status)throw error;throw bindingError('STORE_READ',503);}
    finally{await handle?.close();}
  }
  #serial(run){const task=this.#queue.then(run,run);this.#queue=task.catch(()=>{});return task;}
  read(){return this.#serial(()=>this.#load());}
  transact(run,{withAuthorization=run=>run()}={}){return this.#serial(async()=>{
    await this.#init();const path=join(this.#directory,lockFile);let lock;
    try{lock=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);}
    catch(error){throw bindingError(error.code==='EEXIST'?'STORE_BUSY':'STORE_WRITE',503);}
    const temp=join(this.#directory,`.team-accounts-${randomUUID()}.tmp`);let handle;
    try {
      const lockStat=await lock.stat();
      if(!lockStat.isFile()||(lockStat.mode&0o077)||(process.getuid&&lockStat.uid!==process.getuid()))throw bindingError('STORE_PERMISSIONS',503);
      // Acquire authority only after the team queue/lock, and retain it through
      // the durable receipt write so revocation cannot interleave with commit.
      return await withAuthorization(async authority=>{
        const state=await this.#load(),result=await run(state,authority);
        if(Buffer.byteLength(JSON.stringify(result)??'')>65536)throw bindingError('STORE_RESULT_SIZE',503);
        validate(state);
        const body=JSON.stringify(state);if(Buffer.byteLength(body)>maxBytes)throw bindingError('STORE_SIZE',503);
        handle=await open(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
        await handle.writeFile(body);await handle.sync();await handle.close();handle=null;
        await rename(temp,join(this.#directory,file));
        const directoryHandle=await open(this.#directory,constants.O_RDONLY|constants.O_NOFOLLOW);
        try{await directoryHandle.sync();}finally{await directoryHandle.close();}
        return structuredClone(result);
      });
    }catch(error){if(error.status)throw error;throw bindingError('STORE_WRITE',503);
    }finally{
      await handle?.close();await unlink(temp).catch(()=>{});
      try{const held=await lock.stat(),current=await lstat(path);
        if(current.isSymbolicLink()||held.ino!==current.ino||held.dev!==current.dev)throw bindingError('STORE_BUSY',503);
        await unlink(path);
      }catch(error){if(error.status)throw error;throw bindingError('STORE_WRITE',503);}
      finally{await lock.close();}
    }
  });}
}
