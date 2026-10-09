import assert from 'node:assert/strict';
import net from 'node:net';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';

assert.equal(process.permission.has('net'),false,'offline builder must have OS API network permission denied');
await new Promise((resolve,reject)=>{
  const socket=net.connect({host:'192.0.2.1',port:443});
  socket.once('connect',()=>{socket.destroy();reject(Error('Offline process unexpectedly connected'));});
  socket.once('error',error=>{try{assert.equal(error.code,'ERR_ACCESS_DENIED');resolve();}catch(e){reject(e);}});
});
const artifact=await buildProgramProject(process.argv[2],{outputDirectory:process.argv[3]});
process.stdout.write(JSON.stringify({networkPermission:false,probe:'ERR_ACCESS_DENIED',artifact})+'\n');
