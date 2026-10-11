// Trusted build-time source transformation for the exact pinned axios@1.20.0
// browser library. Never ship this script, inject it at runtime, or weaken
// the global packaged-script AST restrictions. Fail when reviewed source drifts.
const nodeBufferProbe=`function isBuffer(val) {
  return (
    val !== null &&
    !isUndefined(val) &&
    val.constructor !== null &&
    !isUndefined(val.constructor) &&
    isFunction(val.constructor.isBuffer) &&
    val.constructor.isBuffer(val)
  );
}`;
const headersProbe='header instanceof this.constructor';
const concatProbe='return this.constructor.concat(this, ...targets);';

export function transformPinnedAxiosBrowserSource(code,id){
  const module=String(id).split('?')[0].replaceAll('\\','/');
  if(module.endsWith('/node_modules/axios/lib/utils.js')){
    if(typeof code!=='string'||code.split(nodeBufferProbe).length!==2)
      throw Error('Pinned Axios browser Buffer probe drift: re-audit upstream source');
    // Browser Page has no Node Buffer. Avoid user-value constructor reflection.
    return code.replace(nodeBufferProbe,'function isBuffer(val) { return false; }');
  }
  if(module.endsWith('/node_modules/axios/lib/core/AxiosHeaders.js')){
    if(typeof code!=='string'||code.split(headersProbe).length!==2||
       code.split(concatProbe).length!==2||!code.includes('class AxiosHeaders'))
      throw Error('Pinned AxiosHeaders instance check drift: re-audit upstream');
    // The dynamic constructor read is unnecessary for an actual AxiosHeaders.
    // This class's concat method already delegates to the pinned static helper.
    // Avoid reading a dynamic constructor. AxiosHeaders subclasses are not
    // part of the explicitly reviewed Page facade.
    return code.replace(headersProbe,'header instanceof AxiosHeaders')
      .replace(concatProbe,'return AxiosHeaders.concat(this, ...targets);');
  }
  return null;
}
