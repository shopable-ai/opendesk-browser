// file-saver@2.0.5: explicit Page USER_SCRIPT only, no URL download authority.
import FileSaverModule from 'file-saver';

const fail=(code,message)=>Object.assign(new Error(message),{code});
export function installPageFileSaver(scope=globalThis){
  if(!scope.document||typeof scope.Blob!=='function')
    throw fail('E_BUILTIN_WORLD','FileSaver requires Page and Blob');
  if(Object.hasOwn(scope,'FileSaver'))
    throw fail('E_BUILTIN_COLLISION','FileSaver global already exists');
  const upstreamSaveAs=FileSaverModule?.saveAs;
  if(typeof upstreamSaveAs!=='function')
    throw fail('E_BUILTIN_VERSION_UNAVAILABLE','Upstream file-saver API changed');
  function saveAs(blob,filename,options={}){
    if(!(blob instanceof scope.Blob))
      throw fail('E_CONFIG_UNSUPPORTED','FileSaver accepts Blob/File only, not URLs');
    if(typeof filename!=='string'||filename.length<1||filename.length>200||
      filename.includes('/')||filename.includes('\\')||/[\x00-\x1f\x7f]/.test(filename)||
      filename==='.'||filename==='..')
      throw fail('E_CONFIG_UNSUPPORTED','Expected filename without directory separators');
    if(!options||Object.getPrototypeOf(options)!==Object.prototype||
      Object.keys(options).some(key=>key!=='autoBom')||
      (Object.hasOwn(options,'autoBom')&&typeof options.autoBom!=='boolean'))
      throw fail('E_CONFIG_UNSUPPORTED','Only autoBom boolean option is supported');
    if(blob.size>64*1024*1024)throw fail('E_LIMIT','FileSaver Blob exceeds 64 MiB');
    // Browser may require transient user activation. Return is NOT disk receipt.
    return upstreamSaveAs(blob,filename,options);
  }
  Object.defineProperty(scope,'FileSaver',{value:Object.freeze({saveAs}),
    configurable:false,writable:false,enumerable:false});
}
