// Expose this lane's fixtures through the existing canonical server. No server restart.
import {lstat,readlink,symlink,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const mount=new URL('../../../tasks/scrapyjs-fixtures',import.meta.url);
const target='../sidebar-tools/scrapyjs/fixtures';
const action=process.argv[2]||'check';
if(!['mount','unmount','check'].includes(action))throw Error('Use mount, unmount or check');
let present=false;
try{
  const st=await lstat(mount);
  if(!st.isSymbolicLink()||await readlink(mount)!==target)throw Error('Fixture URL occupied by another owner; untouched');
  present=true;
}catch(error){if(error.code!=='ENOENT')throw error;}
if(action==='mount'&&!present){await symlink(target,mount,'dir');present=true;}
if(action==='unmount'&&present){await unlink(mount);present=false;}
console.log(JSON.stringify({mount:fileURLToPath(mount),target,present,server:'http://127.0.0.1:43111',canonicalDemoModified:false}));
