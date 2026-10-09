import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';

const filename=resolve('.wxt/development.lock');
async function existingLock() {
  try {return JSON.parse(await readFile(filename,'utf8'));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export async function assertDevelopmentStopped() {
  const lock=await existingLock();if(!lock)return;
  try {process.kill(lock.pid,0);}
  catch(error){if(error.code==='ESRCH')return;throw error;}
  throw Error(`Output owner PID ${lock.pid} (${lock.kind||'development'}) owns dist/development and .wxt/public. Stop it with Ctrl+C before building or starting another service.`);
}
// An OS-owned loopback socket releases even after SIGKILL. Unlike a stale
// filesystem recovery fence, it requires no unsafe compare-and-unlink race.
export async function acquireDevelopmentLock(kind='development',{port=43120}={}) {
  await mkdir(resolve('.wxt'),{recursive:true});
  const guard=createServer(socket=>socket.destroy());
  await new Promise((resolveReady,reject)=>{
    guard.once('error',error=>reject(Error(`Output guard 127.0.0.1:${port} unavailable (${error.code}). Another service/build may be running; stop its owner before retrying.`)));
    guard.listen({host:'127.0.0.1',port,exclusive:true},resolveReady);
  });
  const close=()=>new Promise(resolveClosed=>guard.close(resolveClosed));
  const lock={pid:process.pid,token:randomUUID(),kind,root:process.cwd(),startedAt:new Date().toISOString()};
  try {await assertDevelopmentStopped();await writeFile(filename,JSON.stringify(lock));}
  catch(error){await close();throw error;}
  let released=false;
  return async()=>{
    if(released)return;released=true;
    try{if((await existingLock())?.token===lock.token)await unlink(filename);}
    finally{await close();}
  };
}
