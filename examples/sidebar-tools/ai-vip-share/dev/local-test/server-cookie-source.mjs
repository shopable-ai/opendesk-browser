import {openSync, closeSync, fstatSync, readSync, constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {preflightCookieFile} from '../../src/local-cookie-file.js';

const MAX_BYTES=64*1024;
export const cookieSourceError=()=>Object.assign(new Error('Server cookie source unavailable or invalid'),
  {code:'E_COOKIE_SOURCE',status:503});

// Both injected arrays and disk exports pass the same complete-file preflight.
export function checkServerCookieSource(rows,now=Date.now()){
  try{
    const text=JSON.stringify(rows);
    const checked=preflightCookieFile(text,now);
    if(!checked.count)throw cookieSourceError();
    return {cookies:JSON.parse(text),checked,
      revision:createHash('sha256').update(text).digest('hex')};
  }catch{throw cookieSourceError();}
}

/** Read-only, bounded regular-file reader. Returns the original export array, never metadata. */
export function createServerCookieSource(file,{now=Date.now}={}){
  return ()=>{
    let fd;
    try{
      fd=openSync(file,constants.O_RDONLY|constants.O_NONBLOCK|constants.O_NOFOLLOW);
      const stat=fstatSync(fd);
      if(!stat.isFile()||stat.size>MAX_BYTES)throw cookieSourceError();
      const buffer=Buffer.alloc(MAX_BYTES+1);
      let size=0,read;
      while(size<buffer.length&&(read=readSync(fd,buffer,size,buffer.length-size,null))>0)size+=read;
      if(size>MAX_BYTES)throw cookieSourceError();
      const rows=JSON.parse(buffer.subarray(0,size).toString('utf8'));
      return checkServerCookieSource(rows,now()).cookies;
    }catch{throw cookieSourceError();}
    finally{if(fd!==undefined)closeSync(fd);}
  };
}
