import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {projectError} from '../../scripts/validate-program-project.mjs';

export const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const devError=(code,message,location)=>projectError(code,message,{phase:'local-dev',...(location?{location}:{})});
export const inside=(root,file)=>file===root||file.startsWith(root+path.sep);
const fingerprint=stat=>['dev','ino','size','mtimeNs','ctimeNs'].map(k=>String(stat[k])).join(':');
const sensitive=part=>part.startsWith('.')||/^(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)/i.test(part)||/\.(?:pem|key|p12|pfx)$/i.test(part);
function components(root,file){
  if(!inside(root,file))throw devError('E_DEV_PATH','Path escapes the authorized project');
  const relative=path.relative(root,file),parts=relative?relative.split(path.sep):[];
  if(parts.some(sensitive))throw devError('E_DEV_SENSITIVE','Hidden or credential files are not development inputs',relative);
  let next=root;
  for(const part of ['',...parts]){
    if(part)next=path.join(next,part);
    const stat=fs.lstatSync(next,{bigint:true});
    if(stat.isSymbolicLink())throw devError('E_DEV_SYMLINK','Symbolic links are not allowed in local development inputs',relative);
  }
}
export function safeRead(root,file,limit){
  let fd;
  try{
    components(root,file);
    fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
    const before=fs.fstatSync(fd,{bigint:true});
    if(!before.isFile()||before.size>BigInt(limit))throw devError('E_DEV_LIMIT','Input must be a bounded regular file',path.relative(root,file));
    components(root,file);
    const current=fs.lstatSync(file,{bigint:true});
    if(current.dev!==before.dev||current.ino!==before.ino||fs.realpathSync(file)!==file)
      throw devError('E_PROJECT_CHANGED','Input path changed during open',path.relative(root,file));
    // Bound the actual read too: a growing file cannot bypass the stat limit.
    const buffer=Buffer.alloc(limit+1);let count=0,read;
    while(count<buffer.length&&(read=fs.readSync(fd,buffer,count,buffer.length-count,null))>0)count+=read;
    if(count>limit)throw devError('E_DEV_LIMIT','Input grew beyond its byte limit',path.relative(root,file));
    const after=fs.fstatSync(fd,{bigint:true});components(root,file);
    if(fingerprint(before)!==fingerprint(after)||fingerprint(after)!==fingerprint(fs.lstatSync(file,{bigint:true})))
      throw devError('E_PROJECT_CHANGED','Input changed while being read',path.relative(root,file));
    return {bytes:buffer.subarray(0,count),identity:fingerprint(after),limit};
  }catch(error){
    if(error.code==='ENOENT'||error.code==='ENOTDIR')throw devError('E_PROJECT_FILE','Required source file is missing',path.relative(root,file));
    throw error;
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}

export function createSnapshot(root,{maxBytes=384*1024,maxFiles=100}={}){
  const rootStat=fs.lstatSync(root,{bigint:true}),rootIdentity=String(rootStat.dev)+':'+String(rootStat.ino);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw devError('E_DEV_PATH','Project root must be a real directory');
  const rows=new Map();let total=0;
  function assertRoot(){
    const value=fs.lstatSync(root,{bigint:true});
    if(value.isSymbolicLink()||String(value.dev)+':'+String(value.ino)!==rootIdentity)
      throw devError('E_PROJECT_CHANGED','The bound project directory was replaced');
  }
  function read(relative,limit=256*1024){
    assertRoot();
    const file=path.resolve(root,relative);
    if(rows.has(file))return Buffer.from(rows.get(file).bytes);
    const row=safeRead(root,file,limit);
    if(rows.size>=maxFiles||total+row.bytes.length>maxBytes)throw devError('E_DEV_LIMIT','Development source graph exceeds its input budget');
    total+=row.bytes.length;rows.set(file,row);return Buffer.from(row.bytes);
  }
  function verify(){
    assertRoot();
    for(const [file,row] of rows){
      const actual=safeRead(root,file,row.limit);
      if(actual.identity!==row.identity||!actual.bytes.equals(row.bytes))
        throw devError('E_PROJECT_CHANGED','Source changed during resolution; run again after saving',path.relative(root,file));
    }
  }
  return {root,rows,read,verify,manifest:()=>[...rows].map(([file,row])=>({path:path.relative(root,file).split(path.sep).join('/'),bytes:row.bytes.length,sha256:sha256(row.bytes)})).sort((a,b)=>a.path.localeCompare(b.path))};
}

// Webpack sees ONLY the frozen input graph. Missing files cannot fall back to disk.
export function snapshotFileSystem(input){
  const files=new Map([...input].map(([file,bytes])=>[path.resolve(file),Buffer.from(bytes)])),directories=new Set();
  for(const file of files.keys()){let dir=path.dirname(file);for(;;){directories.add(dir);const parent=path.dirname(dir);if(parent===dir)break;dir=parent;}}
  const absent=file=>Object.assign(new Error('ENOENT: frozen input is unavailable'),{code:'ENOENT',path:file});
  const info=file=>{const f=files.has(file),d=directories.has(file);if(!f&&!d)throw absent(file);return {isFile:()=>f,isDirectory:()=>d,isSymbolicLink:()=>false,size:f?files.get(file).length:0,mtime:new Date(0),ctime:new Date(0),mtimeMs:0,ctimeMs:0};};
  const callback=fn=>(...args)=>{const cb=args.pop();try{cb(null,fn(...args));}catch(error){cb(error);}};
  return {
    readFile:callback((file,options)=>{file=path.resolve(file);if(!files.has(file))throw absent(file);const bytes=Buffer.from(files.get(file));return typeof options==='string'?bytes.toString(options):options?.encoding?bytes.toString(options.encoding):bytes;}),
    stat:callback(file=>info(path.resolve(file))),lstat:callback(file=>info(path.resolve(file))),
    realpath:callback(file=>{file=path.resolve(file);info(file);return file;}),
    readlink:callback(file=>{throw Object.assign(new Error('Not a symbolic link'),{code:'EINVAL',path:file});}),
    readdir:callback(file=>{file=path.resolve(file);if(!directories.has(file))throw absent(file);return [...new Set([...files.keys(),...directories].filter(x=>x!==file&&path.dirname(x)===file).map(x=>path.basename(x)))];}),
    purge(){},join:path.join
  };
}
