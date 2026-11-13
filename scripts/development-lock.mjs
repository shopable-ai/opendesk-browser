import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const filename=resolve('.wxt/development.lock');
const runFile=promisify(execFile);
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
export function outputGuardPort(value=process.env.OPENDESK_OUTPUT_GUARD_PORT) {
  if(value===undefined)return 43120;
  if(!/^[1-9]\d{0,4}$/.test(String(value))||Number(value)>65535)
    throw Error('OPENDESK_OUTPUT_GUARD_PORT must be a port from 1 to 65535');
  return Number(value);
}
async function busyOutputOwner(port) {
  try {
    const lock=await existingLock();
    if(!Number.isSafeInteger(lock?.pid)||lock.pid<=0||!lock.token||lock.root!==process.cwd())return null;
    process.kill(lock.pid,0);
    // A live PID in a stale lock is not enough: confirm it owns this exact
    // loopback listener. If lsof is unavailable, keep refusing the conflict.
    const {stdout}=await runFile('lsof',['-nP','-a','-p',String(lock.pid),
      `-iTCP@127.0.0.1:${port}`,'-sTCP:LISTEN','-Fp'],{timeout:1500,maxBuffer:16384});
    const pids=stdout.split(/\r?\n/).filter(line=>line.startsWith('p'));
    if(pids.length!==1||pids[0]!==`p${lock.pid}`)return null;
    const current=await existingLock();
    return current?.token===lock.token&&current.pid===lock.pid&&current.root===lock.root&&
      current.kind===lock.kind?lock:null;
  }catch{return null;}
}
export async function acquireDevelopmentLock(kind='development',{port=outputGuardPort()}={}) {
  await mkdir(resolve('.wxt'),{recursive:true});
  const guard=createServer(socket=>socket.destroy());
  try {
    await new Promise((resolveReady,reject)=>{
      guard.once('error',reject);
      guard.listen({host:'127.0.0.1',port,exclusive:true},resolveReady);
    });
  }catch(cause){
    const owner=cause.code==='EADDRINUSE'?await busyOutputOwner(port):null;
    const detail=owner?`Output owner PID ${owner.pid} (${owner.kind}) already owns dist/development and .wxt/public. Reuse its service or stop it in its original terminal before retrying.`:
      'Another service/build may be running; inspect its owner before retrying.';
    throw Object.assign(Error(`Output guard 127.0.0.1:${port} unavailable (${cause.code}). ${detail}`,{cause}),
      {code:cause.code==='EADDRINUSE'?'E_OUTPUT_GUARD_BUSY':cause.code,owner});
  }
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
